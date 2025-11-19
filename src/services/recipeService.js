// src/services/recipeService.js
import prisma from '../db/prismaClient.js';

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
