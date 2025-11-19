// src/services/recipeService.js
import prisma from '../db/prismaClient.js';
import axios from 'axios';
import NodeCache from 'node-cache';

// Initialize cache with 24-hour TTL
const recipeCache = new NodeCache({ stdTTL: 86400, maxKeys: 1000 });

/**
 * Calcola la distanza "macro" (Manhattan) tra target e ricetta.
 * Più è bassa, più la ricetta è vicina al target.
 */
function macroDistance(target, recipe) {
  const dp = Math.abs((recipe.proteinPerServing ?? 0) - target.protein);
  const dc = Math.abs((recipe.carbsPerServing ?? 0) - target.carbs);
  const df = Math.abs((recipe.fatPerServing ?? 0) - target.fat);
  return dp + dc + df;
}

/**
 * Normalizza una lista separata da virgole in array di stringhe lowercased.
 */
function normalizeList(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifica se una ricetta viola le preferenze (ingredienti esclusi, ecc.)
 */
function violatesPreferences(recipe, preferences) {
  if (!preferences) return false;

  // 1) Ingredienti esclusi
  const excluded = normalizeList(preferences.excludedIngredients);
  if (excluded.length) {
    const recipeIngredients = normalizeList(recipe.ingredients);
    const hasExcluded = recipeIngredients.some((ing) =>
      excluded.some((ex) => ing.includes(ex))
    );
    if (hasExcluded) return true;
  }

  // qui potremmo aggiungere altri vincoli (es. effort, cuisine) in futuro
  return false;
}

/**
 * Trova la miglior ricetta per un pasto, considerando:
 * - tipo di pasto (mealType)
 * - target macro
 * - preferenze utente
 * - weeklyIntent (per ora non usato, ma già previsto)
 */
export async function findRecipeForMeal({ mealType, macros, preferences, weeklyIntent }) {
  // 1) Carica tutte le ricette
  let recipes = await prisma.recipe.findMany();

  if (!recipes.length) {
    return null;
  }

  // 2) Filtra per tipo di pasto se la ricetta ha mealType impostato
  if (mealType) {
    recipes = recipes.filter((r) => !r.mealType || r.mealType === mealType);
  }

  // 3) Filtra per preferenze (ingredienti esclusi, ecc.)
  recipes = recipes.filter((recipe) => !violatesPreferences(recipe, preferences));

  if (!recipes.length) {
    // Nessuna ricetta valida per questo pasto con queste preferenze
    return null;
  }

  let best = null;
  let bestScore = Infinity;

  for (const recipe of recipes) {
    const distance = macroDistance(macros, recipe);

    // 4) Applichiamo un piccolo "bonus" se l'utente vuole alta sazietà
    //    e la ricetta ha il tag high_satiety.
    let bonus = 0;
    if (preferences?.satietyLevel === 'high') {
      const tags = normalizeList(recipe.tags);
      if (!tags.includes('high_satiety')) {
        bonus += 10; // penalità se NON è high_satiety
      }
    }

    const score = distance + bonus;

    if (score < bestScore) {
      bestScore = score;
      best = recipe;
    }
  }

  // 5) Se la distanza è troppo alta, meglio non assegnare alcuna ricetta
  const MAX_DISTANCE = 80;
  if (bestScore > MAX_DISTANCE) {
    return null;
  }

  return best;
}

// ===== SECTION E: EXTERNAL API INTEGRATION =====

/**
 * Search external recipes from Edamam API
 */
export async function searchExternalRecipes(query, options = {}) {
  const { limit = 20 } = options;

  // Check for API credentials
  const appId = process.env.EDAMAM_APP_ID;
  const appKey = process.env.EDAMAM_APP_KEY;

  if (!appId || !appKey) {
    console.warn('Edamam API credentials not configured');
    return [];
  }

  // Check cache first
  const cacheKey = 'edamam:' + query + ':' + limit;
  const cachedResult = recipeCache.get(cacheKey);
  if (cachedResult) {
    console.log('Returning cached Edamam results for:', query);
    return cachedResult;
  }

  try {
    const response = await _callEdamamWithRetry(query, appId, appKey, limit);

    // Normalize Edamam response to Prisma Recipe format
    const normalizedRecipes = response.data.hits.map((hit) => {
      const recipe = hit.recipe;
      const servings = recipe.yield || 1;

      return {
        title: recipe.label,
        ingredients: recipe.ingredientLines,
        instructions: recipe.url, // Edamam provides URL, not full instructions
        calories: Math.round(recipe.calories / servings),
        protein: Math.round(recipe.totalNutrients.PROCNT?.quantity / servings || 0),
        carbs: Math.round(recipe.totalNutrients.CHOCDF?.quantity / servings || 0),
        fats: Math.round(recipe.totalNutrients.FAT?.quantity / servings || 0),
        imageUrl: recipe.image,
        source: 'edamam',
        externalId: recipe.uri,
        servings: servings,
        sourceUrl: recipe.url,
      };
    });

    // Cache the results
    recipeCache.set(cacheKey, normalizedRecipes);

    return normalizedRecipes;
  } catch (error) {
    console.error('Edamam API error:', error.message);
    // Return empty array on failure (non-critical)
    return [];
  }
}

/**
 * Call Edamam API with retry logic
 */
async function _callEdamamWithRetry(query, appId, appKey, limit, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get('https://api.edamam.com/api/recipes/v2', {
        params: {
          type: 'public',
          q: query,
          app_id: appId,
          app_key: appKey,
          to: limit,
        },
        timeout: 5000,
      });

      return response;
    } catch (error) {
      lastError = error;

      // Retry on network errors or 503
      if ((error.code === 'ECONNRESET' || error.response?.status === 503) && attempt < maxRetries) {
        const delay = 500 * attempt; // Linear backoff: 500ms, 1000ms
        console.log('Edamam API error, retrying in ' + delay + 'ms... (attempt ' + attempt + '/' + maxRetries + ')');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export default {
  findRecipeForMeal,
  searchExternalRecipes,
};
