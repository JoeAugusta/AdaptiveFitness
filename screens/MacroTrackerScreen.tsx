import { useState, useCallback, useMemo } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../Lib/supabase';
import MealBuilderModal, { type BuiltMeal } from '../components/MealBuilderModal';
import type { Allergen, DietaryStyle, MealSlot } from '../constants/ingredientLibrary';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

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

const MEAL_SLOT_ORDER: MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const ALLERGEN_LIST: Allergen[] = [
  'Gluten',
  'Dairy',
  'Nuts',
  'Eggs',
  'Soy',
  'Shellfish',
];

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
        stroke={Colors.divider} strokeWidth={stroke} fill="none"
      />
      <SvgCircle
        cx={size / 2} cy={size / 2} r={r}
        stroke={Colors.accent} strokeWidth={stroke} fill="none"
        strokeDasharray={`${circ}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation="-90" origin={`${size / 2}, ${size / 2}`}
      />
      <SvgText
        x={size / 2} y={size / 2 + 5}
        fill={Colors.textPrimary} fontSize={FontSizes.caption} fontFamily={Fonts.bold}
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
        stroke={Colors.textSecondary} strokeWidth={1} strokeDasharray="4 4"
      />
      <SvgText
        x={width - padR + 8}
        y={targetY + 4}
        fill={Colors.textTertiary}
        fontSize={FontSizes.micro}
        fontFamily={Fonts.regular}
      >
        {target}
      </SvgText>

      {last7.map((d, i) => {
        const barH = d.calories > 0 ? Math.max(4, (d.calories / maxCal) * barMaxH) : 4;
        const x = padL + gap / 2 + i * (barW + gap);
        const y = padT + barMaxH - barH;
        const isToday = d.date === today;

        const pct = target > 0 ? d.calories / target : 0;
        let color: string;
        if (d.calories === 0) color = Colors.divider;
        else if (pct >= 0.9) color = Colors.success;
        else if (pct >= 0.7) color = Colors.warning;
        else color = Colors.danger;

        const dayDate = new Date(d.date + 'T12:00:00');
        const dayLabel = DAY_LABELS[dayDate.getDay() === 0 ? 6 : dayDate.getDay() - 1];

        return (
          <G key={d.date}>
            <Rect
              x={x} y={y} width={barW} height={barH}
              fill={isToday ? Colors.accent : color}
              rx={3}
            />
            {isToday && d.calories > 0 && (
              <SvgCircle cx={x + barW / 2} cy={y - 6} r={3} fill={Colors.accent} />
            )}
            <SvgText
              x={x + barW / 2}
              y={padT + barMaxH + 16}
              fill={Colors.textTertiary}
              fontSize={FontSizes.micro}
              fontFamily={Fonts.regular}
              textAnchor="middle"
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
  const chartWidth = screenWidth - Spacing.xl * 2 - 40;

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

  const [builderVisible, setBuilderVisible] = useState(false);
  const [builderSlot, setBuilderSlot] = useState<MealSlot>('Breakfast');
  const [builderTargetCals, setBuilderTargetCals] = useState(0);
  const [builderTargetProtein, setBuilderTargetProtein] = useState(0);

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

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const t = targets ?? DEFAULT_TARGETS;

  const hasLoggedToday = (todayLogs ?? []).length > 0;

  const userDietaryStyle = useMemo((): DietaryStyle => {
    const allowed: DietaryStyle[] = [
      'omnivore',
      'vegetarian',
      'vegan',
      'pescatarian',
      'keto',
      'paleo',
    ];
    return allowed.includes(selectedDiet as DietaryStyle)
      ? (selectedDiet as DietaryStyle)
      : 'omnivore';
  }, [selectedDiet]);

  const userAllergies = useMemo((): Allergen[] => {
    return selectedAllergies.filter((x): x is Allergen =>
      ALLERGEN_LIST.includes(x as Allergen),
    );
  }, [selectedAllergies]);

  const firstUnloggedSlot = useMemo((): MealSlot => {
    const logged = new Set(todayLogs.map((l) => l.meal_name));
    for (const m of MEAL_SLOT_ORDER) {
      if (!logged.has(m)) return m;
    }
    return 'Snack';
  }, [todayLogs]);

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

  const openBuilderForMeal = (meal: MealSuggestion) => {
    setBuilderSlot(meal.name as MealSlot);
    setBuilderTargetCals(meal.calories);
    setBuilderTargetProtein(meal.protein_g);
    setBuilderVisible(true);
  };

  const openBuilderFromAddMeal = () => {
    const slot = firstUnloggedSlot;
    setBuilderSlot(slot);
    const sug = mealSuggestions.find((m) => m.name === slot);
    if (sug) {
      setBuilderTargetCals(sug.calories);
      setBuilderTargetProtein(sug.protein_g);
    } else {
      setBuilderTargetCals(Math.max(200, Math.round(t.calories / 4)));
      setBuilderTargetProtein(Math.max(20, Math.round(t.protein_g / 4)));
    }
    setBuilderVisible(true);
  };

  const handleBuilderLog = async (builtMeal: BuiltMeal) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('macro_logs').upsert(
      {
        user_id: user.id,
        log_date: todayStr(),
        meal_name: builtMeal.slot,
        calories: builtMeal.totalCalories,
        protein_g: builtMeal.totalProtein,
        carbs_g: builtMeal.totalCarbs,
        fats_g: builtMeal.totalFats,
      },
      { onConflict: 'user_id,log_date,meal_name' },
    );
    await loadData();
  };

  // ── Render ──

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        <View style={styles.calorieCard}>
          <View style={styles.calorieLeft}>
            <Text style={styles.calorieSectionLabel}>CALORIES</Text>
            <Text style={styles.calorieBig}>{todayTotals.calories}</Text>
            <Text style={styles.calorieTargetLine}>/ {t.calories} kcal</Text>
            <Text
              style={[
                styles.calorieRemaining,
                remaining >= 0 ? styles.calorieRemainingUnder : styles.calorieRemainingOver,
              ]}
            >
              {remaining >= 0 ? `${remaining} kcal remaining` : `${Math.abs(remaining)} kcal over`}
            </Text>
          </View>
          <CalorieRing pct={calPct} />
        </View>

        <View style={styles.macroRow}>
          {([
            { label: 'PROTEIN', val: todayTotals.protein_g, tgt: t.protein_g, color: Colors.accent },
            { label: 'CARBS', val: todayTotals.carbs_g, tgt: t.carbs_g, color: Colors.warning },
            { label: 'FATS', val: todayTotals.fats_g, tgt: t.fats_g, color: Colors.success },
          ] as const).map((m) => {
            const pct = m.tgt > 0 ? Math.min(100, (m.val / m.tgt) * 100) : 0;
            return (
              <View key={m.label} style={styles.macroCard}>
                <Text style={styles.macroSectionLabel}>{m.label}</Text>
                <Text style={styles.macroValue}>{Math.round(m.val)}g</Text>
                <Text style={styles.macroTargetMicro}>/ {Math.round(m.tgt)}g</Text>
                <View style={styles.macroBarTrack}>
                  <View
                    style={[
                      styles.macroBarFill,
                      { width: `${pct}%`, backgroundColor: m.color },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {mealPrefsSet && mealSuggestions.length > 0 && (
          <View style={styles.mealPlanSection}>
            <Text style={styles.mealPlanHeading}>{"Today's Meal Plan"}</Text>
            <View style={styles.jordanCard}>
              <Text style={styles.jordanAuthor}>JORDAN</Text>
              {hasLoggedToday ? (
                <>
                  {jordanMealNote ? (
                    <Text style={styles.jordanBody}>{jordanMealNote}</Text>
                  ) : null}
                  <Text style={styles.jordanTapHint}>Tap any meal to log it</Text>
                </>
              ) : (
                <>
                  <Text style={styles.jordanBody}>
                    Here&apos;s your plan for today — hit these targets and you&apos;ll be right
                    on track.
                  </Text>
                  <Text style={styles.jordanTapHint}>Tap any meal to log it</Text>
                </>
              )}
            </View>
            {mealSuggestions.map((meal) => (
              <View key={meal.name} style={styles.suggestedMealCard}>
                <TouchableOpacity
                  onPress={() => handleLogSuggestedMeal(meal)}
                  activeOpacity={0.75}
                >
                  <View style={styles.mealTypePill}>
                    <Text style={styles.mealTypePillText}>{meal.name}</Text>
                  </View>
                  <Text style={styles.suggestedMealTitle} numberOfLines={2}>
                    {meal.title}
                  </Text>
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
                <TouchableOpacity
                  style={styles.customiseBtn}
                  onPress={() => openBuilderForMeal(meal)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.customiseBtnText}>Customise →</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {mealPrefsSet && mealSuggestions.length === 0 && (
          <View style={styles.generatingRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.generatingText}>Generating your meal plan...</Text>
          </View>
        )}

        <View style={styles.loggedMealsHeaderRow}>
          <Text style={styles.loggedMealsHeading}>{"Today's Meals"}</Text>
          <TouchableOpacity
            onPress={() => {
              if (mealPrefsSet) {
                openBuilderFromAddMeal();
              } else {
                setShowAddModal(true);
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addMealBtn}>+ Add Meal</Text>
          </TouchableOpacity>
        </View>

        {todayLogs.length === 0 ? (
          <View style={[styles.sectionCard, styles.emptyMeals]}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={styles.emptyTitle}>No meals logged yet</Text>
            <Text style={styles.emptySubtitle}>Tap + Add Meal to start tracking</Text>
          </View>
        ) : (
          todayLogs.map((meal) => (
            <View key={meal.id} style={styles.loggedMealCard}>
              <View style={styles.loggedMealLeft}>
                <Text style={styles.loggedMealName}>{meal.meal_name}</Text>
                <Text style={styles.loggedMealCal}>{meal.calories} kcal</Text>
                <Text style={styles.loggedMealMacros}>
                  P: {Math.round(meal.protein_g)}g · C: {Math.round(meal.carbs_g)}g · F:{' '}
                  {Math.round(meal.fats_g)}g
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(meal.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.trashIcon}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <Text style={styles.weeklySectionHeading}>Weekly Overview</Text>
        <Text style={styles.weeklySectionSub}>Calorie target adherence</Text>
        <View style={styles.weeklyChartCard}>
          <WeeklyBarChart data={weeklyData} target={t.calories} width={chartWidth} />
          <View style={styles.statPillRow}>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: Colors.success }]} />
              <Text style={styles.statPillText}>{weeklyStats.daysOnTarget} days on target</Text>
            </View>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: Colors.accent }]} />
              <Text style={styles.statPillText}>{weeklyStats.bestStreak} day best streak</Text>
            </View>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: Colors.warning }]} />
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
                        placeholderTextColor={Colors.textSecondary}
                        placeholder="0"
                      />
                    </View>
                  ))}
                </View>

                {/* Quick options — only when meal prefs not set */}
                {!mealPrefsSet && (
                  <>
                    <Text style={styles.modalQuickSectionLabel}>OR CHOOSE A QUICK OPTION</Text>
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
                <ActivityIndicator color="#FFFFFF" /* TODO: map to design token */ />
              ) : (
                <Text style={styles.prefsSaveBtnText}>Save & Generate Meals</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <MealBuilderModal
        visible={builderVisible}
        onClose={() => setBuilderVisible(false)}
        onLog={handleBuilderLog}
        slot={builderSlot}
        targetCalories={builderTargetCals}
        targetProtein={builderTargetProtein}
        dietaryStyle={userDietaryStyle}
        allergies={userAllergies}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingTop: 56 },
  headerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  sectionCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },

  calorieCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginTop: Spacing.xl,
  },
  calorieLeft: { flex: 1 },
  calorieSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  calorieBig: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  calorieTargetLine: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  calorieRemaining: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    marginTop: 4,
  },
  calorieRemainingUnder: { color: Colors.success },
  calorieRemainingOver: { color: Colors.danger },

  macroRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  macroCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 14,
    alignItems: 'center',
  },
  macroSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  macroValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  macroTargetMicro: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  macroBarTrack: {
    height: 4,
    alignSelf: 'stretch',
    width: '100%',
    borderRadius: Radius.full,
    backgroundColor: Colors.divider,
    marginTop: 8,
    overflow: 'hidden',
  },
  macroBarFill: { height: 4, borderRadius: Radius.full },

  loggedMealsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 12,
  },
  loggedMealsHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  addMealBtn: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  emptyMeals: { alignItems: 'center', paddingVertical: 20 },
  emptyEmoji: { fontFamily: Fonts.regular, fontSize: FontSizes.display },
  emptyTitle: {
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
    fontSize: FontSizes.body,
    marginTop: 8,
  },
  emptySubtitle: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 4,
  },

  loggedMealCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  loggedMealLeft: { flex: 1, marginRight: Spacing.sm },
  loggedMealName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  loggedMealCal: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: 2,
  },
  loggedMealMacros: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  trashIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },

  weeklySectionHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 4,
  },
  weeklySectionSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  weeklyChartCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 20,
    marginBottom: Spacing.lg,
  },
  statPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statPillText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  /* Modal */
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 24, marginHorizontal: 20 },
  modalTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold,  marginBottom: 16 },

  mealTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  mealTypeChip: { backgroundColor: Colors.divider, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20 },
  mealTypeChipActive: { backgroundColor: Colors.accent },
  mealTypeText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },
  mealTypeTextActive: { color: '#FFFFFF' }, // TODO: map to design token

  modalSectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalQuickSectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },

  inputGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  inputWrapper: { width: '47%' },
  inputLabel: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginBottom: 4 },
  input: {
    fontFamily: Fonts.regular,
    backgroundColor: Colors.divider, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, color: Colors.textPrimary, fontSize: FontSizes.body, },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickCard: { width: '47%', backgroundColor: Colors.divider, borderRadius: 8, padding: 10 },
  quickName: { color: Colors.textPrimary, fontSize: FontSizes.caption, fontFamily: Fonts.bold, },
  quickMacros: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.label, marginTop: 4 },

  modalFooter: { flexDirection: 'row', marginTop: 20, gap: 8 },
  cancelBtn: { flex: 1, backgroundColor: Colors.divider, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: Colors.textSecondary, fontSize: FontSizes.body, fontFamily: Fonts.semiBold, },
  logBtn: { flex: 1, backgroundColor: Colors.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  logBtnText: { color: '#FFFFFF', fontSize: FontSizes.body, fontFamily: Fonts.semiBold, }, // TODO: map to design token

  /* Meal prefs setup card */
  mealSetupCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  mealSetupTitle: { color: Colors.textPrimary, fontSize: FontSizes.title, fontFamily: Fonts.bold, },
  mealSetupBody: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 6,
    lineHeight: 20,
  },
  mealSetupCta: {
    backgroundColor: Colors.accent,
    height: 46,
    borderRadius: 12,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealSetupCtaText: { color: '#FFFFFF', fontSize: FontSizes.body, fontFamily: Fonts.semiBold, }, // TODO: map to design token

  mealPlanSection: { marginBottom: Spacing.sm },
  mealPlanHeading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 32,
    marginBottom: 4,
  },
  jordanCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  jordanAuthor: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  jordanBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  jordanTapHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 10,
  },
  suggestedMealCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  mealTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  mealTypePillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  suggestedMealTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  suggestedMealDesc: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  suggestedMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  sMacroPillNeutral: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sMacroPillNeutralText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  sMacroPillBlue: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sMacroPillAmber: {
    backgroundColor: Colors.warning,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sMacroPillGreen: {
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sMacroPillWhiteText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textPrimary,
  },
  customiseBtn: { alignSelf: 'flex-end', marginTop: 10 },
  customiseBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },

  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 8,
  },
  generatingText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },

  /* Prefs modal */
  prefsModalSafe: { flex: 1, backgroundColor: Colors.bgPrimary },
  prefsHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefsClose: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.heading1, width: 44 },
  prefsHeaderTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontSize: FontSizes.heading2,
    fontFamily: Fonts.bold, 
  },
  prefsScroll: { flex: 1 },
  prefsScrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  prefsSectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold, 
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  prefsSectionSpacer: { marginTop: 24 },
  prefsAllergiesHint: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginBottom: 12 },
  dietGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dietCard: {
    width: '47%',
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dietCardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accent,
  },
  dietCardLabel: { color: Colors.textPrimary, fontSize: FontSizes.caption, fontFamily: Fonts.medium,  textAlign: 'center' },
  allergyChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  allergyChip: {
    backgroundColor: Colors.bgCard,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  allergyChipSelected: { backgroundColor: Colors.accent },
  allergyChipText: { color: Colors.textSecondary, fontSize: FontSizes.caption, fontFamily: Fonts.medium, },
  allergyChipTextSelected: { color: '#FFFFFF' }, // TODO: map to design token
  prefsFooter: {
    paddingHorizontal: 20,
    marginBottom: 32,
    paddingTop: 8,
  },
  prefsSaveBtn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefsSaveBtnText: { color: '#FFFFFF', fontSize: FontSizes.title, fontFamily: Fonts.bold, }, // TODO: map to design token
});
