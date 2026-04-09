import { supabase } from '../Lib/supabase';

export async function deleteUserAccount(userId: string): Promise<void> {
  const { error: fnError, data: fnData } = await supabase.functions.invoke<{
    ok?: boolean;
  }>('delete-account', { body: { userId } });

  if (
    !fnError &&
    fnData &&
    typeof fnData === 'object' &&
    fnData.ok === true
  ) {
    return;
  }

  const tables = [
    'workout_logs',
    'weekly_summaries',
    'meal_suggestions',
    'macro_logs',
    'macro_plans',
    'weight_logs',
    'plans',
    'goals',
    'user_profiles',
  ] as const;

  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) {
      throw new Error(`Failed to delete from ${table}: ${error.message}`);
    }
  }
}
