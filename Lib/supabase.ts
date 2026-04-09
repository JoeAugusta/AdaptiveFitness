import { createClient } from '@supabase/supabase-js';

/**
 * DB note: `macro_plans.calorie_pace` (text, default 'balanced') stores the
 * MacroSetup pace tier for fat_loss / hypertrophy. Apply in Supabase SQL:
 * ALTER TABLE macro_plans ADD COLUMN IF NOT EXISTS calorie_pace text DEFAULT 'balanced';
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
