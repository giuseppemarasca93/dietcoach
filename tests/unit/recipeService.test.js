// tests/unit/recipeService.test.js
import { describe, test, expect, beforeAll, jest } from '@jest/globals';

describe('Recipe Service', () => {
  test('should export searchExternalRecipes function', async () => {
    const recipeService = await import('../../src/services/recipeService.js');
    expect(typeof recipeService.searchExternalRecipes).toBe('function');
  });

  test('should export findRecipeForMeal function', async () => {
    const recipeService = await import('../../src/services/recipeService.js');
    expect(typeof recipeService.findRecipeForMeal).toBe('function');
  });

  test('searchExternalRecipes should return empty array when no credentials', async () => {
    // Temporarily remove env vars
    const oldAppId = process.env.EDAMAM_APP_ID;
    const oldAppKey = process.env.EDAMAM_APP_KEY;
    delete process.env.EDAMAM_APP_ID;
    delete process.env.EDAMAM_APP_KEY;

    const recipeService = await import('../../src/services/recipeService.js?cache=' + Date.now());
    const result = await recipeService.searchExternalRecipes('chicken');
    
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);

    // Restore env vars
    if (oldAppId) process.env.EDAMAM_APP_ID = oldAppId;
    if (oldAppKey) process.env.EDAMAM_APP_KEY = oldAppKey;
  });
});
