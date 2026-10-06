/** All foods share the same portion-based totals; manual foods never enter the catalog. */
export function nutritionMealTotals(meals: any[]) {
  const totals = { calories: 0, carbs: 0, protein: 0, fat: 0 };
  if (!Array.isArray(meals)) throw new Error('As refeições devem ser uma lista.');
  for (const meal of meals) {
    if (!Array.isArray(meal.items)) throw new Error('Os alimentos da refeição devem ser uma lista.');
    for (const item of meal.items) {
      if (item.source === 'manual' && (!String(item.food || '').trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !String(item.unit || '').trim())) {
        throw new Error('Informe nome, quantidade positiva e unidade do alimento manual.');
      }
      for (const [key, field] of [['calories', 'calories'], ['carbs', 'carb'], ['protein', 'protein'], ['fat', 'fat']] as const) {
        const value = item[field] ?? 0;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Os nutrientes devem ser números iguais ou maiores que zero.');
        totals[key] += value;
      }
    }
  }
  return { calories: Math.round(totals.calories), carbs: Math.round(totals.carbs * 10) / 10, protein: Math.round(totals.protein * 10) / 10, fat: Math.round(totals.fat * 10) / 10 };
}
