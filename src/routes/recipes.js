// src/routes/recipes.js
import express from 'express';
import recipeController from '../controllers/recipeController.js';

const router = express.Router();

// GET /api/recipes/search - Search external recipes
router.get('/search', recipeController.searchExternal);

export default router;
