import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const REENGAGEMENT_NOTIF_KEY = 'reengagement_notif_id';

/**
 * Request notification permissions. Returns true if granted.
 * Call before scheduling any notification.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Schedule the 24hr re-engagement push.
 * Cancels any previously scheduled re-engagement notification before scheduling.
 * Stores the notification identifier in AsyncStorage so it can be cancelled later.
 *
 * Copy: "Your plan is ready — Jordan's waiting. Time to earn Week 1."
 * Fires 24 hours from now.
 */
export async function scheduleReEngagementPush(): Promise<void> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;

    // Cancel any existing re-engagement notification
    await cancelReEngagementPush();

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your plan is ready — Jordan's waiting.",
        body: 'Time to earn Week 1.',
        sound: true,
        data: { deepLink: 'dashboard' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 60 * 60 * 24, // 24 hours
        repeats: false,
      },
    });

    await AsyncStorage.setItem(REENGAGEMENT_NOTIF_KEY, notifId);
  } catch (e) {
    // Notification scheduling is non-blocking — never crash on failure
    console.warn('[Notifications] scheduleReEngagementPush failed:', e);
  }
}

/**
 * Cancel the pending re-engagement notification.
 * Call when the user starts their first workout.
 */
export async function cancelReEngagementPush(): Promise<void> {
  try {
    const notifId = await AsyncStorage.getItem(REENGAGEMENT_NOTIF_KEY);
    if (notifId) {
      await Notifications.cancelScheduledNotificationAsync(notifId);
      await AsyncStorage.removeItem(REENGAGEMENT_NOTIF_KEY);
    }
  } catch (e) {
    console.warn('[Notifications] cancelReEngagementPush failed:', e);
  }
}
