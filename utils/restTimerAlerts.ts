import { Audio } from 'expo-av';
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
        title: 'Rest complete',
        body: 'Time for your next set.',
        sound: true,
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

export async function playRestCompleteSound(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch {
    // continue — playback may still work
  }

  try {
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/rest_complete.mp3'),
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });
    await sound.playAsync();
  } catch {
    try {
      // Non-standard URI — not supported on all platforms; safe to ignore if it fails.
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'system://short_low_32' } as import('expo-av').AVPlaybackSource,
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void sound.unloadAsync();
        }
      });
      await sound.playAsync();
    } catch {
      // silent — haptics still signal completion in ActiveWorkout
    }
  }
}
