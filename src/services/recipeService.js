import prisma from '../db/prismaClient.js';

/**
 * Calculate Manhattan distance between target macros and recipe macros
 * @param {Object} target - Target macros {protein, carbs, fat}
 * @param {Object} recipe - Recipe with macro data
 * @returns {number} - Distance score (lower is better)
 */
function macroDistance(target, recipe) {
  const dp = Math.abs((recipe.proteinPerServing ?? 0) - target.protein);
  const dc = Math.abs((recipe.carbsPerServing ?? 0) - target.carbs);
  const df = Math.abs((recipe.fatPerServing ?? 0) - target.fat);
  return dp + dc + df;
}

/**
 * Finds best matching recipe for given meal parameters
 * @param {Object} params
 * @param {string} params.mealType - "breakfast" | "lunch" | "snack" | "dinner"
 * @param {Object} params.macros - { protein, carbs, fat }
 * @param {Object} params.preferences - User preferences object
 * @param {Object} params.weeklyIntent - Weekly intent object
 * @returns {Promise<Object|null>} - Best matching recipe or null
 */
export async function findRecipeForMeal({ mealType, macros, preferences, weeklyIntent }) {
  // Fetch all available recipes from database
  const recipes = await prisma.recipe.findMany();
  
  if (!recipes.length) {
    return null;
  }

  let best = null;
  let bestDistance = Infinity;

  // Find recipe with minimum macro distance
  for (const recipe of recipes) {
    const distance = macroDistance(macros, recipe);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = recipe;
    }
  }

  // Maximum acceptable distance threshold
  const MAX_DISTANCE = 80;
  if (bestDistance > MAX_DISTANCE) {
    return null;
  }

  return best;
}
