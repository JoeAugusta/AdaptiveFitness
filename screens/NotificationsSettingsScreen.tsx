import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

// ── Design tokens ──

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const DIVIDER_COLOR = '#2D3F55';

// ── Constants ──

const STORAGE_KEY = 'notification_preferences';

const defaultTime = new Date();
defaultTime.setHours(9, 0, 0, 0);

// ── Types ──

type PermissionStatus = 'granted' | 'denied' | 'undetermined';

interface NotificationPreferences {
  workoutReminders: boolean;
  prAlerts: boolean;
  weeklySummary: boolean;
  streakProtection: boolean;
  reminderTimeISO: string;
  weighInReminder: boolean;
  weighInTimeISO: string;
}

// ── Helpers ──

const formatTime = (date: Date): string =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

// ── Sub-components ──

function Divider() {
  return <View style={styles.divider} />;
}

function SkeletonRows({ pulseAnim }: { pulseAnim: Animated.Value }) {
  return (
    <Animated.View style={{ opacity: pulseAnim }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonPill} />
          <View style={styles.skeletonPillShort} />
        </View>
      ))}
    </Animated.View>
  );
}

// ── Main screen ──

export default function NotificationsSettingsScreen() {
  const navigation = useNavigation();

  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>('undetermined');
  const [workoutRemindersEnabled, setWorkoutRemindersEnabled] = useState(false);
  const [prAlertsEnabled, setPrAlertsEnabled] = useState(false);
  const [weeklySummaryEnabled, setWeeklySummaryEnabled] = useState(false);
  const [streakProtectionEnabled, setStreakProtectionEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState<Date>(defaultTime);
  const [pendingTime, setPendingTime] = useState<Date>(defaultTime);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [weighInReminderEnabled, setWeighInReminderEnabled] = useState(false);
  const [weighInTime, setWeighInTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [pendingWeighInTime, setPendingWeighInTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [showWeighInTimePicker, setShowWeighInTimePicker] = useState(false);
  const [loading, setLoading] = useState(true);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weighInNotifId = useRef<string | null>(null);

  // Skeleton pulse while loading
  useEffect(() => {
    if (loading) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current = loop;
      loop.start();
    } else {
      pulseLoop.current?.stop();
    }
  }, [loading, pulseAnim]);

  // Load permission status + persisted preferences on mount
  useEffect(() => {
    const init = async () => {
      try {
        // Permission check
        if (Platform.OS !== 'web') {
          const { status } = await Notifications.getPermissionsAsync();
          setPermissionStatus(status as PermissionStatus);
        }

        // Hydrate preferences from AsyncStorage
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const prefs = JSON.parse(raw) as NotificationPreferences;
          setWorkoutRemindersEnabled(prefs.workoutReminders);
          setPrAlertsEnabled(prefs.prAlerts);
          setWeeklySummaryEnabled(prefs.weeklySummary);
          setStreakProtectionEnabled(prefs.streakProtection);
          const savedTime = new Date(prefs.reminderTimeISO);
          if (!isNaN(savedTime.getTime())) {
            setReminderTime(savedTime);
            setPendingTime(savedTime);
          }
          if (prefs.weighInReminder !== undefined) {
            setWeighInReminderEnabled(prefs.weighInReminder);
          }
          if (prefs.weighInTimeISO) {
            const savedWeighInTime = new Date(prefs.weighInTimeISO);
            if (!isNaN(savedWeighInTime.getTime())) {
              setWeighInTime(savedWeighInTime);
              setPendingWeighInTime(savedWeighInTime);
            }
          }
        }
      } catch (e) {
        console.error('NotificationsSettings init error:', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // ── Persistence ──

  const schedulePreferencesSave = useCallback(
    (overrides?: Partial<NotificationPreferences>) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        try {
          const prefs: NotificationPreferences = {
            workoutReminders: workoutRemindersEnabled,
            prAlerts: prAlertsEnabled,
            weeklySummary: weeklySummaryEnabled,
            streakProtection: streakProtectionEnabled,
            reminderTimeISO: reminderTime.toISOString(),
            weighInReminder: weighInReminderEnabled,
            weighInTimeISO: weighInTime.toISOString(),
            ...overrides,
          };
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        } catch (e) {
          console.error('Preferences save error:', e);
        }
      }, 500);
    },
    [
      workoutRemindersEnabled,
      prAlertsEnabled,
      weeklySummaryEnabled,
      streakProtectionEnabled,
      reminderTime,
      weighInReminderEnabled,
      weighInTime,
    ],
  );

  // ── Notification scheduling ──

  const scheduleWorkoutReminder = useCallback(
    async (enabled: boolean, time: Date) => {
      if (Platform.OS === 'web') return;
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        if (enabled) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Time to train 💪',
              body: 'Your workout is ready. Let\'s get it done.',
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: time.getHours(),
              minute: time.getMinutes(),
            },
          });
        }
      } catch (e) {
        console.error('Notification scheduling error:', e);
      }
    },
    [],
  );

  const toggleWorkoutReminders = useCallback(
    async (value: boolean) => {
      setWorkoutRemindersEnabled(value);
      await scheduleWorkoutReminder(value, reminderTime);
      schedulePreferencesSave({ workoutReminders: value });
    },
    [reminderTime, scheduleWorkoutReminder, schedulePreferencesSave],
  );

  const toggleWeighInReminder = useCallback(
    async (value: boolean) => {
      setWeighInReminderEnabled(value);
      if (Platform.OS !== 'web') {
        try {
          if (value) {
            const id = await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Time to weigh in 🌅',
                body: 'Step on the scale and log today\'s weight in Adaptive Fitness.',
                sound: true,
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: weighInTime.getHours(),
                minute: weighInTime.getMinutes(),
              },
            });
            weighInNotifId.current = id;
          } else if (weighInNotifId.current) {
            await Notifications.cancelScheduledNotificationAsync(weighInNotifId.current);
            weighInNotifId.current = null;
          }
        } catch (e) {
          console.error('Weigh-in notification error:', e);
        }
      }
      schedulePreferencesSave({ weighInReminder: value });
    },
    [weighInTime, schedulePreferencesSave],
  );

  const confirmWeighInTime = () => {
    setWeighInTime(pendingWeighInTime);
    setShowWeighInTimePicker(false);
    if (weighInReminderEnabled && Platform.OS !== 'web') {
      (async () => {
        try {
          if (weighInNotifId.current) {
            await Notifications.cancelScheduledNotificationAsync(weighInNotifId.current);
          }
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Time to weigh in 🌅',
              body: 'Step on the scale and log today\'s weight in Adaptive Fitness.',
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: pendingWeighInTime.getHours(),
              minute: pendingWeighInTime.getMinutes(),
            },
          });
          weighInNotifId.current = id;
        } catch (e) {
          console.error('Weigh-in reschedule error:', e);
        }
      })();
    }
    schedulePreferencesSave({ weighInTimeISO: pendingWeighInTime.toISOString() });
  };

  // ── Permission request ──

  const requestPermissions = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status as PermissionStatus);
    } catch (e) {
      console.error('Permission request error:', e);
    }
  };

  // ── Time picker confirm ──

  const confirmTime = () => {
    setReminderTime(pendingTime);
    setShowTimePicker(false);
    if (workoutRemindersEnabled) {
      scheduleWorkoutReminder(true, pendingTime);
    }
    schedulePreferencesSave({ reminderTimeISO: pendingTime.toISOString() });
  };

  // ── Render helpers ──

  const renderPermissionBanner = () => {
    const isDenied = permissionStatus === 'denied';

    return (
      <View style={styles.bannerCard}>
        <Text style={styles.bannerEmoji}>{isDenied ? '🔕' : '🔔'}</Text>
        <Text style={styles.bannerTitle}>
          {isDenied ? 'Notifications Disabled' : 'Enable Notifications'}
        </Text>
        <Text style={styles.bannerBody}>
          {isDenied
            ? 'To receive workout reminders, enable notifications for Adaptive Fitness in your device Settings.'
            : 'Get reminders for your scheduled workouts and celebrate milestones as you hit them.'}
        </Text>

        {isDenied ? (
          <>
            <TouchableOpacity
              style={styles.bannerBtn}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.8}
            >
              <Text style={styles.bannerBtnText}>Open Settings</Text>
            </TouchableOpacity>
            <Text style={styles.bannerNote}>
              You can change this at any time in Settings → Adaptive Fitness → Notifications.
            </Text>
          </>
        ) : (
          <TouchableOpacity
            style={[
              styles.bannerBtn,
              Platform.OS === 'web' && styles.bannerBtnDisabled,
            ]}
            onPress={Platform.OS !== 'web' ? requestPermissions : undefined}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.bannerBtnText,
                Platform.OS === 'web' && styles.bannerBtnDisabledText,
              ]}
            >
              {Platform.OS === 'web'
                ? 'Available on iOS & Android'
                : 'Enable Notifications'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderPreferences = () => (
    <>
      {/* ── Section 1: Workout Reminders ── */}
      <Text style={styles.sectionHeading}>WORKOUT REMINDERS</Text>
      <View style={styles.sectionCard}>
        <View style={styles.prefRow}>
          <View style={styles.prefLabelGroup}>
            <Text style={styles.prefLabel}>Workout Reminders</Text>
            <Text style={styles.prefSubLabel}>Remind me before scheduled workouts</Text>
          </View>
          <Switch
            value={workoutRemindersEnabled}
            onValueChange={toggleWorkoutReminders}
            trackColor={{ false: DISABLED_BG, true: ACCENT_BLUE }}
            thumbColor="#FFFFFF"
          />
        </View>

        {workoutRemindersEnabled && (
          <>
            <Divider />
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => {
                setPendingTime(reminderTime);
                setShowTimePicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.prefLabel}>Reminder Time</Text>
              <View style={styles.timeRight}>
                <Text style={styles.timeValue}>{formatTime(reminderTime)}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          </>
        )}

        <Divider />
        <View style={styles.prefRow}>
          <View style={styles.prefLabelGroup}>
            <Text style={styles.prefLabel}>Daily Weigh-In</Text>
            <Text style={styles.prefSubLabel}>Morning reminder to log your weight</Text>
          </View>
          <Switch
            value={weighInReminderEnabled}
            onValueChange={toggleWeighInReminder}
            trackColor={{ false: DISABLED_BG, true: ACCENT_BLUE }}
            thumbColor="#FFFFFF"
          />
        </View>

        {weighInReminderEnabled && (
          <>
            <Divider />
            <TouchableOpacity
              style={styles.prefRow}
              onPress={() => {
                setPendingWeighInTime(weighInTime);
                setShowWeighInTimePicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.prefLabel}>Reminder Time</Text>
              <View style={styles.timeRight}>
                <Text style={styles.timeValue}>{formatTime(weighInTime)}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Section 2: Milestones ── */}
      <Text style={styles.sectionHeading}>MILESTONES</Text>
      <View style={styles.sectionCard}>
        <View style={styles.prefRow}>
          <View style={styles.prefLabelGroup}>
            <Text style={styles.prefLabel}>Personal Record Alerts</Text>
            <Text style={styles.prefSubLabel}>Notify me when I hit a new PR</Text>
          </View>
          <Switch
            value={prAlertsEnabled}
            onValueChange={(v) => {
              setPrAlertsEnabled(v);
              schedulePreferencesSave({ prAlerts: v });
            }}
            trackColor={{ false: DISABLED_BG, true: ACCENT_BLUE }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Divider />
        <View style={styles.prefRow}>
          <View style={styles.prefLabelGroup}>
            <Text style={styles.prefLabel}>Weekly Summary</Text>
            <Text style={styles.prefSubLabel}>Sunday evening recap of your week</Text>
          </View>
          <Switch
            value={weeklySummaryEnabled}
            onValueChange={(v) => {
              setWeeklySummaryEnabled(v);
              schedulePreferencesSave({ weeklySummary: v });
            }}
            trackColor={{ false: DISABLED_BG, true: ACCENT_BLUE }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* ── Section 3: Consistency ── */}
      <Text style={styles.sectionHeading}>CONSISTENCY</Text>
      <View style={styles.sectionCard}>
        <View style={styles.prefRow}>
          <View style={styles.prefLabelGroup}>
            <Text style={styles.prefLabel}>Streak Protection</Text>
            <Text style={styles.prefSubLabel}>Alert me if I'm about to break my streak</Text>
          </View>
          <Switch
            value={streakProtectionEnabled}
            onValueChange={(v) => {
              setStreakProtectionEnabled(v);
              schedulePreferencesSave({ streakProtection: v });
            }}
            trackColor={{ false: DISABLED_BG, true: ACCENT_BLUE }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>
    </>
  );

  // ── Main render ──

  return (
    <SafeAreaView style={styles.safe}>
      {/* Navigation header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} pointerEvents="none">
          Notifications
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <SkeletonRows pulseAnim={pulseAnim} />
        ) : permissionStatus === 'granted' ? (
          renderPreferences()
        ) : (
          renderPermissionBanner()
        )}
      </ScrollView>

      {/* ── Time Picker Modal ── */}
      <Modal
        visible={showTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Reminder Time</Text>
            <DateTimePicker
              value={pendingTime}
              mode="time"
              display="spinner"
              onChange={(_event, date) => {
                if (date) setPendingTime(date);
              }}
              textColor={TEXT_PRIMARY}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowTimePicker(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmTime}
                activeOpacity={0.8}
              >
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Weigh-In Time Picker Modal ── */}
      <Modal
        visible={showWeighInTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWeighInTimePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Weigh-In Reminder Time</Text>
            <DateTimePicker
              value={pendingWeighInTime}
              mode="time"
              display="spinner"
              onChange={(_event, date) => {
                if (date) setPendingWeighInTime(date);
              }}
              textColor={TEXT_PRIMARY}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowWeighInTimePicker(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmWeighInTime}
                activeOpacity={0.8}
              >
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG_DARK },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 64 },

  // ── Header ──
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backChevron: { color: ACCENT_BLUE, fontSize: 28 },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
  },

  // ── Permission banners ──
  bannerCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginTop: 24,
    alignItems: 'center',
  },
  bannerEmoji: { fontSize: 40, marginBottom: 12 },
  bannerTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  bannerBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  bannerBtn: {
    marginTop: 20,
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBtnDisabled: { backgroundColor: DISABLED_BG },
  bannerBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  bannerBtnDisabledText: { color: TEXT_SECONDARY },
  bannerNote: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },

  // ── Section headings ──
  sectionHeading: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 24,
    marginHorizontal: 20,
  },

  // ── Preference card ──
  sectionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: 20,
  },
  prefRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prefLabelGroup: { flex: 1, marginRight: 12 },
  prefLabel: { color: TEXT_PRIMARY, fontSize: 15 },
  prefSubLabel: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 },
  timeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeValue: { color: ACCENT_BLUE, fontSize: 15 },
  chevron: { color: TEXT_SECONDARY, fontSize: 22 },

  // ── Divider ──
  divider: { height: 1, backgroundColor: DIVIDER_COLOR },

  // ── Skeleton ──
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: CARD_BG,
    borderRadius: 12,
  },
  skeletonPill: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DISABLED_BG,
    width: '45%',
  },
  skeletonPillShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: DISABLED_BG,
    width: '20%',
  },

  // ── Time picker modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { color: TEXT_PRIMARY, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DIVIDER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { color: TEXT_PRIMARY, fontSize: 15 },
  modalConfirmBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
