// src/services/aiPlanService.js
import { OpenAI } from 'openai';
import { z } from 'zod';
import prisma from '../db/prismaClient.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== Zod Schemas =====
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
      dayNumber: z.number(),
      meals: z.array(MealSchema),
    })
  ),
});

// ===== Main API =====
export async function generateMealPlan(options = {}) {
  const { weekStart, mealsPerDay = 4 } = options;

  const [macroProfile, preferences, weeklyIntent] = await Promise.all([
    prisma.macroProfile.findFirst(),
    prisma.userPreferences.findFirst(),
    prisma.weeklyIntent.findFirst({ orderBy: { weekStart: 'desc' } }),
  ]);

  if (!macroProfile) throw new Error('No MacroProfile found.');

  const start = weekStart ? new Date(weekStart) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const prompt = buildPrompt(macroProfile, preferences, weeklyIntent, mealsPerDay);
  const aiResponse = await callOpenAIWithRetry(prompt);

  const validated = MealPlanSchema.parse(aiResponse);

  validateExclusions(validated, preferences);

  return await storeMealPlan(start, end, validated, weeklyIntent);
}

export async function getMealPlan(id) {
  const plan = await prisma.mealPlan.findUnique({
    where: { id: Number(id) },
    include: {
      weeklyIntent: true,
      meals: {
        include: { recipe: true },
        orderBy: [{ date: 'asc' }, { type: 'asc' }],
      },
    },
  });

  if (!plan) throw new Error('Meal plan not found');
  return plan;
}

// ===== OpenAI =====
async function callOpenAIWithRetry(prompt, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a nutritionist. Respond with JSON only.' },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      lastError = err;

      if ((err.status === 429 || err.code === 'ECONNRESET') && attempt < maxRetries) {
        const delay = 1500 * attempt;
        console.log(`OpenAI error. Retry in ${delay}ms (attempt ${attempt})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}

// ===== Helpers =====
function buildPrompt(macroProfile, preferences, weeklyIntent, mealsPerDay) {
  const totalProtein =
    macroProfile.breakfastProtein +
    macroProfile.lunchProtein +
    macroProfile.snackProtein +
    macroProfile.dinnerProtein;

  const totalCarbs =
    macroProfile.breakfastCarbs +
    macroProfile.lunchCarbs +
    macroProfile.snackCarbs +
    macroProfile.dinnerCarbs;

  const totalFats =
    macroProfile.breakfastFat +
    macroProfile.lunchFat +
    macroProfile.snackFat +
    macroProfile.dinnerFat;

  const exclusions = preferences?.excludedIngredients || 'none';
  const cuisines = preferences?.preferredCuisines || 'any';

  return `
Generate a 7-day meal plan with ${mealsPerDay} meals per day.
Daily Macros: Protein ${totalProtein}g, Carbs ${totalCarbs}g, Fats ${totalFats}g.
Excluded ingredients: ${exclusions}.
Preferred cuisines: ${cuisines}.
Respond ONLY with JSON using the structure:
{ "days": [ { "dayNumber": 1, "meals": [ ... ] } ] }
  `.trim();
}

async function storeMealPlan(start, end, validatedPlan, weeklyIntent) {
  return await prisma.$transaction(async (tx) => {
    const mealPlan = await tx.mealPlan.create({
      data: {
        weekStart: start,
        weekEnd: end,
        goal: weeklyIntent?.goal || 'normal',
        weeklyIntentId: weeklyIntent?.id ?? null,
      },
    });

    for (const day of validatedPlan.days) {
      const date = new Date(start);
      date.setDate(date.getDate() + (day.dayNumber - 1));

      for (const meal of day.meals) {
        let recipe = await tx.recipe.findFirst({
          where: { title: { equals: meal.recipe.title, mode: 'insensitive' } },
        });

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

        await tx.meal.create({
          data: {
            mealPlanId: mealPlan.id,
            date,
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

    return await tx.mealPlan.findUnique({
      where: { id: mealPlan.id },
      include: {
        weeklyIntent: true,
        meals: { include: { recipe: true }, orderBy: [{ date: 'asc' }, { type: 'asc' }] },
      },
    });
  });
}

function validateExclusions(plan, preferences) {
  if (!preferences?.excludedIngredients) return;

  const excluded = preferences.excludedIngredients
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (excluded.length === 0) return;

  for (const day of plan.days) {
    for (const meal of day.meals) {
      const ing = meal.recipe.ingredients.join(' ').toLowerCase();
      for (const ex of excluded) {
        if (ing.includes(ex)) {
          throw new Error(
            `Excluded ingredient "${ex}" found in recipe "${meal.recipe.title}". Regenerate.`
          );
        }
      }
    }
  }
}

export default {
  generateMealPlan,
  getMealPlan,
};
