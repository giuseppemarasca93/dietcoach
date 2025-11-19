// src/controllers/recipeController.js
import { z } from 'zod';
import recipeService from '../services/recipeService.js';

const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Query parameter is required'),
  limit: z.string().optional().transform((val) => val ? parseInt(val) : 20),
});

/**
 * GET /api/recipes/search?q=<query>&limit=<number>
 * Search for recipes from external Edamam API
 */
export async function searchExternal(req, res) {
  try {
    // Validate query parameters
    const { q, limit } = SearchQuerySchema.parse(req.query);

    // Search external recipes
    const recipes = await recipeService.searchExternalRecipes(q, { limit });

    // Add warning header if Edamam failed (empty result)
    if (recipes.length === 0 && req.query.q) {
      res.setHeader('X-External-Api-Status', 'degraded');
    }

    res.json(recipes);
  } catch (error) {
    console.error('Error searching external recipes:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: error.errors 
      });
    }

    res.status(500).json({ 
      error: 'Failed to search recipes',
      message: error.message 
    });
  }
}

export default {
  searchExternal,
};
