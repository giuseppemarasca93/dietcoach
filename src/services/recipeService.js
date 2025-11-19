import prisma from '../db/prismaClient.js';

function parseCSV(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function recipeHasExcludedIngredients(recipe, excludedIngredients) {
  if (!excludedIngredients?.length) return false;
  const recipeIngredients = parseCSV(recipe.ingredients || '');
  return recipeIngredients.some((ing) => excludedIngredients.includes(ing));
}

function recipeHasRequiredTags(recipe, tagsRequired) {
  if (!tagsRequired?.length) return true;
  const recipeTags = parseCSV(recipe.tags || '');
  return tagsRequired.every((tag) => recipeTags.includes(tag));
}

function scoreRecipe(recipe, macroTarget, tagsPreferred, tagsAvoid) {
  const dP = (recipe.proteinPerServing ?? 0) - macroTarget.protein;
  const dC = (recipe.carbsPerServing ?? 0) - macroTarget.carbs;
  const dF = (recipe.fatPerServing ?? 0) - macroTarget.fat;

  let score = Math.sqrt(dP * dP + dC * dC + dF * dF);

  const tags = parseCSV(recipe.tags || '');

  // bonus per tag preferiti
  if (tagsPreferred?.length) {
    tagsPreferred.forEach((pref) => {
      if (tags.includes(pref)) score -= 5;
    });
  }

  // malus per tag da evitare
  if (tagsAvoid?.length) {
    tagsAvoid.forEach((bad) => {
      if (tags.includes(bad)) score += 5;
    });
  }

  return score;
}

/**
 * NUOVA FUNZIONE usata da planService.js
 * Seleziona la ricetta "migliore" per un pasto:
 * - filtra per mealType
 * - esclude ingredienti vietati
 * - rispetta tagRequired
 * - usa i macro per il punteggio
 */
export async function getBestRecipeForMeal({
  mealType,
  macroTarget,
  excludedIngredients = [],
  tagsRequired = [],
  tagsPreferred = [],
  tagsAvoid = [],
}) {
  const recipes = await prisma.recipe.findMany({
    where: { mealType },
  });

  if (!recipes.length) return null;

  const filtered = recipes.filter((r) => {
    if (recipeHasExcludedIngredients(r, excludedIngredients)) return false;
    if (!recipeHasRequiredTags(r, tagsRequired)) return false;
    return true;
  });

  if (!filtered.length) return null;

  let best = filtered[0];
  let bestScore = scoreRecipe(best, macroTarget, tagsPreferred, tagsAvoid);

  for (let i = 1; i < filtered.length; i++) {
    const r = filtered[i];
    const s = scoreRecipe(r, macroTarget, tagsPreferred, tagsAvoid);
    if (s < bestScore) {
      best = r;
      bestScore = s;
    }
  }

  return best;
}

/**
 * Vecchio nome, lasciato come alias per compatibilità (se mai servisse)
 */
export async function findRecipeForMeal(params) {
  const { mealType, macros, preferences, weeklyIntent } = params;

  const macroTarget = macros || {
    protein: 0,
    carbs: 0,
    fat: 0,
  };

  // per ora non usiamo ancora preferences/weeklyIntent qui
  return getBestRecipeForMeal({
    mealType,
    macroTarget,
    excludedIngredients: [],
    tagsRequired: [],
    tagsPreferred: [],
    tagsAvoid: [],
  });
}
