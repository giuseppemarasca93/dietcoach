// src/services/planService.js
import prisma from '../db/prismaClient.js';
import { findRecipeForMeal } from './recipeService.js';

/**
 * Converte una stringa YYYY-MM-DD in Date (mezzanotte locale)
 */
function parseDate(isoDateStr) {
  const d = new Date(isoDateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Restituisce un oggetto con i target per ogni tipo di pasto,
 * leggendo dal MacroProfile.
 */
function buildMacrosMap(profile) {
  return {
    breakfast: {
      type: 'breakfast',
      protein: profile.breakfastProtein,
      carbs: profile.breakfastCarbs,
      fat: profile.breakfastFat,
    },
    lunch: {
      type: 'lunch',
      protein: profile.lunchProtein,
      carbs: profile.lunchCarbs,
      fat: profile.lunchFat,
    },
    snack: {
      type: 'snack',
      protein: profile.snackProtein,
      carbs: profile.snackCarbs,
      fat: profile.snackFat,
    },
    dinner: {
      type: 'dinner',
      protein: profile.dinnerProtein,
      carbs: profile.dinnerCarbs,
      fat: profile.dinnerFat,
    },
  };
}

/**
 * Genera il piano settimanale completo (7 giorni x 4 pasti)
 * a partire dal giorno di inizio settimana (YYYY-MM-DD).
 */
export async function generateWeekPlan(weekStartStr) {
  // 1) Parse date e calcola weekEnd
  const weekStart = parseDate(weekStartStr);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // 2) Carica MacroProfile
  const macroProfile = await prisma.macroProfile.findFirst();
  if (!macroProfile) {
    throw new Error('No MacroProfile found. Create one first with POST /macro-profile');
  }

  // 3) Carica UserPreferences (se esistono)
  const preferences = await prisma.userPreferences.findFirst();

  // 4) Carica WeeklyIntent (se esiste, per ora prendiamo il più recente <= weekStart)
  const weeklyIntent = await prisma.weeklyIntent.findFirst({
    where: {
      weekStart: {
        lte: weekStart,
      },
    },
    orderBy: {
      weekStart: 'desc',
    },
  });

  // 5) Crea la “testata” del MealPlan
  const mealPlan = await prisma.mealPlan.create({
    data: {
      weekStart,
      weekEnd,
      goal: weeklyIntent?.goal || 'normal',
      weeklyIntentId: weeklyIntent?.id ?? null,
    },
  });

  const macrosMap = buildMacrosMap(macroProfile);

  const mealsToCreate = [];
  const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];

  // 6) Per ogni giorno della settimana e per ogni pasto
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const currentDate = new Date(weekStart);
    currentDate.setDate(currentDate.getDate() + dayOffset);

    for (const mealType of MEAL_TYPES) {
      const target = macrosMap[mealType];

      // Chiede a recipeService la ricetta migliore
      const recipe = await findRecipeForMeal({
        mealType,
        macros: {
          protein: target.protein,
          carbs: target.carbs,
          fat: target.fat,
        },
        preferences: preferences || null,
        weeklyIntent: weeklyIntent || null,
      });

      // Se abbiamo una ricetta, usiamo le sue calorie, altrimenti calcolate dai macro
      const calories =
        recipe?.caloriesPerServing ??
        (target.protein * 4 + target.carbs * 4 + target.fat * 9);

      mealsToCreate.push({
        mealPlanId: mealPlan.id,
        date: currentDate,
        type: mealType,
        protein: target.protein,
        carbs: target.carbs,
        fat: target.fat,
        calories,
        recipeId: recipe?.id ?? null,
      });
    }
  }

  // 7) Inserimento batch di tutti i pasti
  await prisma.meal.createMany({
    data: mealsToCreate,
  });

  // 8) Ricarica il MealPlan completo con relazioni
  const completePlan = await prisma.mealPlan.findUnique({
    where: { id: mealPlan.id },
    include: {
      weeklyIntent: true,
      meals: {
        include: { recipe: true },
        orderBy: [{ date: 'asc' }, { type: 'asc' }],
      },
    },
  });

  return completePlan;
}
