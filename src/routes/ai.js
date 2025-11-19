// src/routes/ai.js
import express from 'express';
import aiPlanController from '../controllers/aiPlanController.js';

const router = express.Router();

// POST /api/ai/mealplan/generate - Generate AI meal plan
router.post('/mealplan/generate', aiPlanController.generateMealPlan);

// GET /api/ai/mealplan/:id - Get specific meal plan
router.get('/mealplan/:id', aiPlanController.getMealPlan);

export default router;
