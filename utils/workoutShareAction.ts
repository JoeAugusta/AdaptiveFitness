import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../Lib/supabase';
import {
  computeSessionShareStats,
  computeTopLiftsFromSets,
  fallbackJordanNoteFromRpe,
  resolveSessionTitleFromPlan,
  truncateJordanNoteForShare,
  type ShareTopLift,
} from './workoutShare';
import { SHARE_CARD_WIDTH } from '../components/ShareCard';
import type { RefObject } from 'react';
import { View } from 'react-native';

export type ShareCardProps = {
  sessionTitle: string;
  weekNumber: number;
  dayNumber: number;
  totalSets: number;
  avgRpe: number;
  durationMinutes: number;
  prsHit: number;
  topLifts: ShareTopLift[];
  jordanNote: string;
};

export type ShareWorkoutParams = {
  planId: string;
  weekNumber: number;
  dayNumber: number;
  totalSets: number;
  durationMinutes: number;
  prsHit: number;
  latestJordanNote?: string | null;
};

export async function prepareShareCardData(
  params: ShareWorkoutParams,
): Promise<ShareCardProps | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;

    const [{ data: log }, { data: planRow }] = await Promise.all([
      supabase
        .from('workout_logs')
        .select('sets_json')
        .eq('user_id', userId)
        .eq('plan_id', params.planId)
        .eq('week_number', params.weekNumber)
        .eq('day_number', params.dayNumber)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('plans')
        .select('plan_json')
        .eq('id', params.planId)
        .maybeSingle(),
    ]);

    const sets = (log?.sets_json ?? []) as Array<{
      exerciseName?: string;
      weightLbs?: number;
      weight?: number;
      reps?: number;
      rpe?: number;
    }>;

    const { totalSets: setsFromLog, avgRpe } = computeSessionShareStats(sets);
    const totalSetsCount = setsFromLog > 0 ? setsFromLog : params.totalSets;
    const topLifts = computeTopLiftsFromSets(sets);
    const planJson = planRow?.plan_json;

    const latestJordanNote =
      params.latestJordanNote ??
      (planJson &&
      typeof planJson === 'object' &&
      'latestJordanNote' in planJson
        ? String(
            (planJson as { latestJordanNote?: string }).latestJordanNote ?? '',
          ).trim()
        : '');

    const jordanNoteRaw =
      latestJordanNote || fallbackJordanNoteFromRpe(avgRpe);

    return {
      sessionTitle: resolveSessionTitleFromPlan(
        planJson,
        params.weekNumber,
        params.dayNumber,
      ),
      weekNumber: params.weekNumber,
      dayNumber: params.dayNumber,
      totalSets: totalSetsCount,
      avgRpe,
      durationMinutes: params.durationMinutes,
      prsHit: params.prsHit,
      topLifts,
      jordanNote: truncateJordanNoteForShare(jordanNoteRaw),
    };
  } catch (err) {
    if (__DEV__) console.warn('[workoutShareAction] prepareShareCardData failed:', err);
    return null;
  }
}

export async function captureAndShareCard(
  ref: RefObject<View | null>,
): Promise<void> {
  const node = ref.current;
  if (!node) return;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    const uri = await captureRef(node, {
      format: 'jpg',
      quality: 0.95,
      width: SHARE_CARD_WIDTH,
      result: 'tmpfile',
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share workout',
      });
    }
  } catch (err) {
    if (__DEV__) console.warn('[workoutShareAction] captureAndShareCard failed:', err);
  }
}
