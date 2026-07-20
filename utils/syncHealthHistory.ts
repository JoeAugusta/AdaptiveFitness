import { supabase } from '../Lib/supabase';
import type { HealthHistoryDay } from '../hooks/useHealthData';

export async function syncHealthHistory(
  userId: string,
  history: HealthHistoryDay[],
  source: string,
): Promise<void> {
  if (!userId || history.length === 0) return;
  const rows = history
    .filter(
      (d) =>
        d.hrvMs != null ||
        d.restingHeartRate != null ||
        d.sleepHours != null,
    )
    .map((d) => ({
      user_id: userId,
      metric_date: d.date,
      hrv_ms: d.hrvMs,
      resting_hr: d.restingHeartRate,
      sleep_hours: d.sleepHours,
      source,
      synced_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('health_daily_metrics')
    .upsert(rows, { onConflict: 'user_id,metric_date' });
  if (error) console.warn('[syncHealthHistory] upsert failed:', error.message);
}
