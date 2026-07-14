/**
 * One-time backfill: populate exercise_records from workout_logs + free_sessions sets_json.
 *
 * Usage (service role required):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-records.ts
 *
 * Optional:
 *   BACKFILL_USER_ID=<uuid>   backfill a single user only
 */

import { createClient } from '@supabase/supabase-js';
import { backfillRecordsForUser, setRecordsSupabaseClient } from '../Lib/recordsCore';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  setRecordsSupabaseClient(admin);

  const singleUserId = process.env.BACKFILL_USER_ID?.trim();

  let userIds: string[] = [];
  if (singleUserId) {
    userIds = [singleUserId];
  } else {
    const { data: workoutUsers, error: workoutUsersError } = await admin
      .from('workout_logs')
      .select('user_id');
    if (workoutUsersError) throw workoutUsersError;

    const { data: freeUsers, error: freeUsersError } = await admin
      .from('free_sessions')
      .select('user_id');
    if (freeUsersError) throw freeUsersError;

    userIds = [
      ...new Set([
        ...(workoutUsers ?? []).map((row) => row.user_id as string),
        ...(freeUsers ?? []).map((row) => row.user_id as string),
      ]),
    ];
  }

  console.log(`Backfilling ${userIds.length} user(s)...`);

  for (const userId of userIds) {
    console.log(`→ ${userId}`);
    await backfillRecordsForUser(userId);
  }

  console.log('Backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
