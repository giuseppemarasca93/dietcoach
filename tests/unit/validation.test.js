// tests/unit/validation.test.js
import { describe, test, expect } from '@jest/globals';
import { z } from 'zod';

describe('Zod Validation', () => {
  test('should validate meal plan generation request', () => {
    const GenerateMealPlanSchema = z.object({
      weekStart: z.string().optional(),
      mealsPerDay: z.number().min(3).max(6).optional().default(4),
    });

    const validData = { mealsPerDay: 4 };
    const result = GenerateMealPlanSchema.parse(validData);
    expect(result.mealsPerDay).toBe(4);
  });

  test('should reject invalid meals per day', () => {
    const GenerateMealPlanSchema = z.object({
      weekStart: z.string().optional(),
      mealsPerDay: z.number().min(3).max(6).optional(),
    });

    expect(() => {
      GenerateMealPlanSchema.parse({ mealsPerDay: 10 });
    }).toThrow();
  });

  test('should validate recipe search query', () => {
    const SearchQuerySchema = z.object({
      q: z.string().min(1, 'Query parameter is required'),
      limit: z.string().optional().transform((val) => val ? parseInt(val) : 20),
    });

    const validQuery = { q: 'chicken', limit: '10' };
    const result = SearchQuerySchema.parse(validQuery);
    expect(result.q).toBe('chicken');
    expect(result.limit).toBe(10);
  });
});
