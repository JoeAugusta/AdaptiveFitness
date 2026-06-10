import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Single pending "rest complete" notification — cancel only this, never cancelAll (preserves other scheduled notifications). */
let scheduledRestNotificationId: string | null = null;

export async function cancelRestTimerNotification(): Promise<void> {
  if (!scheduledRestNotificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(scheduledRestNotificationId);
  } catch {
    // silent
  }
  scheduledRestNotificationId = null;
}

export async function scheduleRestCompleteNotification(seconds: number): Promise<void> {
  if (seconds <= 0 || Platform.OS === 'web') return;
  await cancelRestTimerNotification();
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest up',
        body: 'Next set ready. Stay focused.',
        sound: true,
        data: { type: 'rest_timer' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
    scheduledRestNotificationId = id;
  } catch {
    scheduledRestNotificationId = null;
  }
}

/** Foreground rest-complete cue via immediate local notification (no expo-av). No-op on web. */
export async function playRestCompleteSound(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest up',
        body: 'Next set ready. Stay focused.',
        sound: true,
        data: { type: 'rest_timer' },
      },
      trigger: null,
    });
  } catch {
    // silent — haptics still signal completion in ActiveWorkout
  }
}
