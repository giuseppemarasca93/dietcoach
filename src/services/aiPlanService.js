// src/services/aiPlanService.js
import { OpenAI } from 'openai';
import { z } from 'zod';
import prisma from '../db/prismaClient.js';

// ===== SECTION A: CONFIGURATION =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MealSchema = z.object({
  name: z.string(),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  recipe: z.object({
    title: z.string(),
    ingredients: z.array(z.string()),
    instructions: z.string(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fats: z.number(),
  }),
});

const MealPlanSchema = z.object({
  days: z.array(
    z.object({
      dayNumber: z.number().min(1).max(7),
      meals: z.array(MealSchema),
    })
  ),
});

// ===== SECTION B: MAIN GENERATION LOGIC =====
export async function generateMealPlan(options = {}) {
  try {
    const { weekStart, mealsPerDay = 4 } = options;

    // 1. Fetch configuration data
    const [macroProfile, preferences, weeklyIntent] = await Promise.all([
      prisma.macroProfile.findFirst(),
      prisma.userPreferences.findFirst(),
      prisma.weeklyIntent.findFirst({
        orderBy: { weekStart: 'desc' },
      }),
    ]);

    if (!macroProfile) {
      throw new Error('No MacroProfile found. Create one first with POST /macro-profile');
    }

    // 2. Calculate date range
    const weekStartDate = weekStart ? new Date(weekStart) : new Date();
    weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    // 3. Build OpenAI prompt
    const prompt = _buildPrompt(macroProfile, preferences, weeklyIntent, mealsPerDay);

    // 4. Call OpenAI with retry
    const aiResponse = await _callOpenAIWithRetry(prompt);

    // 5. Validate response
    const validatedPlan = MealPlanSchema.parse(aiResponse);

    // 6. Validate exclusions
    _validateExclusions(validatedPlan, preferences);

    // 7. Store in database (transaction)
    const mealPlan = await _storeMealPlan(weekStartDate, weekEndDate, validatedPlan, weeklyIntent);

    return mealPlan;
  } catch (error) {
    console.error('AI meal plan generation failed:', error);
    throw error;
  }
}

export async function getMealPlan(id) {
  const plan = await prisma.mealPlan.findUnique({
    where: { id: parseInt(id) },
    include: {
      weeklyIntent: true,
      meals: {
        include: { recipe: true },
        orderBy: [{ date: 'asc' }, { type: 'asc' }],
      },
    },
  });

  if (!plan) {
    throw new Error('Meal plan not found');
  }

  return plan;
}

// ===== SECTION C: OPENAI INTERACTION =====
async function _callOpenAIWithRetry(prompt, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a professional nutritionist. Generate meal plans as valid JSON only. Be precise with macro calculations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        timeout: 30000,
      });

      const content = response.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      lastError = error;
      
      // Retry on rate limits or network errors
      if ((error.status === 429 || error.code === 'ECONNRESET') && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(\OpenAI API error, retrying in \ms... (attempt \/\)\);
        await _sleep(delay);
        continue;
      }
      
      throw error;
    }
  }

  throw lastError;
}

// ===== SECTION D: HELPERS =====
function _buildPrompt(macroProfile, preferences, weeklyIntent, mealsPerDay) {
  // Calculate total daily macros
  const totalCalories = 
    (macroProfile.breakfastProtein + macroProfile.lunchProtein + 
     macroProfile.snackProtein + macroProfile.dinnerProtein) * 4 +
    (macroProfile.breakfastCarbs + macroProfile.lunchCarbs + 
     macroProfile.snackCarbs + macroProfile.dinnerCarbs) * 4 +
    (macroProfile.breakfastFat + macroProfile.lunchFat + 
     macroProfile.snackFat + macroProfile.dinnerFat) * 9;

  const totalProtein = macroProfile.breakfastProtein + macroProfile.lunchProtein + 
                       macroProfile.snackProtein + macroProfile.dinnerProtein;
  const totalCarbs = macroProfile.breakfastCarbs + macroProfile.lunchCarbs + 
                     macroProfile.snackCarbs + macroProfile.dinnerCarbs;
  const totalFats = macroProfile.breakfastFat + macroProfile.lunchFat + 
                    macroProfile.snackFat + macroProfile.dinnerFat;

  // Parse exclusions and preferences
  const exclusions = preferences?.excludedIngredients 
    ? preferences.excludedIngredients.split(',').map(s => s.trim()).join(', ')
    : 'none';
  
  const cuisinePreferences = preferences?.preferredCuisines 
    ? preferences.preferredCuisines.split(',').map(s => s.trim()).join(', ')
    : 'any cuisine';

  // Adapt based on weekly intent
  let intentGuidance = '';
  if (weeklyIntent?.goal === 'high_satiety_low_ferritin') {
    intentGuidance = 'Focus on high-fiber, high-protein meals with iron-rich ingredients (spinach, red meat, lentils). Prioritize meals that keep you full longer.';
  } else if (weeklyIntent?.goal === 'lazy') {
    intentGuidance = 'Keep recipes simple and quick to prepare. Prefer meals with minimal cooking steps.';
  } else if (weeklyIntent?.goal === 'gourmet') {
    intentGuidance = 'Create sophisticated, restaurant-quality meals with complex flavors and techniques.';
  }

  // Determine meal types based on meals per day
  let mealTypes;
  if (mealsPerDay === 3) {
    mealTypes = ['breakfast', 'lunch', 'dinner'];
  } else if (mealsPerDay === 4) {
    mealTypes = ['breakfast', 'lunch', 'snack', 'dinner'];
  } else if (mealsPerDay === 5) {
    mealTypes = ['breakfast', 'snack', 'lunch', 'snack', 'dinner'];
  } else {
    mealTypes = ['breakfast', 'snack', 'lunch', 'snack', 'dinner', 'snack'];
  }

  return \Generate a complete 7-day meal plan with \ meals per day.

TARGET MACROS PER DAY:
- Calories: \ kcal
- Protein: \g
- Carbohydrates: \g
- Fats: \g

MEAL DISTRIBUTION:
\

DIETARY REQUIREMENTS:
- EXCLUDED ingredients (MUST NOT use): \
- Preferred cuisines: \
- Cooking effort: \

SPECIAL INSTRUCTIONS:
\

IMPORTANT RULES:
1. Each meal MUST include exact ingredient quantities
2. Calculate macros accurately for each recipe
3. Daily totals should be within ±15% of target macros
4. Never use excluded ingredients
5. Provide clear, step-by-step cooking instructions

Return ONLY valid JSON with this EXACT structure (no additional text):
{
  "days": [
    {
      "dayNumber": 1,
      "meals": [
        {
          "name": "Meal name",
          "mealType": "breakfast",
          "recipe": {
            "title": "Recipe Name",
            "ingredients": ["200g ingredient 1", "100g ingredient 2"],
            "instructions": "Step 1: Do this. Step 2: Do that.",
            "calories": 500,
            "protein": 30,
            "carbs": 50,
            "fats": 15
          }
        }
      ]
    }
  ]
}\;
}

async function _storeMealPlan(weekStart, weekEnd, validatedPlan, weeklyIntent) {
  return await prisma.\(async (tx) => {
    // Create meal plan header
    const mealPlan = await tx.mealPlan.create({
      data: {
        weekStart,
        weekEnd,
        goal: weeklyIntent?.goal || 'normal',
        weeklyIntentId: weeklyIntent?.id ?? null,
      },
    });

    // Create meals and recipes
    for (const day of validatedPlan.days) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(currentDate.getDate() + (day.dayNumber - 1));

      for (const meal of day.meals) {
        // Check if recipe exists (case-insensitive title match)
        let recipe = await tx.recipe.findFirst({
          where: { 
            title: {
              equals: meal.recipe.title,
              mode: 'insensitive',
            }
          },
        });

        // Create recipe if doesn't exist
        if (!recipe) {
          recipe = await tx.recipe.create({
            data: {
              title: meal.recipe.title,
              ingredients: meal.recipe.ingredients.join(', '),
              instructions: meal.recipe.instructions,
              caloriesPerServing: meal.recipe.calories,
              proteinPerServing: meal.recipe.protein,
              carbsPerServing: meal.recipe.carbs,
              fatPerServing: meal.recipe.fats,
              mealType: meal.mealType,
              source: 'openai',
              servings: 1,
            },
          });
        }

        // Create meal entry
        await tx.meal.create({
          data: {
            mealPlanId: mealPlan.id,
            date: currentDate,
            type: meal.mealType,
            protein: meal.recipe.protein,
            carbs: meal.recipe.carbs,
            fat: meal.recipe.fats,
            calories: meal.recipe.calories,
            recipeId: recipe.id,
          },
        });
      }
    }

    // Return complete meal plan with relations
    return await tx.mealPlan.findUnique({
      where: { id: mealPlan.id },
      include: {
        weeklyIntent: true,
        meals: {
          include: { recipe: true },
          orderBy: [{ date: 'asc' }, { type: 'asc' }],
        },
      },
    });
  });
}

function _validateExclusions(plan, preferences) {
  if (!preferences?.excludedIngredients) return;

  const excluded = preferences.excludedIngredients
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (excluded.length === 0) return;

  for (const day of plan.days) {
    for (const meal of day.meals) {
      const ingredients = meal.recipe.ingredients.join(' ').toLowerCase();
      
      for (const excludedItem of excluded) {
        if (ingredients.includes(excludedItem)) {
          throw new Error(
            \Excluded ingredient "\" found in recipe "\". Please regenerate the meal plan.\
          );
        }
      }
    }
  }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  generateMealPlan,
  getMealPlan,
};

