// src/controllers/aiPlanController.js
import { z } from 'zod';
import aiPlanService from '../services/aiPlanService.js';

const GenerateMealPlanSchema = z.object({
  weekStart: z.string().optional(),
  mealsPerDay: z.number().min(3).max(6).optional().default(4),
});

/**
 * POST /api/ai/mealplan/generate
 * Generate a complete AI-powered meal plan
 */
export async function generateMealPlan(req, res) {
  try {
    // Validate request body
    const validatedData = GenerateMealPlanSchema.parse(req.body);

    // Generate meal plan
    const mealPlan = await aiPlanService.generateMealPlan(validatedData);

    res.status(201).json(mealPlan);
  } catch (error) {
    console.error('Error generating AI meal plan:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }

    if (error.message?.includes('Excluded ingredient')) {
      return res.status(400).json({ 
        error: error.message,
        suggestion: 'Try regenerating the meal plan or adjust your exclusions'
      });
    }

    if (error.message?.includes('MacroProfile')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.status === 429) {
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable due to rate limits',
        retryAfter: 60
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate meal plan',
      message: error.message 
    });
  }
}

/**
 * GET /api/ai/mealplan/:id
 * Get a specific meal plan by ID
 */
export async function getMealPlan(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid meal plan ID' });
    }

    const mealPlan = await aiPlanService.getMealPlan(id);

    res.json(mealPlan);
  } catch (error) {
    console.error('Error fetching meal plan:', error);

    if (error.message === 'Meal plan not found') {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ 
      error: 'Failed to fetch meal plan',
      message: error.message 
    });
  }
}

export default {
  generateMealPlan,
  getMealPlan,
};
