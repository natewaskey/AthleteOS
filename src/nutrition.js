/*
 * Nutrition & hydration (pure logic): a built-in list of common athlete foods, meal logging,
 * daily totals against targets, hydration and a sweat-rate calculator.
 * Browser: window.Nutrition (needs window.Core, window.Program). Node: require('./nutrition.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;

  const MEALS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', pre: 'Pre-workout', post: 'Post-workout' };

  // name, serving, kcal, protein g, carbs g, fat g, tags
  const FOODS = [
    ['Eggs', '2 large', 143, 13, 1, 10, 'protein breakfast'],
    ['Greek yogurt', '1 cup (227 g)', 146, 20, 8, 4, 'protein breakfast snack'],
    ['Oatmeal', '1 cup cooked', 166, 6, 28, 4, 'carb breakfast'],
    ['Whole-wheat toast', '2 slices', 160, 8, 28, 2, 'carb breakfast'],
    ['Bagel', '1 medium', 280, 11, 55, 2, 'carb breakfast pre'],
    ['Peanut butter', '2 tbsp', 190, 7, 7, 16, 'fat snack'],
    ['Banana', '1 medium', 105, 1, 27, 0, 'carb fruit snack pre'],
    ['Apple', '1 medium', 95, 0, 25, 0, 'carb fruit snack'],
    ['Berries', '1 cup', 70, 1, 17, 0, 'carb fruit'],
    ['Orange', '1 medium', 62, 1, 15, 0, 'carb fruit'],
    ['Granola', '½ cup', 240, 6, 32, 10, 'carb breakfast snack'],
    ['Cereal with milk', '1 bowl', 250, 9, 45, 4, 'carb breakfast'],
    ['Milk', '1 cup', 122, 8, 12, 5, 'protein drink'],
    ['Chocolate milk', '1 cup', 208, 8, 26, 8, 'post drink recovery'],
    ['Protein shake', '1 scoop + water', 120, 24, 3, 1, 'protein post drink'],
    ['Chicken breast', '5 oz (140 g)', 231, 43, 0, 5, 'protein lunch dinner'],
    ['Ground beef (90% lean)', '5 oz', 280, 32, 0, 16, 'protein dinner'],
    ['Steak', '6 oz', 340, 46, 0, 16, 'protein dinner'],
    ['Salmon', '5 oz', 290, 32, 0, 17, 'protein dinner'],
    ['Tuna (canned)', '1 can', 120, 26, 0, 1, 'protein lunch'],
    ['Turkey sandwich', '1 sandwich', 360, 26, 40, 10, 'lunch'],
    ['Peanut butter & jelly', '1 sandwich', 380, 13, 52, 14, 'lunch snack pre'],
    ['Burrito bowl', '1 bowl', 650, 38, 78, 20, 'lunch dinner'],
    ['Pasta', '2 cups cooked', 420, 15, 84, 2, 'carb dinner'],
    ['Pasta with meat sauce', '1 plate', 620, 32, 80, 18, 'dinner'],
    ['White rice', '1 cup cooked', 205, 4, 45, 0, 'carb lunch dinner'],
    ['Brown rice', '1 cup cooked', 216, 5, 45, 2, 'carb lunch dinner'],
    ['Sweet potato', '1 medium', 112, 2, 26, 0, 'carb dinner'],
    ['Potatoes', '1 medium baked', 160, 4, 37, 0, 'carb dinner'],
    ['Quinoa', '1 cup cooked', 222, 8, 39, 4, 'carb lunch dinner'],
    ['Black beans', '1 cup', 227, 15, 41, 1, 'protein carb'],
    ['Tofu', '½ block (200 g)', 180, 20, 4, 10, 'protein dinner'],
    ['Salad with dressing', '1 bowl', 180, 3, 12, 14, 'veg lunch'],
    ['Broccoli', '1 cup', 55, 4, 11, 1, 'veg dinner'],
    ['Mixed vegetables', '1 cup', 80, 4, 16, 0, 'veg dinner'],
    ['Avocado', '½', 120, 1, 6, 11, 'fat'],
    ['Cheese', '1 oz slice', 110, 7, 0, 9, 'protein fat snack'],
    ['Cottage cheese', '1 cup', 206, 28, 8, 9, 'protein snack'],
    ['Trail mix', '¼ cup', 175, 5, 16, 11, 'snack'],
    ['Almonds', '1 oz (23)', 164, 6, 6, 14, 'fat snack'],
    ['Granola bar', '1 bar', 190, 4, 29, 7, 'snack pre'],
    ['Protein bar', '1 bar', 210, 20, 23, 7, 'protein snack post'],
    ['Rice cakes', '2 cakes', 70, 2, 15, 0, 'carb snack pre'],
    ['Pretzels', '1 oz', 108, 3, 23, 1, 'carb snack pre'],
    ['Hummus & veggies', '1 snack pack', 180, 6, 16, 11, 'snack'],
    ['Pizza', '2 slices', 570, 24, 70, 22, 'dinner'],
    ['Cheeseburger', '1 burger', 540, 30, 40, 29, 'lunch dinner'],
    ['Fries', 'medium', 365, 4, 48, 17, 'fast'],
    ['Chicken wrap', '1 wrap', 480, 32, 45, 18, 'lunch'],
    ['Sushi roll', '8 pieces', 350, 14, 60, 6, 'lunch dinner'],
    ['Smoothie (fruit + yogurt)', '16 oz', 320, 14, 58, 4, 'breakfast post drink'],
    ['Sports drink', '20 oz', 140, 0, 36, 0, 'drink pre during'],
    ['Energy gel', '1 gel', 100, 0, 25, 0, 'during pre'],
    ['Orange juice', '1 cup', 112, 2, 26, 0, 'drink breakfast'],
    ['Pancakes', '3 medium', 350, 9, 60, 8, 'breakfast'],
    ['Waffle with syrup', '2 waffles', 420, 8, 72, 12, 'breakfast'],
    ['Bacon', '3 slices', 130, 9, 0, 10, 'protein breakfast'],
    ['Soup (chicken noodle)', '1 bowl', 160, 10, 20, 4, 'lunch'],
    ['Mac and cheese', '1 cup', 380, 15, 48, 14, 'dinner'],
    ['Stir-fry with rice', '1 plate', 600, 30, 80, 16, 'dinner'],
    ['Tacos (chicken)', '2 tacos', 420, 28, 40, 16, 'dinner'],
    ['Ice cream', '1 cup', 275, 5, 32, 15, 'treat'],
    ['Cookies', '2 cookies', 160, 2, 22, 8, 'treat'],
    ['Soda', '12 oz can', 150, 0, 39, 0, 'drink treat'],
  ].map(([name, serving, kcal, protein, carbs, fat, tags]) => ({ name, serving, kcal, protein, carbs, fat, tags: tags.split(' ') }));
  const FOOD_BY_NAME = Object.fromEntries(FOODS.map((f) => [f.name.toLowerCase(), f]));

  const num = (v, max = 5000) => Math.max(0, Math.min(max, Math.round((Number(v) || 0) * 10) / 10));

  function normalizeItem(x = {}) {
    const lib = FOOD_BY_NAME[String(x.name || '').toLowerCase()];
    const qty = Math.max(0.25, Math.min(10, Number(x.qty) || 1));
    return {
      name: String(x.name || '').trim().slice(0, 80) || 'Food',
      qty,
      kcal: x.kcal != null ? num(x.kcal) : lib ? lib.kcal : 0,
      protein: x.protein != null ? num(x.protein, 400) : lib ? lib.protein : 0,
      carbs: x.carbs != null ? num(x.carbs, 800) : lib ? lib.carbs : 0,
      fat: x.fat != null ? num(x.fat, 400) : lib ? lib.fat : 0,
    };
  }

  function normalizeMeal(x = {}) {
    return {
      id: String(x.id || C.uid()),
      date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : C.toISODate(new Date()),
      meal: MEALS[x.meal] ? x.meal : 'snack',
      items: (Array.isArray(x.items) ? x.items : []).map(normalizeItem).slice(0, 30),
      note: String(x.note || '').trim().slice(0, 200),
      source: x.source === 'photo' ? 'photo' : 'manual',
      ts: Number(x.ts) || Date.now(),
    };
  }

  const itemTotals = (it) => ({ kcal: it.kcal * it.qty, protein: it.protein * it.qty, carbs: it.carbs * it.qty, fat: it.fat * it.qty });
  const sum = (list) => list.reduce((t, x) => ({ kcal: t.kcal + x.kcal, protein: t.protein + x.protein, carbs: t.carbs + x.carbs, fat: t.fat + x.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const round = (t) => ({ kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat) });

  function mealTotals(meal) {
    return round(sum(meal.items.map(itemTotals)));
  }

  function dayTotals(athlete, dateISO) {
    const meals = (athlete.meals || []).filter((m) => m.date === dateISO);
    return { ...round(sum(meals.flatMap((m) => m.items.map(itemTotals)))), meals: meals.length };
  }

  function latestWeightKg(athlete) {
    const c = [...(athlete.checkins || [])].filter((x) => x.weight).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return c ? c.weight : null;
  }

  // Daily targets from body weight and today's training minutes (falls back to 70 kg if unknown).
  function targets(athlete, dateISO) {
    const kg = latestWeightKg(athlete) || 70;
    const minutes = (athlete.workouts || []).filter((w) => w.date === dateISO).reduce((s, w) => s + w.duration, 0);
    const t = P.nutritionTargets(kg, minutes);
    const fat = Math.round(kg * 1);
    const protein = t.proteinG[0];
    return { ...t, weightKnown: !!latestWeightKg(athlete), kg, protein, proteinRange: t.proteinG, carbs: t.carbsG, fat, kcal: Math.round(protein * 4 + t.carbsG * 4 + fat * 9), waterMl: Math.round(t.waterL * 1000) };
  }

  function waterFor(athlete, dateISO) {
    const w = (athlete.water || []).find((x) => x.date === dateISO);
    return w ? w.ml : 0;
  }

  function addWater(athlete, dateISO, ml) {
    athlete.water = athlete.water || [];
    let w = athlete.water.find((x) => x.date === dateISO);
    if (!w) athlete.water.push((w = { date: dateISO, ml: 0 }));
    w.ml = Math.max(0, Math.min(10000, w.ml + ml));
    return w.ml;
  }

  function searchFoods(q, { limit = 8, meal = null } = {}) {
    const s = String(q || '').trim().toLowerCase();
    let list = FOODS;
    if (s) list = FOODS.filter((f) => f.name.toLowerCase().includes(s) || f.tags.some((t) => t.startsWith(s)));
    else if (meal) list = FOODS.filter((f) => f.tags.includes(meal)).concat(FOODS.filter((f) => !f.tags.includes(meal)));
    return list.slice(0, limit);
  }

  /*
   * Sweat rate: (weight before − after + fluid drunk − urine) ÷ hours. Weights in kg, fluids in litres.
   * Advice: replace ~150% of the weight lost over the next few hours; drink ~sweat rate per hour next time.
   */
  function sweatRate({ preKg, postKg, fluidL = 0, urineL = 0, minutes }) {
    const pre = Number(preKg), post = Number(postKg), mins = Number(minutes);
    if (!(pre > 0 && post > 0 && mins > 0)) return null;
    const lossL = pre - post + (Number(fluidL) || 0) - (Number(urineL) || 0);
    const perHour = lossL / (mins / 60);
    const pctLost = ((pre - post) / pre) * 100;
    return {
      lossL: +lossL.toFixed(2),
      perHourL: +perHour.toFixed(2),
      pctBodyWeight: +pctLost.toFixed(1),
      replaceL: +Math.max(0, (pre - post) * 1.5).toFixed(2),
      level: pctLost >= 2 ? 'bad' : pctLost >= 1 ? 'warn' : 'good',
      advice:
        pctLost >= 2
          ? 'You lost over 2% of your body weight, enough to hurt performance. Drink more during sessions and add salt/electrolytes.'
          : pctLost >= 1
            ? 'Mild fluid loss. Drink a little more during training.'
            : 'Well hydrated during the session. Keep it up.',
    };
  }

  // Share of recent days with logged food that hit the protein target (for summaries).
  function proteinHitRate(athlete, fromISO, toISO) {
    const days = [...new Set((athlete.meals || []).filter((m) => m.date >= fromISO && m.date <= toISO).map((m) => m.date))];
    if (!days.length) return null;
    const hit = days.filter((d) => dayTotals(athlete, d).protein >= targets(athlete, d).protein * 0.9).length;
    return { days: days.length, hit, pct: Math.round((hit / days.length) * 100) };
  }

  // JSON schema for a photo estimate from Claude.
  const PHOTO_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string' }, qty: { type: 'number' }, kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' } },
          required: ['name', 'qty', 'kcal', 'protein', 'carbs', 'fat'],
        },
      },
      note: { type: 'string' },
    },
    required: ['items', 'note'],
  };

  const Nutrition = { MEALS, FOODS, normalizeMeal, normalizeItem, mealTotals, dayTotals, targets, latestWeightKg, waterFor, addWater, searchFoods, sweatRate, proteinHitRate, PHOTO_SCHEMA };
  if (node) module.exports = Nutrition;
  else root.Nutrition = Nutrition;
})(typeof window !== 'undefined' ? window : globalThis);
