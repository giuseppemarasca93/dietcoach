import prisma from '../db/prismaClient.js';
import { getBestRecipeForMeal } from './recipeService.js';

/**
 * Converte una stringa CSV in array di stringhe lowercase
 * es: "latte, Pane ,Tonno" -> ["latte","pane","tonno"]
 */
function parseCSV(str) {
  if (!str) return [];
  return str
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Generates a complete weekly meal plan
 * @param {string} weekStartStr - Date string in YYYY-MM-DD format
 * @returns {Promise<Object>} - Complete meal plan with meals and recipes
 * @throws {Error} - If date invalid or database errors
 */
export async function generateWeekPlan(weekStartStr) {
  // Step 1: Validate and parse date
  const weekStart = new Date(weekStartStr);
  if (isNaN(weekStart.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  // Step 2: Calculate week end (6 days after start)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Step 3: Fetch required data in parallel
  const [macroProfile, userPreferences, weeklyIntent] = await Promise.all([
    prisma.macroProfile.findFirst(),
    prisma.userPreferences.findFirst(),
    prisma.weeklyIntent.findFirst({
      orderBy: { weekStart: 'desc' }
    })
  ]);

  // Validate MacroProfile exists
  if (!macroProfile) {
    throw new Error('No MacroProfile found. Create one first with POST /macro-profile');
  }

  // Pre-elaboro preferenze e tag (AI-ready)
  const excludedIngredients = parseCSV(userPreferences?.excludedIngredients || '');

  // Per ora i tag li lasciamo vuoti: saranno popolati in futuro dall'AI
  const tagsRequired = [];
  const tagsPreferred = [];
  const tagsAvoid = [];

  // Step 4: Create MealPlan header
  const mealPlan = await prisma.mealPlan.create({
    data: {
      weekStart,
      weekEnd,
      goal: weeklyIntent?.goal || 'normal',
      weeklyIntentId: weeklyIntent?.id || null
    }
  });

  // Step 5: Define meal types with corresponding macro targets
  const mealTypes = [
    {
      type: 'breakfast',
      protein: macroProfile.breakfastProtein,
      carbs: macroProfile.breakfastCarbs,
      fat: macroProfile.breakfastFat
    },
    {
      type: 'lunch',
      protein: macroProfile.lunchProtein,
      carbs: macroProfile.lunchCarbs,
      fat: macroProfile.lunchFat
    },
    {
      type: 'snack',
      protein: macroProfile.snackProtein,
      carbs: macroProfile.snackCarbs,
      fat: macroProfile.snackFat
    },
    {
      type: 'dinner',
      protein: macroProfile.dinnerProtein,
      carbs: macroProfile.dinnerCarbs,
      fat: macroProfile.dinnerFat
    }
  ];

  // Step 6: Generate 28 meals (7 days × 4 meal types)
  const meals = [];
  
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const currentDate = new Date(weekStart);
    currentDate.setDate(currentDate.getDate() + dayOffset);

    for (const mealType of mealTypes) {
      const macroTarget = {
        protein: mealType.protein,
        carbs: mealType.carbs,
        fat: mealType.fat
      };

      // Usa il nuovo motore di selezione ricette AI-ready
      const recipe = await getBestRecipeForMeal({
        mealType: mealType.type,
        macroTarget,
        excludedIngredients,
        tagsRequired,
        tagsPreferred,
        tagsAvoid
      });

      // Calculate calories (4 cal/g protein, 4 cal/g carbs, 9 cal/g fat)
      const calories = (mealType.protein * 4) + (mealType.carbs * 4) + (mealType.fat * 9);

      meals.push({
        mealPlanId: mealPlan.id,
        date: currentDate,
        type: mealType.type,
        protein: mealType.protein,
        carbs: mealType.carbs,
        fat: mealType.fat,
        calories: calories,
        recipeId: recipe?.id || null
      });
    }
  }

  // Step 7: Batch insert all meals
  await prisma.meal.createMany({
    data: meals
  });

  // Step 8: Fetch complete meal plan with all relationships
  const completePlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlan.id },
    include: {
      weeklyIntent: true,
      meals: {
        include: {
          recipe: true
        },
        orderBy: [
          { date: 'asc' },
          { type: 'asc' }
        ]
      }
    }
  });

  return completePlan;
}
