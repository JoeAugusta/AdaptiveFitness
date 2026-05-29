import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
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
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { Ionicons } from '@expo/vector-icons';

// ── Constants ──

const STORAGE_KEY = 'notification_preferences';
const ASYNC_KEY_WORKOUT_TIME = 'workoutReminderTime';
const ASYNC_KEY_WEIGH_IN_TIME = 'weighInReminderTime';

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
  date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

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
  const [weighInReminderEnabled, setWeighInReminderEnabled] = useState(false);
  const [prAlertsEnabled, setPrAlertsEnabled] = useState(false);
  const [weeklySummaryEnabled, setWeeklySummaryEnabled] = useState(false);
  const [streakProtectionEnabled, setStreakProtectionEnabled] = useState(false);
  const [workoutReminderTime, setWorkoutReminderTime] = useState(
    () => new Date(new Date().setHours(9, 0, 0, 0)),
  );
  const [weighInReminderTime, setWeighInReminderTime] = useState(
    () => new Date(new Date().setHours(7, 0, 0, 0)),
  );
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);
  const [showWeighInPicker, setShowWeighInPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weighInNotifId = useRef<string | null>(null);
  const workoutNotifId = useRef<string | null>(null);
  const workoutTimeSnapshotRef = useRef<Date | null>(null);
  const weighInTimeSnapshotRef = useRef<Date | null>(null);

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
        const savedWorkoutKey = await AsyncStorage.getItem(ASYNC_KEY_WORKOUT_TIME);
        const savedWeighInKey = await AsyncStorage.getItem(ASYNC_KEY_WEIGH_IN_TIME);

        let prefs: NotificationPreferences | null = null;
        if (raw) {
          prefs = JSON.parse(raw) as NotificationPreferences;
          setWorkoutRemindersEnabled(prefs.workoutReminders);
          setPrAlertsEnabled(prefs.prAlerts);
          setWeeklySummaryEnabled(prefs.weeklySummary);
          setStreakProtectionEnabled(prefs.streakProtection);
          if (prefs.weighInReminder !== undefined) {
            setWeighInReminderEnabled(prefs.weighInReminder);
          }
        }

        let workoutT = new Date(new Date().setHours(9, 0, 0, 0));
        let weighT = new Date(new Date().setHours(7, 0, 0, 0));

        if (prefs?.reminderTimeISO) {
          const d = new Date(prefs.reminderTimeISO);
          if (!isNaN(d.getTime())) workoutT = d;
        }
        if (prefs?.weighInTimeISO) {
          const d = new Date(prefs.weighInTimeISO);
          if (!isNaN(d.getTime())) weighT = d;
        }

        if (savedWorkoutKey) {
          const d = new Date(savedWorkoutKey);
          if (!isNaN(d.getTime())) workoutT = d;
        }
        if (savedWeighInKey) {
          const d = new Date(savedWeighInKey);
          if (!isNaN(d.getTime())) weighT = d;
        }

        setWorkoutReminderTime(workoutT);
        setWeighInReminderTime(weighT);
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
            reminderTimeISO: workoutReminderTime.toISOString(),
            weighInReminder: weighInReminderEnabled,
            weighInTimeISO: weighInReminderTime.toISOString(),
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
      workoutReminderTime,
      weighInReminderEnabled,
      weighInReminderTime,
    ],
  );

  // ── Notification scheduling ──

  const scheduleWorkoutReminder = useCallback(
    async (enabled: boolean, time: Date) => {
      if (Platform.OS === 'web') return;
      try {
        if (workoutNotifId.current) {
          await Notifications.cancelScheduledNotificationAsync(
            workoutNotifId.current,
          );
          workoutNotifId.current = null;
        }
        if (enabled) {
          const id = await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Time to train',
              body: "Your workout is ready. Let's get it done.",
              sound: true,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: time.getHours(),
              minute: time.getMinutes(),
            },
          });
          workoutNotifId.current = id;
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
      await scheduleWorkoutReminder(value, workoutReminderTime);
      schedulePreferencesSave({ workoutReminders: value });
    },
    [workoutReminderTime, scheduleWorkoutReminder, schedulePreferencesSave],
  );

  const toggleWeighInReminder = useCallback(
    async (value: boolean) => {
      setWeighInReminderEnabled(value);
      if (Platform.OS !== 'web') {
        try {
          if (value) {
            const id = await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Time to weigh in',
                body: 'Step on the scale and log today\'s weight in hone.',
                sound: true,
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: weighInReminderTime.getHours(),
                minute: weighInReminderTime.getMinutes(),
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
    [weighInReminderTime, schedulePreferencesSave],
  );

  const rescheduleWeighInNotification = useCallback(async (time: Date) => {
    if (Platform.OS === 'web' || !weighInReminderEnabled) return;
    try {
      if (weighInNotifId.current) {
        await Notifications.cancelScheduledNotificationAsync(weighInNotifId.current);
      }
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Time to weigh in',
          body: 'Step on the scale and log today\'s weight in hone.',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: time.getHours(),
          minute: time.getMinutes(),
        },
      });
      weighInNotifId.current = id;
    } catch (e) {
      console.error('Weigh-in reschedule error:', e);
    }
  }, [weighInReminderEnabled]);

  const commitWorkoutReminderTime = useCallback(
    async (time: Date) => {
      try {
        await AsyncStorage.setItem(ASYNC_KEY_WORKOUT_TIME, time.toISOString());
      } catch (e) {
        console.error('Workout time save error:', e);
      }
      schedulePreferencesSave({ reminderTimeISO: time.toISOString() });
      if (workoutRemindersEnabled) {
        await scheduleWorkoutReminder(true, time);
      }
    },
    [schedulePreferencesSave, workoutRemindersEnabled, scheduleWorkoutReminder],
  );

  const commitWeighInReminderTime = useCallback(
    async (time: Date) => {
      try {
        await AsyncStorage.setItem(ASYNC_KEY_WEIGH_IN_TIME, time.toISOString());
      } catch (e) {
        console.error('Weigh-in time save error:', e);
      }
      schedulePreferencesSave({ weighInTimeISO: time.toISOString() });
      await rescheduleWeighInNotification(time);
    },
    [schedulePreferencesSave, rescheduleWeighInNotification],
  );

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
          'To receive workout reminders, enable notifications for hone in your device Settings.',
          [{ text: 'OK' }],
        );
      }
    } catch (e) {
      console.error('Permission request error:', e);
    }
  };

  const dismissWorkoutPickerOverlay = () => {
    if (workoutTimeSnapshotRef.current) {
      setWorkoutReminderTime(workoutTimeSnapshotRef.current);
    }
    workoutTimeSnapshotRef.current = null;
    setShowWorkoutPicker(false);
  };

  const onWorkoutPickerDone = () => {
    workoutTimeSnapshotRef.current = null;
    setShowWorkoutPicker(false);
    setWorkoutReminderTime((latest) => {
      void commitWorkoutReminderTime(latest);
      return latest;
    });
  };

  const onAndroidWorkoutTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowWorkoutPicker(false);
    if (event.type === 'dismissed') return;
    if (date) {
      setWorkoutReminderTime(date);
      void commitWorkoutReminderTime(date);
    }
  };

  const openWorkoutPicker = () => {
    if (Platform.OS === 'android') {
      setShowWorkoutPicker(true);
      return;
    }
    workoutTimeSnapshotRef.current = new Date(workoutReminderTime.getTime());
    setShowWorkoutPicker(true);
  };

  const dismissWeighInPickerOverlay = () => {
    if (weighInTimeSnapshotRef.current) {
      setWeighInReminderTime(weighInTimeSnapshotRef.current);
    }
    weighInTimeSnapshotRef.current = null;
    setShowWeighInPicker(false);
  };

  const onWeighInPickerDone = () => {
    weighInTimeSnapshotRef.current = null;
    setShowWeighInPicker(false);
    setWeighInReminderTime((latest) => {
      void commitWeighInReminderTime(latest);
      return latest;
    });
  };

  const onAndroidWeighInTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowWeighInPicker(false);
    if (event.type === 'dismissed') return;
    if (date) {
      setWeighInReminderTime(date);
      void commitWeighInReminderTime(date);
    }
  };

  const openWeighInPicker = () => {
    if (Platform.OS === 'android') {
      setShowWeighInPicker(true);
      return;
    }
    weighInTimeSnapshotRef.current = new Date(weighInReminderTime.getTime());
    setShowWeighInPicker(true);
  };

  // ── Render helpers ──

  const renderPermissionSection = () => {
    const isWeb = Platform.OS === 'web';

    return (
      <View style={styles.permissionContent}>
        <View style={styles.valuePropsCard}>
          <Text style={styles.valuePropsLabel}>JORDAN WILL NOTIFY YOU</Text>

          <View style={styles.valuePropRow}>
            <Ionicons name="notifications-outline" size={20} color={Colors.accent} />
            <Text style={styles.valuePropText}>
              30 minutes before each scheduled session
            </Text>
          </View>

          <View style={styles.valuePropRow}>
            <Ionicons name="clipboard-outline" size={20} color={Colors.accent} />
            <Text style={styles.valuePropText}>
              When your weekly coaching review is ready
            </Text>
          </View>

          <View style={styles.valuePropRow}>
            <Ionicons name="trophy-outline" size={20} color={Colors.accent} />
            <Text style={styles.valuePropText}>When you hit a milestone</Text>
          </View>

          {!isWeb &&
            (!permissionGranted ? (
              <Pressable style={styles.enableButton} onPress={handleRequestPermissions}>
                <Text style={styles.enableButtonText}>Enable Notifications</Text>
              </Pressable>
            ) : (
              <View style={styles.grantedRow}>
                <View style={styles.grantedDot} />
                <Text style={styles.grantedText}>Notifications enabled</Text>
              </View>
            ))}
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
              onPress={openWorkoutPicker}
              activeOpacity={0.7}
            >
              <Text style={styles.prefLabel}>Reminder Time</Text>
              <View style={styles.timeRight}>
                <Text style={styles.timeValue}>{formatTime(workoutReminderTime)}</Text>
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
              onPress={openWeighInPicker}
              activeOpacity={0.7}
            >
              <Text style={styles.prefLabel}>Reminder Time</Text>
              <View style={styles.timeRight}>
                <Text style={styles.timeValue}>{formatTime(weighInReminderTime)}</Text>
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

      {Platform.OS === 'android' && showWorkoutPicker ? (
        <DateTimePicker
          value={workoutReminderTime}
          mode="time"
          display="default"
          onChange={onAndroidWorkoutTimeChange}
        />
      ) : null}

      {Platform.OS === 'android' && showWeighInPicker ? (
        <DateTimePicker
          value={weighInReminderTime}
          mode="time"
          display="default"
          onChange={onAndroidWeighInTimeChange}
        />
      ) : null}

      {showWorkoutPicker && Platform.OS !== 'android' ? (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={dismissWorkoutPickerOverlay}
        >
          <View style={styles.pickerModalRoot}>
            <Pressable
              style={styles.pickerBackdrop}
              onPress={dismissWorkoutPickerOverlay}
              accessibilityRole="button"
              accessibilityLabel="Dismiss time picker"
            />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Workout Reminder Time</Text>
                <Pressable onPress={onWorkoutPickerDone} hitSlop={12}>
                  <Text style={styles.pickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={workoutReminderTime}
                mode="time"
                display="spinner"
                onChange={(_event, date) => {
                  if (date) setWorkoutReminderTime(date);
                }}
                themeVariant="dark"
                textColor={Colors.textPrimary}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {showWeighInPicker && Platform.OS !== 'android' ? (
        <Modal
          transparent
          animationType="slide"
          visible
          onRequestClose={dismissWeighInPickerOverlay}
        >
          <View style={styles.pickerModalRoot}>
            <Pressable
              style={styles.pickerBackdrop}
              onPress={dismissWeighInPickerOverlay}
              accessibilityRole="button"
              accessibilityLabel="Dismiss time picker"
            />
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Daily Weigh-In Time</Text>
                <Pressable onPress={onWeighInPickerDone} hitSlop={12}>
                  <Text style={styles.pickerDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={weighInReminderTime}
                mode="time"
                display="spinner"
                onChange={(_event, date) => {
                  if (date) setWeighInReminderTime(date);
                }}
                themeVariant="dark"
                textColor={Colors.textPrimary}
              />
            </View>
          </View>
        </Modal>
      ) : null}
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
    width: '100%',
  },
  valuePropsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  valuePropsLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  valuePropRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: 10,
  },
  valuePropIcon: {
    fontSize: 16,
    lineHeight: 22,
  },
  valuePropText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
  enableButton: {
    backgroundColor: Colors.accent,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  enableButtonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  grantedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  grantedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  grantedText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
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

  pickerModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  pickerSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: 40,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  pickerTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  pickerDone: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
});
