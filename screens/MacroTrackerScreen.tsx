import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle as SvgCircle,
  Line as SvgLine,
  Rect,
  Text as SvgText,
  G,
} from 'react-native-svg';
import { supabase } from '../Lib/supabase';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const DIVIDER_COLOR = '#2D3F55';

const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';

const PROTEIN_COLOR = '#3B82F6';
const CARBS_COLOR = '#F59E0B';
const FATS_COLOR = '#22C55E';

interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface MacroLogEntry {
  id: string;
  meal_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

interface DailyTotal {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

type MealSuggestion = {
  name: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  title: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
};

const DIET_OPTIONS = [
  'omnivore',
  'vegetarian',
  'vegan',
  'pescatarian',
  'keto',
  'paleo',
] as const;

const ALLERGY_OPTIONS = ['Gluten', 'Dairy', 'Nuts', 'Eggs', 'Soy', 'Shellfish', 'None'] as const;

function formatDietLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function parseSuggestionsJson(json: unknown): { meals: MealSuggestion[]; jordanNote: string | null } {
  if (!json || typeof json !== 'object') return { meals: [], jordanNote: null };
  const o = json as Record<string, unknown>;
  const names: MealSuggestion['name'][] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const jordanNote = typeof o.jordanNote === 'string' ? o.jordanNote : null;
  if (!Array.isArray(o.meals)) return { meals: [], jordanNote };
  const meals: MealSuggestion[] = [];
  for (const item of o.meals) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const name = m.name;
    if (name !== 'Breakfast' && name !== 'Lunch' && name !== 'Dinner' && name !== 'Snack') continue;
    if (
      typeof m.title !== 'string' ||
      typeof m.description !== 'string' ||
      typeof m.calories !== 'number' ||
      typeof m.protein_g !== 'number' ||
      typeof m.carbs_g !== 'number' ||
      typeof m.fats_g !== 'number'
    ) {
      continue;
    }
    meals.push({
      name,
      title: m.title,
      description: m.description,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fats_g: m.fats_g,
    });
  }
  const ordered = names
    .map((n) => meals.find((x) => x.name === n))
    .filter((x): x is MealSuggestion => x != null);
  return { meals: ordered, jordanNote };
}

const DEFAULT_TARGETS: MacroTargets = { calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 65 };

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;

const QUICK_OPTIONS = [
  { name: 'High Protein Meal', calories: 500, protein_g: 50, carbs_g: 30, fats_g: 15 },
  { name: 'Balanced Meal', calories: 600, protein_g: 35, carbs_g: 65, fats_g: 18 },
  { name: 'Light Meal', calories: 350, protein_g: 25, carbs_g: 40, fats_g: 10 },
  { name: 'Post-Workout Shake', calories: 300, protein_g: 40, carbs_g: 25, fats_g: 5 },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Calorie Ring (SVG) ──

function CalorieRing({ pct }: { pct: number }) {
  const size = 90;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(pct, 100);
  const offset = circ - (clamped / 100) * circ;

  return (
    <Svg width={size} height={size}>
      <SvgCircle
        cx={size / 2} cy={size / 2} r={r}
        stroke={DISABLED_BG} strokeWidth={stroke} fill="none"
      />
      <SvgCircle
        cx={size / 2} cy={size / 2} r={r}
        stroke={ACCENT_BLUE} strokeWidth={stroke} fill="none"
        strokeDasharray={`${circ}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation="-90" origin={`${size / 2}, ${size / 2}`}
      />
      <SvgText
        x={size / 2} y={size / 2 + 5}
        fill={TEXT_PRIMARY} fontSize={14} fontWeight="bold"
        textAnchor="middle"
      >
        {Math.round(clamped)}%
      </SvgText>
    </Svg>
  );
}

// ── Weekly Bar Chart (SVG) ──

function WeeklyBarChart({
  data,
  target,
  width,
}: {
  data: DailyTotal[];
  target: number;
  width: number;
}) {
  const padL = 8;
  const padR = 56;
  const padT = 12;
  const padB = 24;
  const barMaxH = 120;
  const chartW = width - padL - padR;
  const chartH = barMaxH + padT + padB;

  const today = todayStr();

  const last7: DailyTotal[] = [];
  for (let i = 6; i >= 0; i--) {
    const ds = daysAgoStr(i);
    const existing = data.find((d) => d.date === ds);
    last7.push(existing ?? { date: ds, calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 });
  }

  const maxCal = Math.max(target, ...last7.map((d) => d.calories)) || 1;
  const barW = Math.max(12, (chartW / 7) * 0.6);
  const gap = (chartW - barW * 7) / 7;

  const targetY = padT + barMaxH - (target / maxCal) * barMaxH;

  return (
    <Svg width={width} height={chartH}>
      {/* Target dashed line */}
      <SvgLine
        x1={padL} y1={targetY} x2={width - padR + 4} y2={targetY}
        stroke={TEXT_SECONDARY} strokeWidth={1} strokeDasharray="4 4"
      />
      <SvgText x={width - padR + 8} y={targetY + 4} fill={TEXT_SECONDARY} fontSize={10}>
        {target}
      </SvgText>

      {last7.map((d, i) => {
        const barH = d.calories > 0 ? Math.max(4, (d.calories / maxCal) * barMaxH) : 4;
        const x = padL + gap / 2 + i * (barW + gap);
        const y = padT + barMaxH - barH;
        const isToday = d.date === today;

        const pct = target > 0 ? d.calories / target : 0;
        let color: string;
        if (d.calories === 0) color = DISABLED_BG;
        else if (pct >= 0.9) color = GREEN;
        else if (pct >= 0.7) color = AMBER;
        else color = RED;

        const dayDate = new Date(d.date + 'T12:00:00');
        const dayLabel = DAY_LABELS[dayDate.getDay() === 0 ? 6 : dayDate.getDay() - 1];

        return (
          <G key={d.date}>
            <Rect
              x={x} y={y} width={barW} height={barH}
              fill={isToday ? ACCENT_BLUE : color}
              rx={3}
            />
            {isToday && d.calories > 0 && (
              <SvgCircle cx={x + barW / 2} cy={y - 6} r={3} fill={ACCENT_BLUE} />
            )}
            <SvgText
              x={x + barW / 2} y={padT + barMaxH + 16}
              fill={TEXT_SECONDARY} fontSize={10} textAnchor="middle"
            >
              {dayLabel}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Main Screen ──

export default function MacroTrackerScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 72;

  const [targets, setTargets] = useState<MacroTargets | null>(null);
  const [todayLogs, setTodayLogs] = useState<MacroLogEntry[]>([]);
  const [weeklyData, setWeeklyData] = useState<DailyTotal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<string>('Breakfast');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');

  const [mealPrefsSet, setMealPrefsSet] = useState(false);
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [selectedDiet, setSelectedDiet] = useState<string>('omnivore');
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [mealSuggestions, setMealSuggestions] = useState<MealSuggestion[]>([]);
  const [jordanMealNote, setJordanMealNote] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const today = todayStr();
      const weekAgo = daysAgoStr(6);

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('meal_prefs_set, dietary_style, food_allergies')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      const prefsDone = profile?.meal_prefs_set ?? false;
      setMealPrefsSet(prefsDone);
      if (profile?.dietary_style && typeof profile.dietary_style === 'string') {
        setSelectedDiet(profile.dietary_style);
      }
      if (Array.isArray(profile?.food_allergies)) {
        setSelectedAllergies(profile.food_allergies as string[]);
      }

      const [targetsRes, todayRes, weekRes, mealSuggestRes] = await Promise.all([
        supabase
          .from('macro_plans')
          .select('calories_target, protein_g, carbs_g, fats_g')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('macro_logs')
          .select('id, meal_name, calories, protein_g, carbs_g, fats_g')
          .eq('user_id', userId)
          .eq('log_date', today),
        supabase
          .from('macro_logs')
          .select('log_date, calories, protein_g, carbs_g, fats_g')
          .eq('user_id', userId)
          .gte('log_date', weekAgo)
          .order('log_date', { ascending: true }),
        prefsDone
          ? supabase
              .from('meal_suggestions')
              .select('suggestions_json, calories_target')
              .eq('user_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (prefsDone && mealSuggestRes.data) {
        const parsed = parseSuggestionsJson(mealSuggestRes.data.suggestions_json);
        setMealSuggestions(parsed.meals);
        setJordanMealNote(parsed.jordanNote);
      } else {
        setMealSuggestions([]);
        setJordanMealNote(null);
      }

      if (targetsRes.data) {
        setTargets({
          calories: targetsRes.data.calories_target,
          protein_g: targetsRes.data.protein_g,
          carbs_g: targetsRes.data.carbs_g,
          fats_g: targetsRes.data.fats_g,
        });
      } else {
        setTargets(DEFAULT_TARGETS);
      }

      type TodayLogRow = {
        id: string;
        meal_name: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fats_g: number;
      };

      setTodayLogs(
        (todayRes.data ?? []).map((r: TodayLogRow) => ({
          id: r.id,
          meal_name: r.meal_name,
          calories: r.calories,
          protein_g: r.protein_g,
          carbs_g: r.carbs_g,
          fats_g: r.fats_g,
        })),
      );

      const dailyMap = new Map<string, DailyTotal>();
      for (const r of weekRes.data ?? []) {
        const d = r.log_date as string;
        const existing = dailyMap.get(d) ?? { date: d, calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 };
        existing.calories += r.calories;
        existing.protein_g += r.protein_g;
        existing.carbs_g += r.carbs_g;
        existing.fats_g += r.fats_g;
        dailyMap.set(d, existing);
      }
      setWeeklyData(Array.from(dailyMap.values()));
    } catch (e) {
      console.error('MacroTracker load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const t = targets ?? DEFAULT_TARGETS;

  const todayTotals = useMemo(
    () =>
      todayLogs.reduce(
        (acc, log) => ({
          calories: acc.calories + log.calories,
          protein_g: acc.protein_g + log.protein_g,
          carbs_g: acc.carbs_g + log.carbs_g,
          fats_g: acc.fats_g + log.fats_g,
        }),
        { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0 },
      ),
    [todayLogs],
  );

  const calPct = t.calories > 0 ? (todayTotals.calories / t.calories) * 100 : 0;
  const remaining = t.calories - todayTotals.calories;

  // Weekly stats
  const weeklyStats = useMemo(() => {
    let onTarget = 0;
    let totalPct = 0;
    let streak = 0;
    let maxStreak = 0;

    for (let i = 6; i >= 0; i--) {
      const ds = daysAgoStr(i);
      const day = weeklyData.find((d) => d.date === ds);
      const pct = day && t.calories > 0 ? day.calories / t.calories : 0;
      totalPct += pct;
      if (pct >= 0.9) {
        onTarget++;
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 0;
      }
    }

    return {
      daysOnTarget: onTarget,
      bestStreak: maxStreak,
      avgAdherence: Math.round((totalPct / 7) * 100),
    };
  }, [weeklyData, t.calories]);

  // ── Handlers ──

  const handleDelete = async (id: string) => {
    await supabase.from('macro_logs').delete().eq('id', id);
    loadData();
  };

  const handleLogMeal = async () => {
    const cal = parseInt(calories) || 0;
    if (cal <= 0) {
      Alert.alert('Missing Data', 'Please enter at least the calorie amount.');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    await supabase.from('macro_logs').upsert(
      {
        user_id: userId,
        log_date: todayStr(),
        meal_name: selectedMeal,
        calories: cal,
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fats_g: parseFloat(fats) || 0,
      },
      { onConflict: 'user_id,log_date,meal_name' },
    );

    resetModal();
    loadData();
  };

  const resetModal = () => {
    setShowAddModal(false);
    setSelectedMeal('Breakfast');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFats('');
  };

  const fillPreset = (opt: (typeof QUICK_OPTIONS)[number]) => {
    setCalories(String(opt.calories));
    setProtein(String(opt.protein_g));
    setCarbs(String(opt.carbs_g));
    setFats(String(opt.fats_g));
  };

  const toggleAllergy = (label: string) => {
    if (label === 'None') {
      setSelectedAllergies(['None']);
      return;
    }
    setSelectedAllergies((prev) => {
      const withoutNone = prev.filter((x) => x !== 'None');
      if (withoutNone.includes(label)) {
        return withoutNone.filter((x) => x !== label);
      }
      return [...withoutNone, label];
    });
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) throw new Error('No user');

      const allergiesToSave = selectedAllergies.includes('None') ? [] : selectedAllergies;

      const { error: upErr } = await supabase
        .from('user_profiles')
        .update({
          dietary_style: selectedDiet,
          food_allergies: allergiesToSave,
          meal_prefs_set: true,
        })
        .eq('user_id', uid);

      if (upErr) throw upErr;

      const { error: fnErr } = await supabase.functions.invoke('generate-meals', {
        body: { userId: uid },
      });

      if (fnErr) throw fnErr;

      setMealPrefsSet(true);
      setShowPrefsModal(false);
      await loadData();
    } catch {
      Alert.alert('Error', 'Could not save preferences. Please try again.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleLogSuggestedMeal = async (meal: MealSuggestion) => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const { error } = await supabase.from('macro_logs').upsert(
      {
        user_id: userId,
        log_date: todayStr(),
        meal_name: meal.name,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fats_g: meal.fats_g,
      },
      { onConflict: 'user_id,log_date,meal_name' },
    );

    if (error) {
      Alert.alert('Error', 'Could not log meal. Please try again.');
      return;
    }

    loadData();
  };

  // ── Render ──

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT_BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nutrition</Text>
          <Text style={styles.headerSubtitle}>{formatDate(new Date())}</Text>
        </View>

        {!mealPrefsSet && (
          <View style={styles.mealSetupCard}>
            <Text style={styles.mealSetupTitle}>🍽️ Set Up Meal Recommendations</Text>
            <Text style={styles.mealSetupBody}>
              Tell Jordan about your diet and we’ll suggest meals that hit your exact macro targets.
            </Text>
            <TouchableOpacity
              style={styles.mealSetupCta}
              onPress={() => setShowPrefsModal(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.mealSetupCtaText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Section 1 — Calorie Ring */}
        <View style={[styles.card, styles.calorieCard]}>
          <View style={styles.calorieLeft}>
            <Text style={styles.sectionLabel}>CALORIES</Text>
            <Text style={styles.calorieBig}>{todayTotals.calories}</Text>
            <Text style={styles.calorieTarget}>/ {t.calories} kcal</Text>
            <Text style={[styles.calorieRemaining, { color: remaining >= 0 ? GREEN : RED }]}>
              {remaining >= 0 ? `${remaining} kcal remaining` : `${Math.abs(remaining)} kcal over`}
            </Text>
          </View>
          <CalorieRing pct={calPct} />
        </View>

        {/* Section 2 — Macro Breakdown */}
        <View style={styles.macroRow}>
          {([
            { label: 'PROTEIN', val: todayTotals.protein_g, tgt: t.protein_g, color: PROTEIN_COLOR },
            { label: 'CARBS', val: todayTotals.carbs_g, tgt: t.carbs_g, color: CARBS_COLOR },
            { label: 'FATS', val: todayTotals.fats_g, tgt: t.fats_g, color: FATS_COLOR },
          ] as const).map((m) => {
            const pct = m.tgt > 0 ? Math.min(100, (m.val / m.tgt) * 100) : 0;
            return (
              <View key={m.label} style={styles.macroCard}>
                <Text style={styles.macroLabel}>{m.label}</Text>
                <Text style={styles.macroValue}>{Math.round(m.val)}g</Text>
                <Text style={styles.macroTarget}>/ {Math.round(m.tgt)}g</Text>
                <View style={styles.macroBarTrack}>
                  <View style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: m.color }]} />
                </View>
              </View>
            );
          })}
        </View>

        {mealPrefsSet && mealSuggestions.length > 0 && (
          <View style={styles.mealPlanSection}>
            <Text style={styles.mealPlanHeading}>{"TODAY'S MEAL PLAN"}</Text>
            {jordanMealNote ? (
              <Text style={styles.jordanMealNote}>💬 {jordanMealNote}</Text>
            ) : null}
            <Text style={styles.mealPlanSub}>Tap any meal to log it</Text>
            {mealSuggestions.map((meal) => (
              <TouchableOpacity
                key={meal.name}
                style={styles.suggestedMealCard}
                onPress={() => handleLogSuggestedMeal(meal)}
                activeOpacity={0.75}
              >
                <View style={styles.suggestedMealRow1}>
                  <View style={styles.mealNamePill}>
                    <Text style={styles.mealNamePillText}>{meal.name}</Text>
                  </View>
                  <Text style={styles.suggestedMealTitle} numberOfLines={2}>
                    {meal.title}
                  </Text>
                </View>
                <Text style={styles.suggestedMealDesc}>{meal.description}</Text>
                <View style={styles.suggestedMacroRow}>
                  <View style={styles.sMacroPillNeutral}>
                    <Text style={styles.sMacroPillNeutralText}>{meal.calories} cal</Text>
                  </View>
                  <View style={styles.sMacroPillBlue}>
                    <Text style={styles.sMacroPillWhiteText}>{meal.protein_g}g protein</Text>
                  </View>
                  <View style={styles.sMacroPillAmber}>
                    <Text style={styles.sMacroPillWhiteText}>{meal.carbs_g}g carbs</Text>
                  </View>
                  <View style={styles.sMacroPillGreen}>
                    <Text style={styles.sMacroPillWhiteText}>{meal.fats_g}g fat</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {mealPrefsSet && mealSuggestions.length === 0 && (
          <View style={styles.generatingRow}>
            <ActivityIndicator size="small" color={ACCENT_BLUE} />
            <Text style={styles.generatingText}>Generating your meal plan...</Text>
          </View>
        )}

        {/* Section 3 — Today's Meals */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Today's Meals</Text>
          <TouchableOpacity onPress={() => setShowAddModal(true)} activeOpacity={0.7}>
            <Text style={styles.addMealBtn}>+ Add Meal</Text>
          </TouchableOpacity>
        </View>

        {todayLogs.length === 0 ? (
          <View style={[styles.card, styles.emptyMeals]}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={styles.emptyTitle}>No meals logged yet</Text>
            <Text style={styles.emptySubtitle}>Tap + Add Meal to start tracking</Text>
          </View>
        ) : (
          todayLogs.map((meal) => (
            <View key={meal.id} style={styles.mealCard}>
              <View style={styles.mealTopRow}>
                <Text style={styles.mealName}>{meal.meal_name}</Text>
                <TouchableOpacity onPress={() => handleDelete(meal.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.trashIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.mealCal}>{meal.calories} kcal</Text>
              <View style={styles.macroPillRow}>
                <View style={styles.macroPill}><Text style={styles.macroPillText}>P: {Math.round(meal.protein_g)}g</Text></View>
                <View style={styles.macroPill}><Text style={styles.macroPillText}>C: {Math.round(meal.carbs_g)}g</Text></View>
                <View style={styles.macroPill}><Text style={styles.macroPillText}>F: {Math.round(meal.fats_g)}g</Text></View>
              </View>
            </View>
          ))
        )}

        {/* Section 4 — Weekly Adherence */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.cardTitle}>Weekly Overview</Text>
          <Text style={styles.cardSubtitle}>Calorie target adherence</Text>
          <WeeklyBarChart data={weeklyData} target={t.calories} width={chartWidth} />
          <View style={styles.statPillRow}>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: GREEN }]} />
              <Text style={styles.statPillText}>{weeklyStats.daysOnTarget} days on target</Text>
            </View>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: ACCENT_BLUE }]} />
              <Text style={styles.statPillText}>{weeklyStats.bestStreak} day best streak</Text>
            </View>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: AMBER }]} />
              <Text style={styles.statPillText}>{weeklyStats.avgAdherence}% avg</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Add Meal Modal ── */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={resetModal}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Log a Meal</Text>

                {/* Meal type selector */}
                <View style={styles.mealTypeRow}>
                  {MEAL_TYPES.map((mt) => (
                    <TouchableOpacity
                      key={mt}
                      style={[styles.mealTypeChip, selectedMeal === mt && styles.mealTypeChipActive]}
                      onPress={() => setSelectedMeal(mt)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.mealTypeText, selectedMeal === mt && styles.mealTypeTextActive]}>
                        {mt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Manual entry */}
                <Text style={styles.modalSectionLabel}>ENTER MACROS MANUALLY</Text>
                <View style={styles.inputGrid}>
                  {([
                    { label: 'Calories (kcal)', value: calories, setter: setCalories },
                    { label: 'Protein (g)', value: protein, setter: setProtein },
                    { label: 'Carbs (g)', value: carbs, setter: setCarbs },
                    { label: 'Fats (g)', value: fats, setter: setFats },
                  ] as const).map((inp) => (
                    <View key={inp.label} style={styles.inputWrapper}>
                      <Text style={styles.inputLabel}>{inp.label}</Text>
                      <TextInput
                        style={styles.input}
                        value={inp.value}
                        onChangeText={inp.setter}
                        keyboardType="numeric"
                        placeholderTextColor={TEXT_SECONDARY}
                        placeholder="0"
                      />
                    </View>
                  ))}
                </View>

                {/* Quick options — only when meal prefs not set */}
                {!mealPrefsSet && (
                  <>
                    <Text style={[styles.modalSectionLabel, { marginTop: 16 }]}>OR CHOOSE A QUICK OPTION</Text>
                    <View style={styles.quickGrid}>
                      {QUICK_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.name}
                          style={styles.quickCard}
                          onPress={() => fillPreset(opt)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.quickName}>{opt.name}</Text>
                          <Text style={styles.quickMacros}>
                            P:{opt.protein_g}g C:{opt.carbs_g}g F:{opt.fats_g}g
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={resetModal} activeOpacity={0.7}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.logBtn} onPress={handleLogMeal} activeOpacity={0.8}>
                    <Text style={styles.logBtnText}>Log Meal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Meal Preferences Modal ── */}
      <Modal
        visible={showPrefsModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPrefsModal(false)}
      >
        <SafeAreaView style={styles.prefsModalSafe}>
          <View style={styles.prefsHeader}>
            <TouchableOpacity onPress={() => setShowPrefsModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.prefsClose}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.prefsHeaderTitle} pointerEvents="none">
              Meal Preferences
            </Text>
          </View>

          <ScrollView
            style={styles.prefsScroll}
            contentContainerStyle={styles.prefsScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.prefsSectionLabel}>YOUR DIET</Text>
            <View style={styles.dietGrid}>
              {DIET_OPTIONS.map((diet) => {
                const selected = selectedDiet === diet;
                return (
                  <TouchableOpacity
                    key={diet}
                    style={[styles.dietCard, selected && styles.dietCardSelected]}
                    onPress={() => setSelectedDiet(diet)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dietCardLabel}>{formatDietLabel(diet)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.prefsSectionLabel, styles.prefsSectionSpacer]}>ALLERGIES & INTOLERANCES</Text>
            <Text style={styles.prefsAllergiesHint}>Select all that apply</Text>
            <View style={styles.allergyChipWrap}>
              {ALLERGY_OPTIONS.map((a) => {
                const selected = selectedAllergies.includes(a);
                return (
                  <TouchableOpacity
                    key={a}
                    style={[styles.allergyChip, selected && styles.allergyChipSelected]}
                    onPress={() => toggleAllergy(a)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.allergyChipText, selected && styles.allergyChipTextSelected]}>
                      {a}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.prefsFooter}>
            <TouchableOpacity
              style={styles.prefsSaveBtn}
              onPress={handleSavePrefs}
              disabled={savingPrefs}
              activeOpacity={0.85}
            >
              {savingPrefs ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.prefsSaveBtnText}>Save & Generate Meals</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG_DARK },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { marginTop: 20, marginBottom: 20 },
  headerTitle: { color: TEXT_PRIMARY, fontSize: 24, fontWeight: '700' },
  headerSubtitle: { color: TEXT_SECONDARY, fontSize: 14, marginTop: 2 },

  card: { backgroundColor: CARD_BG, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  cardSubtitle: { color: TEXT_SECONDARY, fontSize: 13, marginTop: 2, marginBottom: 16 },

  /* Calorie Ring */
  calorieCard: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  calorieLeft: { flex: 1 },
  sectionLabel: { color: TEXT_SECONDARY, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  calorieBig: { color: TEXT_PRIMARY, fontSize: 36, fontWeight: '700', marginTop: 4 },
  calorieTarget: { color: TEXT_SECONDARY, fontSize: 14 },
  calorieRemaining: { fontSize: 13, marginTop: 6, fontWeight: '600' },

  /* Macro Breakdown */
  macroRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  macroCard: { flex: 1, backgroundColor: CARD_BG, borderRadius: 12, padding: 12 },
  macroLabel: { color: TEXT_SECONDARY, fontSize: 11, textTransform: 'uppercase' },
  macroValue: { color: TEXT_PRIMARY, fontSize: 20, fontWeight: '700', marginTop: 2 },
  macroTarget: { color: TEXT_SECONDARY, fontSize: 12 },
  macroBarTrack: { height: 4, borderRadius: 2, backgroundColor: DISABLED_BG, marginTop: 8 },
  macroBarFill: { height: 4, borderRadius: 2 },

  /* Meals */
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  addMealBtn: { color: ACCENT_BLUE, fontSize: 14, fontWeight: '700' },

  emptyMeals: { alignItems: 'center', paddingVertical: 20 },
  emptyEmoji: { fontSize: 28 },
  emptyTitle: { color: TEXT_PRIMARY, fontSize: 15, marginTop: 8 },
  emptySubtitle: { color: TEXT_SECONDARY, fontSize: 13, marginTop: 4 },

  mealCard: { backgroundColor: CARD_BG, borderRadius: 12, padding: 14, marginBottom: 8 },
  mealTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealName: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '700', flex: 1 },
  trashIcon: { fontSize: 18 },
  mealCal: { color: ACCENT_BLUE, fontSize: 13, marginTop: 4 },
  macroPillRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  macroPill: { backgroundColor: DISABLED_BG, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  macroPillText: { color: TEXT_SECONDARY, fontSize: 11 },

  /* Weekly stats */
  statPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: DISABLED_BG, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, gap: 6 },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statPillText: { color: TEXT_SECONDARY, fontSize: 12 },

  /* Modal */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { backgroundColor: CARD_BG, borderRadius: 16, padding: 24, marginHorizontal: 20 },
  modalTitle: { color: TEXT_PRIMARY, fontSize: 18, fontWeight: '700', marginBottom: 16 },

  mealTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  mealTypeChip: { backgroundColor: DISABLED_BG, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  mealTypeChipActive: { backgroundColor: ACCENT_BLUE },
  mealTypeText: { color: TEXT_SECONDARY, fontSize: 13 },
  mealTypeTextActive: { color: '#FFFFFF' },

  modalSectionLabel: { color: TEXT_SECONDARY, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },

  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inputWrapper: { width: '47%' },
  inputLabel: { color: TEXT_SECONDARY, fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: DISABLED_BG, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, color: TEXT_PRIMARY, fontSize: 15 },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickCard: { width: '47%', backgroundColor: DISABLED_BG, borderRadius: 8, padding: 10 },
  quickName: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: '700' },
  quickMacros: { color: TEXT_SECONDARY, fontSize: 11, marginTop: 4 },

  modalFooter: { flexDirection: 'row', marginTop: 20, gap: 8 },
  cancelBtn: { flex: 1, backgroundColor: DISABLED_BG, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: TEXT_SECONDARY, fontSize: 15, fontWeight: '600' },
  logBtn: { flex: 1, backgroundColor: ACCENT_BLUE, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  logBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  /* Meal prefs setup card */
  mealSetupCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  mealSetupTitle: { color: TEXT_PRIMARY, fontSize: 16, fontWeight: '700' },
  mealSetupBody: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  mealSetupCta: {
    backgroundColor: ACCENT_BLUE,
    height: 46,
    borderRadius: 12,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealSetupCtaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  /* Jordan meal plan */
  mealPlanSection: { marginBottom: 8 },
  mealPlanHeading: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  jordanMealNote: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 18,
  },
  mealPlanSub: { color: TEXT_SECONDARY, fontSize: 13, marginBottom: 12 },
  suggestedMealCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  suggestedMealRow1: { flexDirection: 'row', alignItems: 'center' },
  mealNamePill: {
    backgroundColor: DISABLED_BG,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  mealNamePillText: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
  },
  suggestedMealTitle: {
    color: TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  suggestedMealDesc: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  suggestedMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  sMacroPillNeutral: {
    backgroundColor: DISABLED_BG,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sMacroPillNeutralText: { color: TEXT_SECONDARY, fontSize: 11, fontWeight: '600' },
  sMacroPillBlue: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sMacroPillAmber: {
    backgroundColor: AMBER,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sMacroPillGreen: {
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sMacroPillWhiteText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 8,
  },
  generatingText: { color: TEXT_SECONDARY, fontSize: 14 },

  /* Prefs modal */
  prefsModalSafe: { flex: 1, backgroundColor: BG_DARK },
  prefsHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefsClose: { color: TEXT_SECONDARY, fontSize: 22, width: 44 },
  prefsHeaderTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
  },
  prefsScroll: { flex: 1 },
  prefsScrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  prefsSectionLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  prefsSectionSpacer: { marginTop: 24 },
  prefsAllergiesHint: { color: TEXT_SECONDARY, fontSize: 13, marginBottom: 12 },
  dietGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dietCard: {
    width: '47%',
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dietCardSelected: {
    backgroundColor: CARD_SELECTED_BG,
    borderColor: ACCENT_BLUE,
  },
  dietCardLabel: { color: TEXT_PRIMARY, fontSize: 14, fontWeight: '500', textAlign: 'center' },
  allergyChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergyChip: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  allergyChipSelected: { backgroundColor: ACCENT_BLUE },
  allergyChipText: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: '500' },
  allergyChipTextSelected: { color: '#FFFFFF' },
  prefsFooter: {
    paddingHorizontal: 20,
    marginBottom: 32,
    paddingTop: 8,
  },
  prefsSaveBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefsSaveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
