import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import prisma from './db/prismaClient.js';
import { generateWeekPlan } from './services/planService.js';

// Import new routes
import aiRoutes from './routes/ai.js';
import recipeRoutes from './routes/recipes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'DietCoach AI server is running 🚀' });
});

// ==================== NEW API ROUTES ====================
// AI-powered meal planning
app.use('/api/ai', aiRoutes);

// Recipe search (external API)
app.use('/api/recipes', recipeRoutes);

// ==================== MACRO PROFILE ENDPOINTS ====================

// Get MacroProfile (first one)
app.get('/macro-profile', async (req, res) => {
  try {
    const profile = await prisma.macroProfile.findFirst();
    res.json(profile);
  } catch (error) {
    console.error('Error fetching macro profile:', error);
    res.status(500).json({ error: 'Failed to fetch macro profile' });
  }
});

// Create MacroProfile
app.post('/macro-profile', async (req, res) => {
  try {
    const profile = await prisma.macroProfile.create({
      data: req.body,
    });
    res.status(201).json(profile);
  } catch (error) {
    console.error('Error creating macro profile:', error);
    res.status(500).json({ error: 'Failed to create macro profile' });
  }
});

// ==================== USER PREFERENCES ENDPOINTS ====================

// Get UserPreferences (first one)
app.get('/preferences', async (req, res) => {
  try {
    const preferences = await prisma.userPreferences.findFirst();
    res.json(preferences);
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// Create or update UserPreferences
app.post('/preferences', async (req, res) => {
  try {
    const existing = await prisma.userPreferences.findFirst();

    if (existing) {
      const updated = await prisma.userPreferences.update({
        where: { id: existing.id },
        data: req.body,
      });
      res.json(updated);
    } else {
      const created = await prisma.userPreferences.create({
        data: req.body,
      });
      res.status(201).json(created);
    }
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ==================== WEEKLY INTENT ENDPOINTS ====================

// Get latest WeeklyIntent
app.get('/weekly-intent', async (req, res) => {
  try {
    const intent = await prisma.weeklyIntent.findFirst({
      orderBy: { weekStart: 'desc' },
    });
    res.json(intent);
  } catch (error) {
    console.error('Error fetching weekly intent:', error);
    res.status(500).json({ error: 'Failed to fetch weekly intent' });
  }
});

// Create WeeklyIntent
app.post('/weekly-intent', async (req, res) => {
  try {
    const { weekStart, goal, notes } = req.body;

    if (!weekStart || !goal) {
      return res
        .status(400)
        .json({ error: 'weekStart and goal are required' });
    }

    const intent = await prisma.weeklyIntent.create({
      data: {
        weekStart: new Date(weekStart),
        goal,
        notes: notes || null,
      },
    });
    res.status(201).json(intent);
  } catch (error) {
    console.error('Error creating weekly intent:', error);
    res.status(500).json({ error: 'Failed to create weekly intent' });
  }
});

// ==================== RECIPE ENDPOINTS ====================

// Create Recipe
app.post('/recipes', async (req, res) => {
  try {
    const recipe = await prisma.recipe.create({
      data: req.body,
    });
    res.status(201).json(recipe);
  } catch (error) {
    console.error('Error creating recipe:', error);
    res.status(500).json({ error: 'Failed to create recipe' });
  }
});

// Get single Recipe by ID
app.get('/recipes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const recipe = await prisma.recipe.findUnique({
      where: { id },
    });

    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    res.json(recipe);
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({ error: 'Failed to fetch recipe' });
  }
});

// Get all Recipes
app.get('/recipes', async (req, res) => {
  try {
    const recipes = await prisma.recipe.findMany({
      orderBy: { id: 'asc' },
    });
    res.json(recipes);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// ==================== MEAL PLAN ENDPOINTS ====================

// Create MealPlan (empty, just header)
app.post('/meal-plans', async (req, res) => {
  try {
    const { weekStart, weekEnd, goal, weeklyIntentId } = req.body;

    if (!weekStart || !weekEnd || !goal) {
      return res.status(400).json({
        error: 'weekStart, weekEnd, and goal are required',
      });
    }

    const mealPlan = await prisma.mealPlan.create({
      data: {
        weekStart: new Date(weekStart),
        weekEnd: new Date(weekEnd),
        goal,
        weeklyIntentId: weeklyIntentId || null,
      },
    });
    res.status(201).json(mealPlan);
  } catch (error) {
    console.error('Error creating meal plan:', error);
    res.status(500).json({ error: 'Failed to create meal plan' });
  }
});

// Get all MealPlans (with WeeklyIntent)
app.get('/meal-plans', async (req, res) => {
  try {
    const plans = await prisma.mealPlan.findMany({
      take: 10,
      orderBy: { weekStart: 'desc' },
      include: {
        weeklyIntent: true,
      },
    });
    res.json(plans);
  } catch (error) {
    console.error('Error fetching meal plans:', error);
    res.status(500).json({ error: 'Failed to fetch meal plans' });
  }
});

// Get single MealPlan with full details
app.get('/meal-plans/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const plan = await prisma.mealPlan.findUnique({
      where: { id },
      include: {
        weeklyIntent: true,
        meals: {
          include: {
            recipe: true,
          },
          orderBy: [{ date: 'asc' }, { type: 'asc' }],
        },
      },
    });

    if (!plan) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }

    res.json(plan);
  } catch (error) {
    console.error('Error fetching meal plan:', error);
    res.status(500).json({ error: 'Failed to fetch meal plan' });
  }
});

// Add Meal to existing MealPlan
app.post('/meal-plans/:id/meals', async (req, res) => {
  try {
    const mealPlanId = parseInt(req.params.id);
    const { date, type, protein, carbs, fat, recipeId, calories } = req.body;

    if (!date || !type || protein === undefined || carbs === undefined || fat === undefined) {
      return res.status(400).json({
        error: 'date, type, protein, carbs, and fat are required',
      });
    }

    // Verify meal plan exists
    const mealPlan = await prisma.mealPlan.findUnique({
      where: { id: mealPlanId },
    });

    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }

    const meal = await prisma.meal.create({
      data: {
        mealPlanId,
        date: new Date(date),
        type,
        protein,
        carbs,
        fat,
        calories: calories || null,
        recipeId: recipeId || null,
      },
      include: {
        recipe: true,
      },
    });

    res.status(201).json(meal);
  } catch (error) {
    console.error('Error adding meal:', error);
    res.status(500).json({ error: 'Failed to add meal' });
  }
});

// ==================== GENERATE WEEK ENDPOINT ====================

// Generate complete weekly meal plan
app.post('/generate-week', async (req, res) => {
  try {
    const { weekStart } = req.body;

    if (!weekStart) {
      return res
        .status(400)
        .json({ error: 'weekStart is required (YYYY-MM-DD format)' });
    }

    const mealPlan = await generateWeekPlan(weekStart);
    res.status(201).json(mealPlan);
  } catch (error) {
    console.error('Error generating week plan:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to generate week plan' });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== SERVER STARTUP ====================

let server;

async function startServer() {
  try {
    // Validate required environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Start Express server
    server = app.listen(PORT, () => {
      console.log(`🚀 DietCoach API listening on port ${PORT}`);
      console.log(`📍 Health check:  http://localhost:${PORT}/`);
      console.log(
        `🤖 AI meal plans: http://localhost:${PORT}/api/ai/mealplan/generate`
      );
      console.log(
        `🔍 Recipe search: http://localhost:${PORT}/api/recipes/search`
      );
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, closing server gracefully...`);

  if (server) {
    server.close(async () => {
      console.log('Server closed');
      await prisma.$disconnect();
      console.log('Database disconnected');
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();

export default app;
