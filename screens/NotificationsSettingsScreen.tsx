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
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

// ── Constants ──

const STORAGE_KEY = 'notification_preferences';

const defaultTime = new Date();
defaultTime.setHours(9, 0, 0, 0);

// ── Types ──

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
    <Animated.View style={[styles.skeletonLoader, { opacity: pulseAnim }]}>
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

  const [permissionGranted, setPermissionGranted] = useState(false);
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

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') return;
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionGranted(status === 'granted');
    })();
  }, []);

  // Load persisted preferences on mount
  useEffect(() => {
    const init = async () => {
      try {
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

  const handleRequestPermissions = async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setPermissionGranted(true);
      } else {
        Alert.alert(
          'Notifications Disabled',
          'To receive workout reminders, enable notifications for Adaptive Fitness in your device Settings.',
          [{ text: 'OK' }],
        );
      }
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

  const renderPermissionSection = () => {
    const isWeb = Platform.OS === 'web';

    return (
      <View style={styles.permissionContent}>
        <View style={styles.bannerCard}>
          <Text style={styles.bannerEmoji}>🔔</Text>
          <Text style={styles.bannerTitle}>Enable Notifications</Text>
          <Text style={styles.bannerBody}>
            Get reminders for your scheduled workouts and celebrate milestones as you hit them.
          </Text>

          {isWeb ? (
            <TouchableOpacity
              style={[styles.permissionEnableBtn, styles.bannerBtnWeb]}
              onPress={undefined}
              activeOpacity={1}
              disabled
            >
              <Text style={styles.permissionEnableBtnTextMuted}>Available on iOS & Android</Text>
            </TouchableOpacity>
          ) : permissionGranted ? (
            <View style={styles.permissionStatusRow}>
              <View style={styles.permissionStatusDot} />
              <Text style={styles.permissionStatusLabel}>Notifications enabled</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.permissionEnableBtn}
              onPress={handleRequestPermissions}
              activeOpacity={0.85}
            >
              <Text style={styles.permissionEnableBtnText}>Enable Notifications</Text>
            </TouchableOpacity>
          )}
        </View>
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
            trackColor={{ false: Colors.divider, true: Colors.accent }}
            thumbColor="#FFFFFF" /* TODO: map to design token */
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
                <Text style={styles.rowChevron}>›</Text>
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
            trackColor={{ false: Colors.divider, true: Colors.accent }}
            thumbColor="#FFFFFF" /* TODO: map to design token */
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
                <Text style={styles.rowChevron}>›</Text>
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
            trackColor={{ false: Colors.divider, true: Colors.accent }}
            thumbColor="#FFFFFF" /* TODO: map to design token */
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
            trackColor={{ false: Colors.divider, true: Colors.accent }}
            thumbColor="#FFFFFF" /* TODO: map to design token */
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
            trackColor={{ false: Colors.divider, true: Colors.accent }}
            thumbColor="#FFFFFF" /* TODO: map to design token */
          />
        </View>
      </View>
    </>
  );

  // ── Main render ──

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.screenInner}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBackSlot}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} pointerEvents="none">
            Notifications
          </Text>
          <View style={styles.headerBackSlot} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {loading ? (
          <SkeletonRows pulseAnim={pulseAnim} />
        ) : (
          <>
            {renderPermissionSection()}
            {renderPreferences()}
          </>
        )}
        </ScrollView>
      </View>

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
              textColor={Colors.textPrimary}
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
              textColor={Colors.textPrimary}
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
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  screenInner: { flex: 1, paddingHorizontal: Spacing.xl },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 64 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackSlot: {
    width: 44,
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    paddingRight: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },

  permissionContent: {
    marginTop: 48,
    alignItems: 'center',
    width: '100%',
  },
  bannerCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 32,
    alignItems: 'center',
    width: '100%',
  },
  bannerEmoji: {
    fontFamily: Fonts.regular,
    fontSize: 48,
    marginBottom: 16,
  },
  bannerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  bannerBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  bannerBtn: {
    marginTop: 24,
    width: '100%',
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBtnWeb: { opacity: 0.55 },
  bannerBtnLabel: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bannerNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },

  sectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 24,
  },

  sectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  prefRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prefLabelGroup: { flex: 1, marginRight: 12 },
  prefLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  prefSubLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  timeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeValue: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  rowChevron: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    color: Colors.textTertiary,
  },

  // ── Divider ──
  divider: { height: 1, backgroundColor: Colors.divider },

  skeletonLoader: {
    width: '100%',
    marginTop: 8,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 8,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  skeletonPill: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.divider,
    width: '45%',
  },
  skeletonPillShort: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.divider,
    width: '20%',
  },

  // ── Time picker modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold,  marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontFamily: Fonts.regular,
    color: Colors.textPrimary, fontSize: FontSizes.body, },
  modalConfirmBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { color: '#FFFFFF', fontSize: FontSizes.body, fontFamily: Fonts.semiBold, }, // TODO: map to design token
});
