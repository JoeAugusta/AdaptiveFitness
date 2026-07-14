import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../Lib/supabase';
import {
  Colors, Fonts, FontSizes, Spacing, Radius,
} from '../constants/design';
import { JordanAvatar } from '../components/JordanAvatar';
import { stripEmDash } from '../utils/jordanText';
import {
  getExerciseRecords,
  isTimedRawSet,
  parseSetsJson,
  plausibilityStatusForRawSet,
  shouldExcludeSetFromRecords,
} from '../Lib/records';
import Purchases from 'react-native-purchases';
import {
  matchFAQIntent,
  checkJordanRateLimit,
  incrementJordanRateCount,
  JORDAN_FREE_LIMIT,
  JORDAN_PRO_LIMIT,
} from '../utils/jordanIntent';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ── Types ──────────────────────────────────────────────────

type ChatMessage = {
  id: string;
  role: 'user' | 'jordan';
  text: string;
  fromFAQ?: boolean;
};

type PlanContext = {
  goal: string | null;
  currentWeek: number;
  totalWeeks: number;
  splitName: string | null;
  currentPhase: string | null;
  latestJordanNote: string | null;
  nextSessionTitle: string | null;
  weeklySnippet: string | null;
  dailyCalories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  exerciseRecordsSummary: string | null;
  recentSetsSummary: string | null;
};

// ── Greeting logic ─────────────────────────────────────────

function buildGreeting(ctx: PlanContext): string {
  if (ctx.latestJordanNote) {
    return stripEmDash(ctx.latestJordanNote);
  }
  if (ctx.currentWeek === 1) {
    return "Week 1 starts here. Your plan is set — I'll be with you every set.";
  }
  if (ctx.nextSessionTitle) {
    return `Week ${ctx.currentWeek} of ${ctx.totalWeeks}. ${ctx.nextSessionTitle} is up next.`;
  }
  const pct = Math.round((ctx.currentWeek / ctx.totalWeeks) * 100);
  const goalLabel = ctx.goal === 'power_hypertrophy'
    ? 'Strength & Size'
    : ctx.goal === 'hypertrophy'
      ? 'Build Muscle'
      : ctx.goal === 'strength'
        ? 'Strength'
        : ctx.goal === 'fat_loss'
          ? 'Fat Loss'
          : 'fitness';
  return `You are ${pct}% through your ${goalLabel} plan. Here is where things stand.`;
}

// ── FAQ data ───────────────────────────────────────────────

type FAQItem = {
  id: string;
  chip: string;
  response: string;
};

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'rpe',
    chip: 'What is RPE?',
    response: `RPE stands for Rate of Perceived Exertion. It is a 1-10 scale for how hard a set felt. 10 is an absolute max effort with nothing left. I use RPE 7-8 as the target zone for most working sets, which means you finish with 2-3 reps still in the tank.\n\nWhy not go to failure every set? Because training to failure every session accumulates fatigue faster than you can recover from it. RPE keeps the stimulus high while leaving recovery capacity intact. When your logged RPE is consistently lower than your target, I increase your weights. When it is higher, I back off.`,
  },
  {
    id: 'progression',
    chip: 'How does progression work?',
    response: `Each week I look at your logged RPE against your target RPE for every exercise. The gap drives the adjustment:\n\nRPE well below target: load goes up meaningfully.\nRPE on target: small increase to keep the stimulus progressing.\nRPE above target: load holds or drops slightly.\n\nI also track whether you are hitting your rep targets. Missing reps at a given weight tells me the load is too high regardless of what RPE you reported. Both signals matter. Progression is never a fixed formula — it is built from what you actually did.`,
  },
  {
    id: 'pyramid',
    chip: 'What are pyramid sets?',
    response: `Pyramid sets build toward a heavy top set. Each set gets heavier and the reps drop. The build sets prime your nervous system and warm up the movement pattern so the top set is a true max effort without the injury risk of loading cold.\n\nA 4-set pyramid on bench press might look like:\nSet 1: 185 lbs x 8\nSet 2: 205 lbs x 6\nSet 3: 225 lbs x 4\nSet 4: 245 lbs x 3\n\nThe top set is where the strength adaptation happens. The build sets are the investment that makes it possible.`,
  },
  {
    id: 'weight_change',
    chip: 'Why did my weight change?',
    response: `Your weight changed because your logged RPE from last week told me it should. If your RPE was consistently below your target, the load was too light to drive adaptation — so I increased it. If your RPE ran high, I held or reduced to protect your recovery.\n\nI also factor in whether you hit your rep targets. Missing reps is a signal that the load is already too high, independent of RPE.\n\nIf the change feels wrong when you get to the gym, trust the first set. If RPE is way off, you can adjust.`,
  },
  {
    id: 'deload',
    chip: "What's a deload week?",
    response: `A deload is a planned reduction in training load — typically week 4 of your cycle. Volume drops by roughly one set per exercise and weights reduce to about 85% of your working loads.\n\nDeloads exist because strength and muscle are not built during training — they are built during recovery. Heavy training creates the stimulus. Sleep, food, and rest create the adaptation. After 3 weeks of progressive overload, your body needs a week to catch up.\n\nSkipping deloads feels productive. It usually is not. Most plateaus trace back to accumulated fatigue that a timely deload would have cleared.`,
  },
  {
    id: 'rest',
    chip: 'Why are rest times long?',
    response: `Rest period length is determined by what you are training for. Heavy compound sets deplete phosphocreatine stores and recruit high-threshold motor units. Both take time to recover. Cutting rest short means the next set starts from a fatigued position, which limits how much weight you can move and distorts the training signal.\n\nFor strength and power work: 3-4 minutes.\nFor hypertrophy accessories: 60-90 seconds.\nFor isolation work: 45-60 seconds.\n\nThe timer is a recommendation, not a rule. If you feel ready sooner on a light set, go. If you need more on a heavy one, take it.`,
  },
  {
    id: 'sets',
    chip: 'How are my sets structured?',
    response: `Your plan uses two set structures depending on the exercise.\n\nPyramid sets — for barbell and dumbbell compounds. Weight builds across sets to a heavy top set. Reps decrease as weight increases.\n\nStraight sets — for isolation exercises, cable work, and machines. Same weight and reps across all sets. The focus is volume and muscle fatigue, not peak load.\n\nThe structure is chosen based on what drives the most adaptation for that movement. Compounds respond well to peak loading. Isolations respond to sustained tension.`,
  },
  {
    id: 'tracking',
    chip: 'What does Jordan track?',
    response: `Every set you log gives me data: weight, reps, and RPE. From that I track:\n\nYour effective 1RM estimate for key lifts.\nRPE trend vs target over time.\nVolume per muscle group per week.\nSession-to-session progression rate.\nDeload timing based on accumulated fatigue signals.\n\nIf you have a heart rate monitor connected, I also track HR recovery between sets and session HR trend, which tells me how your cardiovascular system is handling the training load.\n\nAll of it feeds into what I build for the following week.`,
  },
];

if (Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ]),
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={typingStyles.row}>
      <View style={typingStyles.avatarSlot}>
        <JordanAvatar size={24} />
      </View>
      <View style={typingStyles.bubble}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[typingStyles.dot, { opacity: dot }]}
          />
        ))}
      </View>
    </View>
  );
}

const typingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  avatarSlot: { marginBottom: 2 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.textSecondary,
  },
});

// ── Main component ─────────────────────────────────────────

export default function JordanScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

  const [planCtx, setPlanCtx] = useState<PlanContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [faqExpanded, setFaqExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [rateUsed, setRateUsed] = useState(0);
  const [rateLimit, setRateLimit] = useState(JORDAN_FREE_LIMIT);
  const [rateLimitHit, setRateLimitHit] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  // ── Load plan context ──

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } =
          await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        const [planRes, summaryRes, macroRes, recordsRes, lastLogRes] = await Promise.all([
          supabase
            .from('plans')
            .select('current_week, total_weeks, plan_json')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('weekly_summaries')
            .select('summary_json')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('macro_plans')
            .select('daily_calories, protein_g, carbs_g, fat_g')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          getExerciseRecords(userId).catch(() => [] as Awaited<ReturnType<typeof getExerciseRecords>>),
          supabase
            .from('workout_logs')
            .select('sets_json')
            .eq('user_id', userId)
            .eq('skipped', false)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const plan = planRes.data;
        const pj = plan?.plan_json as Record<string, unknown> | null;

        // Find next unlogged session title
        let nextSessionTitle: string | null = null;
        const weeks = (pj?.weeks as Array<{
          weekNumber?: number;
          days?: Array<{ type?: string; title?: string; completed?: boolean }>;
        }>) ?? [];
        const currentWeekData = weeks.find(
          w => w.weekNumber === plan?.current_week,
        );
        if (currentWeekData?.days) {
          const nextDay = currentWeekData.days.find(
            d => d.type === 'workout' && !d.completed,
          );
          nextSessionTitle = nextDay?.title ?? null;
        }

        const sj = summaryRes.data?.summary_json as
          | { performanceSummary?: string; headline?: string }
          | null;

        const exerciseRecordsSummary =
          recordsRes.length > 0
            ? recordsRes
                .slice(0, 8)
                .map(
                  (r) =>
                    `${r.display_name}: ${r.best_e1rm} lbs est. 1RM (${r.best_load}×${r.best_reps})`,
                )
                .join('; ')
            : null;

        const recentSets = parseSetsJson(lastLogRes.data?.sets_json);
        const recentQualifying = recentSets
          .filter((s) => {
            const name =
              typeof s.exerciseName === 'string' ? s.exerciseName.trim() : '';
            if (!name) return false;
            const weight = Number(s.weightLbs ?? s.weight ?? 0);
            const reps = Number(s.reps ?? 0);
            return !shouldExcludeSetFromRecords({
              is_timed: isTimedRawSet(s),
              plausibility_status: plausibilityStatusForRawSet(s),
              exercise_name: name,
              weight_lbs: weight,
              reps,
              rpe: s.rpe == null || s.rpe === 0 ? null : Number(s.rpe),
            });
          })
          .slice(0, 12)
          .map((s) => {
            const name = String(s.exerciseName ?? '').trim();
            const w = Math.round(Number(s.weightLbs ?? 0));
            const r = Number(s.reps ?? 0);
            return `${name} ${w}×${r}`;
          });
        const recentSetsSummary =
          recentQualifying.length > 0 ? recentQualifying.join('; ') : null;

        // Clear unviewed summary badge
        await AsyncStorage.removeItem('hone_unviewed_summary_week');

        if (!cancelled) {
          setPlanCtx({
            goal: (pj?.goal as string) ?? null,
            currentWeek: plan?.current_week ?? 1,
            totalWeeks: plan?.total_weeks ?? 12,
            splitName: (pj?.splitName as string) ?? null,
            currentPhase: (pj?.currentPhase as string) ?? null,
            latestJordanNote:
              (pj?.latestJordanNote as string) ?? null,
            nextSessionTitle,
            weeklySnippet:
              sj?.performanceSummary ?? sj?.headline ?? null,
            dailyCalories:
              (macroRes.data?.daily_calories as number) ?? null,
            proteinG:
              (macroRes.data?.protein_g as number) ?? null,
            carbsG:
              (macroRes.data?.carbs_g as number) ?? null,
            fatG:
              (macroRes.data?.fat_g as number) ?? null,
            exerciseRecordsSummary,
            recentSetsSummary,
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('[JordanScreen] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        const pro = !!info.entitlements.active['pro'];
        setIsPro(pro);
        const { used, limit } = await checkJordanRateLimit(pro);
        setRateUsed(used);
        setRateLimit(limit);
        setRateLimitHit(used >= limit);
      } catch {
        // Default to free limits on error
        const { used, limit } = await checkJordanRateLimit(false);
        setRateUsed(used);
        setRateLimit(limit);
        setRateLimitHit(used >= limit);
      }
    })();
  }, []);

  // ── FAQ tap handler ──

  const toggleFAQ = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut,
    );
    setFaqExpanded(prev => !prev);
  }, []);

  const handleFAQTap = useCallback((item: FAQItem) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: item.chip,
      fromFAQ: true,
    };
    const jordanMsg: ChatMessage = {
      id: `j-${Date.now()}`,
      role: 'jordan',
      text: item.response,
      fromFAQ: true,
    };
    setMessages(prev => [...prev, userMsg, jordanMsg]);
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut,
    );
    setFaqExpanded(false);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    // Check rate limit first
    const { allowed, used, limit } =
      await checkJordanRateLimit(isPro);
    if (!allowed) {
      setRateLimitHit(true);
      setRateUsed(used);
      setRateLimit(limit);
      return;
    }

    // Check FAQ intent — serve locally if match
    const faqKey = matchFAQIntent(text);
    if (faqKey) {
      const faqItem = FAQ_ITEMS.find(f => f.id === faqKey);
      if (faqItem) {
        handleFAQTap(faqItem);
        setInputText('');
        return;
      }
    }

    // No FAQ match — fire live API
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      // Build conversation history from prior messages
      // (exclude FAQ responses from history — they weren't
      //  generated by the model and would confuse context)
      const history = messages
        .filter(m => !m.fromFAQ)
        .slice(-6)
        .map(m => ({
          role: m.role === 'user'
            ? 'user' as const
            : 'assistant' as const,
          content: m.text,
        }));

      const { data, error } = await supabase.functions.invoke(
        'jordan-chat',
        {
          body: {
            message: text,
            conversationHistory: history,
            planContext: planCtx
              ? {
                  goal: planCtx.goal,
                  currentWeek: planCtx.currentWeek,
                  totalWeeks: planCtx.totalWeeks,
                  splitName: planCtx.splitName,
                  currentPhase: planCtx.currentPhase,
                  latestJordanNote: planCtx.latestJordanNote,
                  nextSessionTitle: planCtx.nextSessionTitle,
                  dailyCalories: planCtx.dailyCalories,
                  proteinG: planCtx.proteinG,
                  carbsG: planCtx.carbsG,
                  fatG: planCtx.fatG,
                  exerciseRecordsSummary: planCtx.exerciseRecordsSummary,
                  recentSetsSummary: planCtx.recentSetsSummary,
                }
              : {},
          },
        },
      );

      if (error || !data?.response) {
        throw new Error(error?.message ?? 'No response');
      }

      const jordanMsg: ChatMessage = {
        id: `j-${Date.now()}`,
        role: 'jordan',
        text: stripEmDash(data.response),
      };

      setMessages(prev => [...prev, jordanMsg]);

      // Increment rate counter
      await incrementJordanRateCount();
      const newUsed = rateUsed + 1;
      setRateUsed(newUsed);
      setRateLimitHit(newUsed >= rateLimit);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (err) {
      if (__DEV__) console.warn('[JordanScreen] send failed:', err);
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'jordan',
        text: "Something went wrong on my end. Try again in a moment.",
      };
      setMessages(prev => [...prev, errMsg]);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } finally {
      setIsSending(false);
    }
  }, [
    inputText,
    isSending,
    isPro,
    messages,
    planCtx,
    rateUsed,
    rateLimit,
    handleFAQTap,
  ]);

  // ── Render ──

  const greeting = planCtx ? buildGreeting(planCtx) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backHit}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Jordan</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Greeting card */}
          {loading ? (
            <View style={styles.greetingCard}>
              <ActivityIndicator color={Colors.accent} size="small" />
            </View>
          ) : greeting ? (
            <View style={styles.greetingCard}>
              <View style={styles.greetingRow}>
                <JordanAvatar size={40} />
                <View style={styles.greetingTextBlock}>
                  <Text style={styles.greetingLabel}>JORDAN</Text>
                  <Text style={styles.greetingText}>
                    {stripEmDash(greeting)}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* This Week section */}
          {!loading && planCtx ? (
            <View style={styles.thisWeekBlock}>
              <Text style={styles.sectionLabel}>THIS WEEK</Text>
              <View style={styles.thisWeekCard}>
                <View style={styles.thisWeekRow}>
                  <Text style={styles.thisWeekRowLabel}>Phase</Text>
                  <Text style={styles.thisWeekRowValue}>
                    {planCtx.currentPhase
                      ? `Week ${planCtx.currentWeek} — ${planCtx.currentPhase}`
                      : `Week ${planCtx.currentWeek} of ${planCtx.totalWeeks}`}
                  </Text>
                </View>
                {planCtx.nextSessionTitle ? (
                  <View style={[styles.thisWeekRow, styles.thisWeekRowBorder]}>
                    <Text style={styles.thisWeekRowLabel}>Up next</Text>
                    <Text style={styles.thisWeekRowValue}>
                      {planCtx.nextSessionTitle}
                    </Text>
                  </View>
                ) : null}
                {planCtx.weeklySnippet ? (
                  <View style={[styles.thisWeekRow, styles.thisWeekRowBorder]}>
                    <Text style={[styles.thisWeekRowValue, styles.thisWeekSnippet]}>
                      {stripEmDash(planCtx.weeklySnippet)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* FAQ accordion */}
          <TouchableOpacity
            style={styles.faqHeader}
            activeOpacity={0.7}
            onPress={toggleFAQ}
          >
            <Text style={[styles.sectionLabel, { marginTop: 0 }]}>
              ASK JORDAN
            </Text>
            <Text style={[
              styles.faqChevron,
              faqExpanded && styles.faqChevronOpen,
            ]}>
              ▾
            </Text>
          </TouchableOpacity>

          {faqExpanded ? (
            <View style={styles.faqList}>
              {FAQ_ITEMS.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.faqRow,
                    index === FAQ_ITEMS.length - 1 &&
                      styles.faqRowLast,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleFAQTap(item)}
                >
                  <Text style={styles.faqRowText}>{item.chip}</Text>
                  <Text style={styles.faqRowChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* Chat thread */}
          {(messages.length > 0 || isSending) ? (
            <View style={styles.chatThread}>
              {messages.map(msg => (
                <View
                  key={msg.id}
                  style={[
                    styles.bubbleRow,
                    msg.role === 'user'
                      ? styles.bubbleRowUser
                      : styles.bubbleRowJordan,
                  ]}
                >
                  {msg.role === 'jordan' ? (
                    <View style={styles.jordanAvatarSmall}>
                      <JordanAvatar size={24} />
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.bubble,
                      msg.role === 'user'
                        ? styles.bubbleUser
                        : styles.bubbleJordan,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        msg.role === 'user'
                          ? styles.bubbleTextUser
                          : styles.bubbleTextJordan,
                      ]}
                    >
                      {msg.text}
                    </Text>
                  </View>
                </View>
              ))}
              {isSending ? <TypingIndicator /> : null}
            </View>
          ) : null}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Input footer — Stage 2: live */}
        <View
          style={[
            styles.inputFooter,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          {rateLimitHit ? (
            <View style={styles.rateLimitBanner}>
              <Text style={styles.rateLimitText}>
                {isPro
                  ? `You have used all ${JORDAN_PRO_LIMIT} questions for today. Come back tomorrow.`
                  : `You have used your ${JORDAN_FREE_LIMIT} free questions for today. Upgrade to Pro for ${JORDAN_PRO_LIMIT} per day, or come back tomorrow.`}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask Jordan anything..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline={false}
                  returnKeyType="send"
                  onSubmitEditing={() => void handleSend()}
                  editable={!isSending}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!inputText.trim() || isSending) &&
                      styles.sendButtonDisabled,
                  ]}
                  onPress={() => void handleSend()}
                  disabled={!inputText.trim() || isSending}
                  activeOpacity={0.8}
                >
                  {isSending ? (
                    <ActivityIndicator
                      size="small"
                      color={Colors.textPrimary}
                    />
                  ) : (
                    <Text style={styles.sendIcon}>↑</Text>
                  )}
                </TouchableOpacity>
              </View>
              {rateUsed > 0 && (
                <Text style={styles.rateCounter}>
                  {rateUsed} of {rateLimit} questions used today
                </Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backHit: { paddingRight: Spacing.sm },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerRight: { width: 28 },

  greetingCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.divider,
    minHeight: 72,
    justifyContent: 'center',
  },
  greetingRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  greetingTextBlock: { flex: 1 },
  greetingLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  greetingText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    lineHeight: 22,
  },

  sectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },

  thisWeekBlock: { marginBottom: Spacing.xs },
  thisWeekCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  thisWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  thisWeekRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  thisWeekRowLabel: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    flexShrink: 0,
    paddingTop: 2,
  },
  thisWeekRowValue: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  thisWeekSnippet: {
    textAlign: 'left',
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },

  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  faqChevron: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  faqChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  faqList: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  faqRowLast: {
    borderBottomWidth: 0,
  },
  faqRowText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  faqRowChevron: {
    fontFamily: Fonts.regular,
    fontSize: 18,
    color: Colors.textSecondary,
    marginLeft: Spacing.sm,
  },

  chatThread: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowJordan: { justifyContent: 'flex-start' },
  jordanAvatarSmall: { marginBottom: 2 },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    padding: Spacing.md,
  },
  bubbleUser: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleJordan: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    lineHeight: 22,
  },
  bubbleTextUser: { color: Colors.textPrimary },
  bubbleTextJordan: { color: Colors.textPrimary },

  inputFooter: {
    backgroundColor: Colors.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendIcon: {
    fontFamily: Fonts.bold,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  rateCounter: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  rateLimitBanner: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  rateLimitText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  inputFooterNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
