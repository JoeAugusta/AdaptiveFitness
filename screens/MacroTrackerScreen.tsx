import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
  Keyboard,
  Platform,
  useWindowDimensions,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import EdgeBar from '../components/EdgeBar';
import type { Allergen, DietaryStyle, MealSlot } from '../constants/ingredientLibrary';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';
import { stripEmDash } from '../utils/jordanText';
import { Ionicons } from '@expo/vector-icons';
import { JordanLabel } from '../components/JordanLabel';
import {
  applyTrainingDayMacroAdjust,
  clampMacroAdjustDraft,
  computeRecommendedMacroTargets,
  MACRO_ADJUST,
  macrosExceedCalories,
  type MacroTargetValues,
} from '../utils/macroTargets';
import {
  getTodayDayLabel,
  isTodayTrainingDay,
  normalizeScheduledDays,
} from '../utils/dateUtils';
import ActivityLogSheet, { type ActivityLogRow } from '../components/ActivityLogSheet';
import { resolveActivityCaloriesBurned } from '../utils/activityCalories';
import {
  HEALTH_PERMISSION_DISMISSED_KEY,
  HEALTH_PERMISSION_GRANTED_KEY,
} from '../components/HealthConnectCard';
import { useHealthData, type NutritionData } from '../hooks/useHealthData';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MacroTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
}

type MacroProfileInput = {
  weightLbs: number;
  heightFt: number;
  heightIn: number;
  age: number;
  sex: string;
  daysPerWeek: number;
  concurrentSport?: { type: string[]; daysPerWeek: number } | null;
};

type PlanNutritionContext = {
  scheduledDays: string[];
  hasDayLabels: boolean;
  isActive: boolean;
  concurrentSport?: { type: string[]; daysPerWeek: number } | null;
};

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

const HEALTH_NUTRITION_DISMISSED_KEY = 'hone_health_nutrition_dismissed';
const HONE_NUTRITION_SYNC_ENABLED_KEY = 'hone_nutrition_sync_enabled';

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

function jordanAdherenceMessage(
  goalType: string | null,
  avgRatio: number,
  daysWithLogs: number,
  avgCalories: number,
  caloriesTarget: number,
): string {
  const g = (goalType ?? '').toLowerCase();
  const deficit = g === 'fat_loss' || g === 'recomp';
  const muscle =
    g === 'hypertrophy' ||
    g === 'strength' ||
    g === 'power_hypertrophy';
  const calDiff = Math.round(Math.abs(avgCalories - caloriesTarget));
  const overUnder = avgCalories > caloriesTarget ? 'over' : 'under';

  if (avgRatio >= 0.9) {
    if (deficit) {
      return (
        `Deficit is holding across ${daysWithLogs} days. ` +
        `${calDiff > 30 ? `${calDiff} cal ${overUnder} target` : 'right on target'} ` +
        `protein is what protects muscle here, keep hitting it.`
      );
    }
    if (muscle) {
      return (
        `${daysWithLogs} days logged and the surplus is consistent. ` +
        `${calDiff > 30 ? `You're averaging ${calDiff} cal ${overUnder} target` : `Hitting ${caloriesTarget} cal consistently`} ` +
        `that's the fuel the training needs.`
      );
    }
    return (
      `Consistent week on nutrition. ` +
      `${daysWithLogs} days logged at ${Math.round(avgRatio * 100)}% of your ` +
      `${caloriesTarget} cal target.`
    );
  }

  if (avgRatio >= 0.7) {
    if (deficit) {
      return (
        `Close but not quite. Averaging ${Math.round(avgRatio * 100)}% ` +
        `of your ${caloriesTarget} cal target across ${daysWithLogs} days. ` +
        `Protein is the priority; hit that first before worrying about total calories.`
      );
    }
    if (muscle) {
      return (
        `A few days under target this week. ` +
        `At ${Math.round(avgRatio * 100)}% of ${caloriesTarget} cal on average, ` +
        `the surplus took a hit. Add a shake between meals if appetite is the issue.`
      );
    }
    return (
      `${Math.round(avgRatio * 100)}% adherence across ${daysWithLogs} days ` +
      `decent but the gap from ${caloriesTarget} cal adds up over weeks.`
    );
  }

  if (deficit) {
    return (
      `Inconsistent logging makes it hard to manage the deficit. ` +
      `Pick one meal to anchor each day, usually breakfast, and build from there.`
    );
  }
  if (muscle) {
    return (
      `Under target most days. At your goal you need ${caloriesTarget} cal ` +
      `consistently. Missed days slow the process. A high-calorie meal prep day ` +
      `helps.`
    );
  }
  return (
    `Tough week on nutrition. Don't try to catch up. ` +
    `just get tomorrow's ${caloriesTarget} cal sorted and go from there.`
  );
}

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
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
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

type MacroEditField = 'calories' | 'protein_g' | 'fats_g';

function formatMacroEditValue(field: MacroEditField, value: number): string {
  return field === 'calories' ? value.toLocaleString() : String(Math.round(value));
}

function parseMacroEditInput(field: MacroEditField, raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = field === 'calories' ? parseInt(cleaned, 10) : parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

function MacroAdjustEditableRow({
  label,
  field,
  value,
  unit,
  step,
  min,
  max,
  decLabel,
  incLabel,
  isEditing,
  editText,
  onStartEdit,
  onEditTextChange,
  onEndEdit,
  onStep,
}: {
  label: string;
  field: MacroEditField;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  decLabel: string;
  incLabel: string;
  isEditing: boolean;
  editText: string;
  onStartEdit: () => void;
  onEditTextChange: (text: string) => void;
  onEndEdit: () => void;
  onStep: (delta: number) => void;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  const displayValue = formatMacroEditValue(field, value);

  return (
    <View style={styles.macroAdjustSection}>
      <View style={styles.macroAdjustHeaderRow}>
        <Text style={styles.macroAdjustSectionLabel}>{label}</Text>
        <Text style={styles.macroAdjustHeaderValue}>
          {displayValue}
          {unit === 'kcal' ? ' kcal' : ` ${unit}`}
        </Text>
      </View>
      <View style={styles.macroAdjustDivider} />
      <View style={styles.macroAdjustControlRow}>
        <TouchableOpacity
          style={[styles.macroAdjustStepBtn, atMin && styles.macroAdjustStepBtnDisabled]}
          onPress={() => onStep(-step)}
          disabled={atMin}
          activeOpacity={0.7}
        >
          <Text style={styles.macroAdjustStepBtnText}>{decLabel}</Text>
        </TouchableOpacity>

        <View style={styles.macroAdjustValueWrap}>
          {isEditing ? (
            <TextInput
              style={styles.macroAdjustValueInput}
              value={editText}
              onChangeText={onEditTextChange}
              onBlur={onEndEdit}
              onSubmitEditing={onEndEdit}
              keyboardType="numeric"
              selectTextOnFocus
              autoFocus
              returnKeyType="done"
            />
          ) : (
            <TouchableOpacity onPress={onStartEdit} activeOpacity={0.7}>
              <Text style={styles.macroAdjustValueDisplay}>{displayValue}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.macroAdjustUnitLabel}>{unit}</Text>
        </View>

        <TouchableOpacity
          style={[styles.macroAdjustStepBtn, atMax && styles.macroAdjustStepBtnDisabled]}
          onPress={() => onStep(step)}
          disabled={atMax}
          activeOpacity={0.7}
        >
          <Text style={styles.macroAdjustStepBtnText}>{incLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MacroAdjustCarbsRow({
  carbsG,
  invalid,
}: {
  carbsG: number;
  invalid: boolean;
}) {
  return (
    <View style={[styles.macroAdjustSection, styles.macroAdjustSectionLast]}>
      <View style={styles.macroAdjustHeaderRow}>
        <Text style={styles.macroAdjustSectionLabel}>CARBS</Text>
        <Text style={styles.macroAdjustHeaderValue}>{carbsG} g</Text>
      </View>
      <View style={styles.macroAdjustDivider} />
      <View style={styles.macroAdjustCarbsDisplayRow}>
        <Text style={styles.macroAdjustValueDisplay}>{carbsG}</Text>
        <Text style={styles.macroAdjustUnitLabel}>g</Text>
      </View>
      <Text
        style={[
          styles.macroAdjustCarbsCaption,
          invalid && styles.macroAdjustCarbsCaptionDanger,
        ]}
      >
        {invalid
          ? 'Protein + fats exceed calorie target'
          : 'Auto-calculated from calorie balance'}
      </Text>
    </View>
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
        else if (pct >= 0.9) color = Colors.accent;
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
  const insets = useSafeAreaInsets();
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

  const [nutritionGoalType, setNutritionGoalType] = useState<string | null>(null);
  const [showMacroAdjustSheet, setShowMacroAdjustSheet] = useState(false);
  const [adjustDraft, setAdjustDraft] = useState<MacroTargetValues | null>(null);
  const [savingMacroAdjust, setSavingMacroAdjust] = useState(false);
  const [macroProfileInput, setMacroProfileInput] = useState<MacroProfileInput | null>(null);
  const [macroPlanMeta, setMacroPlanMeta] = useState<{
    goal_id?: string | null;
    calorie_pace?: string | null;
  } | null>(null);
  const [planNutritionContext, setPlanNutritionContext] =
    useState<PlanNutritionContext | null>(null);
  const [profileWeightLbs, setProfileWeightLbs] = useState<number | null>(null);
  const [nutritionUserId, setNutritionUserId] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [todayActivityLog, setTodayActivityLog] = useState<ActivityLogRow | null>(null);
  const [showActivityLogSheet, setShowActivityLogSheet] = useState(false);
  const [editingMacroField, setEditingMacroField] = useState<MacroEditField | null>(
    null,
  );
  const [macroEditText, setMacroEditText] = useState('');
  const macroEditDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mealLoggedToastOpacity = useRef(new Animated.Value(0)).current;
  const mealLoggedToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overshootHapticSentRef = useRef(false);

  const {
    isAvailable: healthAvailable,
    permissionStatus,
    requestPermission,
    fetchNutritionData,
  } = useHealthData();
  const [healthNutrition, setHealthNutrition] = useState<NutritionData | null>(null);
  const [healthSyncLoading, setHealthSyncLoading] = useState(false);
  const [healthSyncDismissed, setHealthSyncDismissed] = useState(false);
  const [nutritionSyncEnabled, setNutritionSyncEnabled] = useState(false);
  const [healthConnectPromptDismissed, setHealthConnectPromptDismissed] =
    useState(false);
  const [healthConnectPromptChecked, setHealthConnectPromptChecked] =
    useState(false);

  const showMealLoggedToast = useCallback(() => {
    void hapticSuccess();
    if (mealLoggedToastTimerRef.current) {
      clearTimeout(mealLoggedToastTimerRef.current);
      mealLoggedToastTimerRef.current = null;
    }
    mealLoggedToastOpacity.setValue(0);
    Animated.timing(mealLoggedToastOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
    mealLoggedToastTimerRef.current = setTimeout(() => {
      Animated.timing(mealLoggedToastOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
      mealLoggedToastTimerRef.current = null;
    }, 2000);
  }, [mealLoggedToastOpacity]);

  useEffect(
    () => () => {
      if (mealLoggedToastTimerRef.current) {
        clearTimeout(mealLoggedToastTimerRef.current);
      }
    },
    [],
  );

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setNutritionGoalType(null);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      setNutritionUserId(userId);

      const today = todayStr();
      const weekAgo = daysAgoStr(6);

      const { data: profile } = await supabase
        .from('user_profiles')
        .select(
          'meal_prefs_set, dietary_style, food_allergies, weight_lbs, height_ft, height_in, age, sex',
        )
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
      const weightLbs = Number(profile?.weight_lbs ?? 0);
      setProfileWeightLbs(Number.isFinite(weightLbs) && weightLbs > 0 ? weightLbs : null);

      const [targetsRes, todayRes, weekRes, mealSuggestRes, planRes] = await Promise.all([
        supabase
          .from('macro_plans')
          .select(
            'calories_target, protein_g, carbs_g, fats_g, goal_id, calorie_pace',
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
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
        supabase
          .from('plans')
          .select('id, plan_json, status')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
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
        const tr = targetsRes.data as {
          calories_target: number;
          protein_g: number;
          carbs_g: number;
          fats_g: number;
          goal_id?: string | null;
          calorie_pace?: string | null;
        };

        let goalType: string | null = null;
        if (tr.goal_id) {
          const { data: goalRow } = await supabase
            .from('goals')
            .select('goal_type')
            .eq('id', tr.goal_id)
            .maybeSingle();
          goalType = goalRow?.goal_type ?? null;
        }
        if (!goalType) {
          const { data: activeGoal } = await supabase
            .from('goals')
            .select('goal_type')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
          goalType = activeGoal?.goal_type ?? null;
        }

        setNutritionGoalType(goalType);
        setMacroPlanMeta({
          goal_id: tr.goal_id ?? null,
          calorie_pace: tr.calorie_pace ?? null,
        });
        setTargets({
          calories: tr.calories_target,
          protein_g: tr.protein_g,
          carbs_g: tr.carbs_g,
          fats_g: tr.fats_g,
        });
      } else {
        setNutritionGoalType(null);
        setMacroPlanMeta(null);
        setTargets(DEFAULT_TARGETS);
      }

      const planRow = planRes.data as {
        id?: string;
        plan_json?: Record<string, unknown>;
        status?: string;
      } | null;
      setActivePlanId(planRow?.id ?? null);
      const pj = planRow?.plan_json ?? {};
      const scheduledRaw = Array.isArray(pj.scheduledDays)
        ? (pj.scheduledDays as string[])
        : [];
      const scheduledDays = normalizeScheduledDays(scheduledRaw);
      const daysPerWeek = Number(pj.daysPerWeek ?? pj.days_per_week ?? 0);
      const resolvedDays =
        daysPerWeek > 0
          ? daysPerWeek
          : scheduledDays.length > 0
            ? scheduledDays.length
            : 3;
      const concurrentSport =
        pj.concurrentSport &&
        typeof pj.concurrentSport === 'object' &&
        Array.isArray((pj.concurrentSport as { type?: unknown }).type)
          ? (pj.concurrentSport as { type: string[]; daysPerWeek: number })
          : null;

      setPlanNutritionContext({
        scheduledDays,
        hasDayLabels: scheduledDays.length > 0,
        isActive: planRow?.status === 'active',
        concurrentSport,
      });

      if (
        profile &&
        Number(profile.weight_lbs) > 0 &&
        Number(profile.height_ft) >= 0 &&
        Number(profile.age) > 0
      ) {
        setMacroProfileInput({
          weightLbs: Number(profile.weight_lbs),
          heightFt: Number(profile.height_ft ?? 0),
          heightIn: Number(profile.height_in ?? 0),
          age: Number(profile.age),
          sex: String(profile.sex ?? 'male'),
          daysPerWeek: resolvedDays,
          concurrentSport,
        });
      } else {
        setMacroProfileInput(null);
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

      if (planRow?.id) {
        const { data: sportLogRow } = await supabase
          .from('sport_logs')
          .select(
            'id, user_id, plan_id, logged_at, sport_type, duration_min, intensity, calories_burned',
          )
          .eq('user_id', userId)
          .eq('plan_id', planRow.id)
          .eq('logged_at', today)
          .maybeSingle();
        setTodayActivityLog((sportLogRow as ActivityLogRow | null) ?? null);
      } else {
        setTodayActivityLog(null);
      }
    } catch (e) {
      console.error('MacroTracker load error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      overshootHapticSentRef.current = false;
      void loadData();

      // Check whether nutrition sync is enabled and if prompt was dismissed
      void (async () => {
        try {
          const [syncVal, dismissedVal] = await Promise.all([
            AsyncStorage.getItem(HONE_NUTRITION_SYNC_ENABLED_KEY),
            AsyncStorage.getItem(HEALTH_NUTRITION_DISMISSED_KEY),
          ]);
          setNutritionSyncEnabled(syncVal === '1');
          setHealthConnectPromptDismissed(dismissedVal === '1');
        } catch {
          // silent
        } finally {
          setHealthConnectPromptChecked(true);
        }
      })();

      // Auto-fetch health nutrition on tab focus
      if (healthAvailable) {
        void (async () => {
          try {
            const dismissed = await AsyncStorage.getItem(
              HEALTH_NUTRITION_DISMISSED_KEY,
            );
            if (dismissed === 'today_' + todayStr()) return;
            setHealthSyncLoading(true);
            const data = await fetchNutritionData();
            if (data.hasDataToday) setHealthNutrition(data);
          } catch {
            // silent
          } finally {
            setHealthSyncLoading(false);
          }
        })();
      }
    }, [loadData, healthAvailable, fetchNutritionData]),
  );

  const baseTargets = targets ?? DEFAULT_TARGETS;
  const todayLabel = getTodayDayLabel();
  const isTrainingDay = isTodayTrainingDay(
    planNutritionContext?.scheduledDays ?? [],
    todayLabel,
  );
  const showDayTypeIndicator =
    !!planNutritionContext?.isActive &&
    !!planNutritionContext?.hasDayLabels &&
    mealPrefsSet;

  const adjustedTargets = useMemo(() => {
    if (!targets) return null;
    if (!showDayTypeIndicator) return targets;
    return applyTrainingDayMacroAdjust(targets, isTrainingDay);
  }, [targets, showDayTypeIndicator, isTrainingDay]);

  console.log('[MACRO ADJUST]', {
    baseCalories: targets?.calories,
    isTrainingDay,
    showDayTypeIndicator,
    adjustedCalories: adjustedTargets?.calories,
  });

  const t = adjustedTargets ?? baseTargets;

  const activityCalories = useMemo(() => {
    if (!todayActivityLog) return 0;
    const w =
      profileWeightLbs != null && profileWeightLbs > 0 ? profileWeightLbs : 170;
    return resolveActivityCaloriesBurned(todayActivityLog, w);
  }, [todayActivityLog, profileWeightLbs]);

  const displayCalorieTarget = t.calories + activityCalories;
  const baseCalorieTarget = t.calories;

  const adjustDraftInvalid =
    adjustDraft != null &&
    macrosExceedCalories(
      adjustDraft.calories,
      adjustDraft.protein_g,
      adjustDraft.fats_g,
    );

  const regenerateMeals = useCallback(
    async (userId: string, trainingDay: boolean) => {
      return supabase.functions.invoke('generate-meals', {
        body: {
          userId,
          goalType: nutritionGoalType ?? undefined,
          isTrainingDay: trainingDay,
        },
      });
    },
    [nutritionGoalType],
  );

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

  const calPct =
    displayCalorieTarget > 0
      ? (todayTotals.calories / displayCalorieTarget) * 100
      : 0;
  const remaining = displayCalorieTarget - todayTotals.calories;

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

  const weeklyAdherenceForNote = useMemo(() => {
    if (t.calories <= 0) return { daysWithLogs: 0, avgRatio: 0, avgCalories: 0 };
    let sum = 0;
    let calSum = 0;
    let n = 0;
    for (let i = 6; i >= 0; i--) {
      const ds = daysAgoStr(i);
      const day = weeklyData.find((d) => d.date === ds);
      const cals = day?.calories ?? 0;
      if (cals > 0) {
        sum += cals / t.calories;
        calSum += cals;
        n++;
      }
    }
    return {
      daysWithLogs: n,
      avgRatio: n > 0 ? sum / n : 0,
      avgCalories: n > 0 ? Math.round(calSum / n) : 0,
    };
  }, [weeklyData, t.calories]);

  const jordanAdherenceBody = useMemo(() => {
    if (weeklyAdherenceForNote.daysWithLogs < 3) return null;
    return jordanAdherenceMessage(
      nutritionGoalType,
      weeklyAdherenceForNote.avgRatio,
      weeklyAdherenceForNote.daysWithLogs,
      weeklyAdherenceForNote.avgCalories,
      t.calories,
    );
  }, [weeklyAdherenceForNote, nutritionGoalType, t.calories]);

  const calorieOvershootAmount = useMemo(
    () =>
      todayTotals.calories > displayCalorieTarget
        ? Math.round(todayTotals.calories - displayCalorieTarget)
        : 0,
    [todayTotals.calories, displayCalorieTarget],
  );
  const showCalOvershootBanner = calorieOvershootAmount > 50;

  useEffect(() => {
    if (isLoading || !showCalOvershootBanner) return;
    if (overshootHapticSentRef.current) return;
    overshootHapticSentRef.current = true;
    void hapticWarning();
  }, [isLoading, showCalOvershootBanner]);

  // ── Handlers ──

  const handleDelete = async (id: string) => {
    await supabase.from('macro_logs').delete().eq('id', id);
    loadData();
  };

  const handleImportHealthNutrition = async () => {
    if (!healthNutrition || !nutritionUserId) return;
    try {
      await supabase.from('macro_logs').upsert(
        {
          user_id: nutritionUserId,
          log_date: todayStr(),
          meal_name: 'Daily Total',
          calories: healthNutrition.calories ?? 0,
          protein_g: healthNutrition.protein_g ?? 0,
          carbs_g: healthNutrition.carbs_g ?? 0,
          fats_g: healthNutrition.fats_g ?? 0,
        },
        { onConflict: 'user_id,log_date,meal_name' },
      );
      showMealLoggedToast();
      setHealthNutrition(null);
      void loadData();
    } catch {
      Alert.alert('Error', 'Could not import nutrition data. Please try again.');
    }
  };

  const handleDismissHealthSync = async () => {
    setHealthSyncDismissed(true);
    setHealthNutrition(null);
    try {
      await AsyncStorage.setItem(
        HEALTH_NUTRITION_DISMISSED_KEY,
        'today_' + todayStr(),
      );
    } catch {
      // silent
    }
  };

  const handleConnectHealthNutrition = async () => {
    try {
      const granted = await requestPermission();
      if (granted) {
        await AsyncStorage.setItem(HONE_NUTRITION_SYNC_ENABLED_KEY, '1');
        await AsyncStorage.setItem(HEALTH_PERMISSION_GRANTED_KEY, '1');
        await AsyncStorage.removeItem(HEALTH_NUTRITION_DISMISSED_KEY);
        setNutritionSyncEnabled(true);
        setHealthConnectPromptDismissed(false);
        // Immediately try to fetch and show data
        const data = await fetchNutritionData();
        if (data.hasDataToday) setHealthNutrition(data);
      }
    } catch {
      Alert.alert('Error', 'Could not connect. Please try again.');
    }
  };

  const handleDismissConnectPrompt = async () => {
    setHealthConnectPromptDismissed(true);
    try {
      await AsyncStorage.setItem(HEALTH_NUTRITION_DISMISSED_KEY, '1');
    } catch {
      // silent
    }
  };

  const handleResetRecommendedMacros = () => {
    if (!macroProfileInput) {
      Alert.alert('Profile incomplete', 'Update your profile to reset recommended targets.');
      return;
    }
    const recommended = computeRecommendedMacroTargets({
      ...macroProfileInput,
      goal: nutritionGoalType ?? 'general',
      caloriePace: macroPlanMeta?.calorie_pace,
      concurrentSport: macroProfileInput.concurrentSport,
    });
    setAdjustDraft(recommended);
  };

  const handleSaveMacroAdjust = async () => {
    if (!adjustDraft || adjustDraftInvalid) return;
    Keyboard.dismiss();
    setEditingMacroField(null);
    setSavingMacroAdjust(true);

    const { calories, protein_g: proteinG, carbs_g: carbsG, fats_g: fatsG } =
      adjustDraft;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) throw new Error('No user');

      const { data: existingPlan, error: existingErr } = await supabase
        .from('macro_plans')
        .select('id')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingErr) {
        console.error(
          '[macro save error]',
          existingErr.message,
          existingErr.details,
          existingErr.hint,
        );
        throw existingErr;
      }

      if (existingPlan?.id) {
        const { error } = await supabase
          .from('macro_plans')
          .update({
            calories_target: calories,
            protein_g: proteinG,
            carbs_g: carbsG,
            fats_g: fatsG,
          })
          .eq('id', existingPlan.id);

        if (error) {
          console.error('[macro save]', error.message, error.details);
          Alert.alert('Save failed', error.message);
          return;
        }
      } else {
        const { data: activePlan, error: planErr } = await supabase
          .from('plans')
          .select('id, current_week')
          .eq('user_id', uid)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planErr) {
          console.error(
            '[macro save error]',
            planErr.message,
            planErr.details,
            planErr.hint,
          );
          throw planErr;
        }

        const { error: insertErr } = await supabase.from('macro_plans').insert({
          user_id: uid,
          plan_id: activePlan?.id ?? null,
          week_number: activePlan?.current_week ?? 1,
          calories_target: calories,
          protein_g: proteinG,
          carbs_g: carbsG,
          fats_g: fatsG,
        });

        if (insertErr) {
          console.error(
            '[macro save error]',
            insertErr.message,
            insertErr.details,
            insertErr.hint,
          );
          throw insertErr;
        }
      }

      if (mealPrefsSet) {
        const { error: fnErr } = await regenerateMeals(uid, isTrainingDay);
        if (fnErr) {
          console.error(
            '[macro save error]',
            fnErr.message,
            fnErr.details,
            fnErr.hint,
          );
          throw fnErr;
        }
      }

      setShowMacroAdjustSheet(false);
      setEditingMacroField(null);
      setMacroEditText('');
      await loadData();
      void hapticSuccess();
    } catch (err) {
      const error = err as { message?: string; details?: string; hint?: string };
      console.error(
        '[macro save error]',
        error.message,
        error.details,
        error.hint,
      );
      Alert.alert('Error', 'Could not save macro targets. Please try again.');
    } finally {
      setSavingMacroAdjust(false);
    }
  };

  const stepMacroAdjust = (
    field: 'calories' | 'protein_g' | 'fats_g',
    delta: number,
  ) => {
    void hapticLight();
    setEditingMacroField(null);
    setMacroEditText('');
    setAdjustDraft((prev) => {
      if (!prev) return prev;
      const nextVal = prev[field] + delta;
      return clampMacroAdjustDraft({ ...prev, [field]: nextVal }, field);
    });
  };

  const startMacroEdit = (field: MacroEditField) => {
    if (!adjustDraft) return;
    setEditingMacroField(field);
    setMacroEditText(formatMacroEditValue(field, adjustDraft[field]));
  };

  const commitMacroEdit = (field: MacroEditField, rawText?: string) => {
    const parsed = parseMacroEditInput(field, rawText ?? macroEditText);
    if (parsed != null) {
      setAdjustDraft((prev) => {
        if (!prev) return prev;
        return clampMacroAdjustDraft({ ...prev, [field]: parsed }, field);
      });
    }
    setEditingMacroField(null);
    setMacroEditText('');
  };

  const handleMacroEditTextChange = (field: MacroEditField, text: string) => {
    setMacroEditText(text);
    if (field !== 'protein_g') return;

    if (macroEditDebounceRef.current) {
      clearTimeout(macroEditDebounceRef.current);
    }
    macroEditDebounceRef.current = setTimeout(() => {
      const parsed = parseMacroEditInput(field, text);
      if (parsed == null) return;
      setAdjustDraft((prev) => {
        if (!prev) return prev;
        return clampMacroAdjustDraft({ ...prev, protein_g: parsed }, 'protein_g');
      });
    }, 300);
  };

  const openMacroAdjustSheet = () => {
    setAdjustDraft({ ...(targets ?? DEFAULT_TARGETS) });
    setEditingMacroField(null);
    setMacroEditText('');
    setShowMacroAdjustSheet(true);
  };

  useEffect(
    () => () => {
      if (macroEditDebounceRef.current) {
        clearTimeout(macroEditDebounceRef.current);
      }
    },
    [],
  );

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

    showMealLoggedToast();
    resetModal();
    loadData();
  };

  const resetModal = () => {
    setShowAddModal(false);
    setSelectedMeal(firstUnloggedSlot);
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
        body: {
          userId: uid,
          goalType: nutritionGoalType ?? undefined,
          isTrainingDay,
        },
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
      <View style={styles.mainFlex}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nutrition</Text>
          <Text style={styles.headerSubtitle}>{formatDate(new Date())}</Text>
        </View>

        {/* ── Health nutrition sync banner ── */}
        {healthAvailable && healthNutrition?.hasDataToday && !healthSyncDismissed && (
          <View style={styles.healthSyncCard}>
            <View style={styles.healthSyncHeader}>
              <Ionicons
                name={Platform.OS === 'ios' ? 'heart-circle-outline' : 'fitness-outline'}
                size={18}
                color={Colors.accent}
              />
              <Text style={styles.healthSyncTitle}>
                {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}
              </Text>
              <TouchableOpacity
                onPress={handleDismissHealthSync}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.healthSyncMacroRow}>
              <Text style={styles.healthSyncCal}>
                {(healthNutrition.calories ?? 0).toLocaleString()} cal
              </Text>
              <Text style={styles.healthSyncMacro}>
                P: {healthNutrition.protein_g ?? 0}g
              </Text>
              <Text style={styles.healthSyncMacro}>
                C: {healthNutrition.carbs_g ?? 0}g
              </Text>
              <Text style={styles.healthSyncMacro}>
                F: {healthNutrition.fats_g ?? 0}g
              </Text>
            </View>

            <Text style={styles.healthSyncHint}>
              Logged in{' '}
              {Platform.OS === 'ios' ? 'MyFitnessPal or another linked app' : 'a connected food tracker'}
              {' '}today
            </Text>

            <TouchableOpacity
              style={styles.healthSyncImportBtn}
              onPress={handleImportHealthNutrition}
              activeOpacity={0.8}
            >
              <Text style={styles.healthSyncImportText}>Import to Hone →</Text>
            </TouchableOpacity>
          </View>
        )}

        {healthAvailable && healthSyncLoading && !healthNutrition && (
          <View style={styles.healthSyncLoadingRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.healthSyncLoadingText}>
              Checking{' '}
              {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}
              …
            </Text>
          </View>
        )}

        <View style={styles.calorieCard}>
          <View style={styles.calorieLeft}>
            <View style={styles.calorieHeaderRow}>
              <Text style={styles.calorieSectionLabel}>CALORIES</Text>
              <TouchableOpacity onPress={openMacroAdjustSheet} activeOpacity={0.7}>
                <Text style={styles.adjustTargetsLink}>Adjust targets →</Text>
              </TouchableOpacity>
            </View>
            {activityCalories > 0 ? (
              <>
                <Text style={styles.calorieAdjustedBig}>
                  <Text style={styles.calorieAdjustedBigNumber}>
                    {displayCalorieTarget.toLocaleString()}
                  </Text>
                  {' kcal today'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowActivityLogSheet(true)}
                  activeOpacity={0.7}
                  disabled={!activePlanId}
                >
                  <Text style={styles.calorieAdjustedBreakdown}>
                    {`${baseCalorieTarget.toLocaleString()} base + ${activityCalories.toLocaleString()} ${todayActivityLog?.sport_type ?? 'activity'}`}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.calorieBig}>{todayTotals.calories}</Text>
                <Text style={styles.calorieTargetLine}>
                  {`logged of ${displayCalorieTarget.toLocaleString()} kcal`}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.calorieBig}>{todayTotals.calories}</Text>
                <Text style={styles.calorieTargetLine}>/ {t.calories} kcal</Text>
                <TouchableOpacity
                  onPress={() => setShowActivityLogSheet(true)}
                  activeOpacity={0.7}
                  disabled={!activePlanId}
                >
                  <Text style={styles.activityTargetHint}>
                    Log activity to adjust today's target →
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {showDayTypeIndicator ? (
              isTrainingDay ? (
                <View style={styles.dayTypePill}>
                  <Ionicons name="flash-outline" size={12} color={Colors.accent} />
                  <Text style={styles.dayTypePillText}>Training day — carbs up</Text>
                </View>
              ) : (
                <View style={styles.dayTypePill}>
                  <Ionicons name="moon-outline" size={12} color={Colors.textSecondary} />
                  <Text style={styles.dayTypePillText}>Rest day — carbs lower</Text>
                </View>
              )
            ) : null}
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

        {showCalOvershootBanner ? (
          <View style={styles.calOvershootBanner}>
            <Text style={styles.calOvershootIcon}>⚠</Text>
            <Text style={styles.calOvershootText}>
              Over target by {calorieOvershootAmount} cal. Protein is the priority for the rest
              of the day.
            </Text>
          </View>
        ) : null}

        <View style={styles.macroRow}>
          {([
            { label: 'PROTEIN', val: todayTotals.protein_g, tgt: t.protein_g, color: Colors.accent },
            { label: 'CARBS', val: todayTotals.carbs_g, tgt: t.carbs_g, color: Colors.warning },
            { label: 'FATS', val: todayTotals.fats_g, tgt: t.fats_g, color: Colors.textSecondary },
          ] as const).map((m) => {
            const pct = m.tgt > 0 ? Math.min(100, (m.val / m.tgt) * 100) : 0;
            return (
              <View key={m.label} style={styles.macroCard}>
                <Text style={styles.macroSectionLabel}>{m.label}</Text>
                <Text style={styles.macroValue}>{Math.round(m.val)}g</Text>
                <Text style={styles.macroTargetMicro}>/ {Math.round(m.tgt)}g</Text>
                <EdgeBar
                  progress={pct / 100}
                  height={4}
                  fillColor={m.color}
                  style={styles.macroBarEdge}
                />
              </View>
            );
          })}
        </View>

        {/* ── Jordan nutrition card — always shown ── */}
        <View style={styles.jordanCard}>
          <Text style={styles.jordanAuthor}>JORDAN</Text>
          {hasLoggedToday ? (
            jordanMealNote ? (
              <Text style={styles.jordanBody}>{stripEmDash(jordanMealNote)}</Text>
            ) : (
              <Text style={styles.jordanBody}>
                {`You're at ${todayTotals.calories} cal with ${Math.round(todayTotals.protein_g)}g protein logged. Keep building on it. Protein is the priority.`}
              </Text>
            )
          ) : (
            <Text style={styles.jordanBody}>
              {`Your target today is ${t.calories.toLocaleString()} cal and ${Math.round(t.protein_g)}g protein. Log each meal as you eat. The data is how I tune your plan.`}
            </Text>
          )}
        </View>

        {/* ── Health nutrition connect prompt ── */}
        {healthAvailable &&
          healthConnectPromptChecked &&
          !nutritionSyncEnabled &&
          !healthConnectPromptDismissed &&
          permissionStatus !== 'granted' && (
          <View style={styles.healthConnectPromptCard}>
            <View style={styles.healthConnectPromptHeader}>
              <Ionicons
                name={Platform.OS === 'ios' ? 'heart-circle-outline' : 'fitness-outline'}
                size={20}
                color={Colors.accent}
              />
              <Text style={styles.healthConnectPromptTitle}>
                {Platform.OS === 'ios' ? 'Connect Apple Health' : 'Connect Health Connect'}
              </Text>
              <TouchableOpacity
                onPress={handleDismissConnectPrompt}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.healthConnectPromptBody}>
              {Platform.OS === 'ios'
                ? 'Auto-import your macros from MyFitnessPal, Cronometer, or any app that syncs to Apple Health.'
                : 'Auto-import your macros from MyFitnessPal, Cronometer, or any app that syncs to Health Connect.'}
            </Text>
            <TouchableOpacity
              style={styles.healthConnectPromptBtn}
              onPress={handleConnectHealthNutrition}
              activeOpacity={0.8}
            >
              <Text style={styles.healthConnectPromptBtnText}>Connect →</Text>
            </TouchableOpacity>
          </View>
        )}

        {mealPrefsSet && mealSuggestions.length > 0 && (
          <View style={styles.mealPlanSection}>
            <Text style={styles.mealPlanHeading}>{"Today's Meal Plan"}</Text>
            <Text style={styles.jordanTapHint}>Tap any meal to log it</Text>
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
              setSelectedMeal(firstUnloggedSlot);
              setShowAddModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addMealBtn}>+ Add Meal</Text>
          </TouchableOpacity>
        </View>

        {todayLogs.length === 0 ? (
          <View style={[styles.sectionCard, styles.emptyMeals]}>
            <Ionicons name="restaurant-outline" size={48} color={Colors.textTertiary} />
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

        {/* ── Quick log slots ── */}
        {MEAL_TYPES.filter((mt) => !todayLogs.some((l) => l.meal_name === mt)).map((mt) => (
          <TouchableOpacity
            key={mt}
            style={styles.quickLogSlot}
            activeOpacity={0.7}
            onPress={() => {
              setSelectedMeal(mt);
              setCalories('');
              setProtein('');
              setCarbs('');
              setFats('');
              setShowAddModal(true);
            }}
          >
            <View style={styles.quickLogSlotLeft}>
              <Text style={styles.quickLogSlotMeal}>{mt}</Text>
              <Text style={styles.quickLogSlotHint}>Tap to log macros</Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
        ))}

        <Text style={styles.weeklySectionHeading}>Weekly Overview</Text>
        <Text style={styles.weeklySectionSub}>Calorie target adherence</Text>
        <View style={styles.weeklyChartCard}>
          <WeeklyBarChart data={weeklyData} target={t.calories} width={chartWidth} />
          <View style={styles.adherenceLegendRow}>
            <View style={styles.adherenceLegendItem}>
              <View style={[styles.adherenceLegendSwatch, styles.adherenceLegendSwatchSuccess]} />
              <Text style={styles.adherenceLegendLabel}>On target (≥90%)</Text>
            </View>
            <View style={styles.adherenceLegendItem}>
              <View style={[styles.adherenceLegendSwatch, styles.adherenceLegendSwatchWarning]} />
              <Text style={styles.adherenceLegendLabel}>Close (70–89%)</Text>
            </View>
            <View style={styles.adherenceLegendItem}>
              <View style={[styles.adherenceLegendSwatch, styles.adherenceLegendSwatchDanger]} />
              <Text style={styles.adherenceLegendLabel}>Off target (&lt;70%)</Text>
            </View>
          </View>
          {jordanAdherenceBody ? (
            <View style={styles.jordanAdherenceCard}>
              <Text style={styles.jordanAdherenceLabel}>JORDAN</Text>
              <Text style={styles.jordanAdherenceBodyText}>{jordanAdherenceBody}</Text>
            </View>
          ) : null}
          <View style={styles.statPillRow}>
            <View style={styles.statPill}>
              <View style={[styles.statDot, { backgroundColor: Colors.textSecondary }]} />
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

      <Animated.View
        style={[styles.mealLoggedToastWrap, { opacity: mealLoggedToastOpacity }]}
        pointerEvents="none"
      >
        <View style={styles.mealLoggedToastInner}>
          <Text style={styles.mealLoggedToastText}>✓  Meal logged</Text>
        </View>
      </Animated.View>
      </View>

      {/* ── Add Meal Modal ── */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={resetModal}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Log Macros</Text>

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
                <Text style={styles.modalSectionLabel}>ENTER YOUR MACROS</Text>
                {(() => {
                  const mealTarget = {
                    calories: Math.round(t.calories / 4),
                    protein: Math.round(t.protein_g / 4),
                    carbs: Math.round(t.carbs_g / 4),
                    fats: Math.round(t.fats_g / 4),
                  };
                  const fields = [
                    {
                      label: 'Calories (kcal)',
                      value: calories,
                      setter: setCalories,
                      hint: `target ~${mealTarget.calories.toLocaleString()}`,
                    },
                    {
                      label: 'Protein (g)',
                      value: protein,
                      setter: setProtein,
                      hint: `target ~${mealTarget.protein}g`,
                    },
                    {
                      label: 'Carbs (g)',
                      value: carbs,
                      setter: setCarbs,
                      hint: `target ~${mealTarget.carbs}g`,
                    },
                    {
                      label: 'Fats (g)',
                      value: fats,
                      setter: setFats,
                      hint: `target ~${mealTarget.fats}g`,
                    },
                  ] as const;
                  return (
                    <View style={styles.inputGrid}>
                      {fields.map((inp) => (
                        <View key={inp.label} style={styles.inputWrapper}>
                          <View style={styles.inputLabelRow}>
                            <Text style={styles.inputLabel}>{inp.label}</Text>
                            <Text style={styles.inputHint}>{inp.hint}</Text>
                          </View>
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
                  );
                })()}

                {/* Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={resetModal} activeOpacity={0.7}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.logBtn} onPress={handleLogMeal} activeOpacity={0.8}>
                    <Text style={styles.logBtnText}>Log meal</Text>
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
            contentContainerStyle={[
              styles.prefsScrollContent,
              { paddingBottom: insets.bottom + 80 },
            ]}
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

          <View style={[styles.prefsFooter, { marginBottom: insets.bottom + 16 }]}>
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
        onMealLogged={showMealLoggedToast}
        slot={builderSlot}
        targetCalories={builderTargetCals}
        targetProtein={builderTargetProtein}
        dietaryStyle={userDietaryStyle}
        allergies={userAllergies}
      />

      <Modal
        visible={showMacroAdjustSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMacroAdjustSheet(false)}
      >
        <View style={styles.macroAdjustOverlay}>
          <TouchableOpacity
            style={styles.macroAdjustBackdrop}
            activeOpacity={1}
            onPress={() => setShowMacroAdjustSheet(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.macroAdjustSheetWrap}
          >
            <View
              style={[
                styles.macroAdjustSheet,
                { paddingBottom: insets.bottom + Spacing.xl },
              ]}
            >
              <View style={styles.macroAdjustHandle} />
              <Text style={styles.macroAdjustTitle}>Adjust Your Targets</Text>

              {adjustDraft ? (
                <>
                  <MacroAdjustEditableRow
                    label="CALORIES"
                    field="calories"
                    value={adjustDraft.calories}
                    unit="kcal"
                    step={MACRO_ADJUST.calStep}
                    min={MACRO_ADJUST.calMin}
                    max={MACRO_ADJUST.calMax}
                    decLabel="−50"
                    incLabel="+50"
                    isEditing={editingMacroField === 'calories'}
                    editText={macroEditText}
                    onStartEdit={() => startMacroEdit('calories')}
                    onEditTextChange={(text) =>
                      handleMacroEditTextChange('calories', text)
                    }
                    onEndEdit={() => commitMacroEdit('calories')}
                    onStep={(delta) => stepMacroAdjust('calories', delta)}
                  />
                  <MacroAdjustEditableRow
                    label="PROTEIN"
                    field="protein_g"
                    value={adjustDraft.protein_g}
                    unit="g"
                    step={MACRO_ADJUST.proteinStep}
                    min={MACRO_ADJUST.proteinMin}
                    max={MACRO_ADJUST.proteinMax}
                    decLabel="−5"
                    incLabel="+5"
                    isEditing={editingMacroField === 'protein_g'}
                    editText={macroEditText}
                    onStartEdit={() => startMacroEdit('protein_g')}
                    onEditTextChange={(text) =>
                      handleMacroEditTextChange('protein_g', text)
                    }
                    onEndEdit={() => commitMacroEdit('protein_g')}
                    onStep={(delta) => stepMacroAdjust('protein_g', delta)}
                  />
                  <MacroAdjustEditableRow
                    label="FATS"
                    field="fats_g"
                    value={adjustDraft.fats_g}
                    unit="g"
                    step={MACRO_ADJUST.fatsStep}
                    min={MACRO_ADJUST.fatsMin}
                    max={MACRO_ADJUST.fatsMax}
                    decLabel="−5"
                    incLabel="+5"
                    isEditing={editingMacroField === 'fats_g'}
                    editText={macroEditText}
                    onStartEdit={() => startMacroEdit('fats_g')}
                    onEditTextChange={(text) =>
                      handleMacroEditTextChange('fats_g', text)
                    }
                    onEndEdit={() => commitMacroEdit('fats_g')}
                    onStep={(delta) => stepMacroAdjust('fats_g', delta)}
                  />
                  <MacroAdjustCarbsRow
                    carbsG={adjustDraft.carbs_g}
                    invalid={adjustDraftInvalid}
                  />

                  <View style={styles.macroAdjustJordanBlock}>
                    <JordanLabel />
                    <Text style={styles.macroAdjustJordanNote}>
                      {profileWeightLbs != null
                        ? `Protein floor ${Math.round(profileWeightLbs)}g. Carbs balance automatically.`
                        : 'Carbs balance automatically.'}
                    </Text>
                  </View>

                  <View style={styles.macroAdjustFooter}>
                    <TouchableOpacity
                      style={styles.macroAdjustResetBtn}
                      onPress={handleResetRecommendedMacros}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.macroAdjustResetText}>
                        Reset to recommended
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.macroAdjustSaveBtn,
                        (adjustDraftInvalid || savingMacroAdjust) &&
                          styles.macroAdjustSaveBtnDisabled,
                      ]}
                      onPress={handleSaveMacroAdjust}
                      disabled={adjustDraftInvalid || savingMacroAdjust}
                      activeOpacity={0.85}
                    >
                      {savingMacroAdjust ? (
                        <ActivityIndicator color={Colors.textPrimary} />
                      ) : (
                        <Text style={styles.macroAdjustSaveText}>Save targets</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {nutritionUserId != null && activePlanId != null ? (
        <ActivityLogSheet
          visible={showActivityLogSheet}
          onClose={() => setShowActivityLogSheet(false)}
          onSaved={() => {
            void loadData();
          }}
          userId={nutritionUserId}
          planId={activePlanId}
          weightLbs={profileWeightLbs ?? 170}
          existingLog={todayActivityLog}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  mainFlex: { flex: 1 },
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

  healthSyncCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  healthSyncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  healthSyncTitle: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    letterSpacing: 0.5,
  },
  healthSyncMacroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  healthSyncCal: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  healthSyncMacro: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  healthSyncHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  healthSyncImportBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  healthSyncImportText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },
  healthSyncLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  healthSyncLoadingText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  healthConnectPromptCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  healthConnectPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  healthConnectPromptTitle: {
    flex: 1,
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  healthConnectPromptBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  healthConnectPromptBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  healthConnectPromptBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
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
  calorieHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  adjustTargetsLink: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  calorieSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  calorieAdjustedBig: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
    marginTop: 4,
  },
  calorieAdjustedBigNumber: {
    fontFamily: Fonts.monoMedium,
  },
  calorieAdjustedBreakdown: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  activityTargetHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 6,
  },
  calorieBig: {
    fontFamily: Fonts.monoMedium,
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
  calorieRemainingUnder: { color: Colors.textSecondary },
  calorieRemainingOver: { color: Colors.danger },
  dayTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dayTypePillText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  macroAdjustOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  macroAdjustBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  macroAdjustSheetWrap: {
    maxHeight: '92%',
  },
  macroAdjustSheet: {
    backgroundColor: Colors.bgElevated,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  macroAdjustHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  macroAdjustTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  macroAdjustSection: {
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  macroAdjustSectionLast: {
    borderBottomWidth: 0,
  },
  macroAdjustHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  macroAdjustSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  macroAdjustHeaderValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  macroAdjustDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginTop: Spacing.sm,
  },
  macroAdjustControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.md,
  },
  macroAdjustStepBtn: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroAdjustStepBtnDisabled: {
    opacity: 0.35,
  },
  macroAdjustStepBtnText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  macroAdjustValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    minWidth: 120,
  },
  macroAdjustValueDisplay: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
    textAlign: 'center',
    minWidth: 100,
  },
  macroAdjustValueInput: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.display,
    color: Colors.textPrimary,
    textAlign: 'center',
    minWidth: 100,
    paddingVertical: 0,
  },
  macroAdjustUnitLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  macroAdjustCarbsDisplayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
  },
  macroAdjustCarbsCaption: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  macroAdjustCarbsCaptionDanger: {
    color: Colors.danger,
  },
  macroAdjustJordanBlock: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  macroAdjustJordanNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    lineHeight: 18,
  },
  macroAdjustFooter: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  macroAdjustResetBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
  },
  macroAdjustResetText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  macroAdjustSaveBtn: {
    flex: 1,
    height: 50,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroAdjustSaveBtnDisabled: {
    opacity: 0.4,
  },
  macroAdjustSaveText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  calOvershootBanner: {
    backgroundColor: Colors.dangerMuted,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  calOvershootIcon: {
    fontSize: 16,
    color: Colors.danger,
    marginRight: Spacing.xs,
  },
  calOvershootText: {
    flex: 1,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    color: Colors.danger,
  },

  mealLoggedToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    alignItems: 'center',
  },
  mealLoggedToastInner: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mealLoggedToastText: {
    color: Colors.bgPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
  },

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
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
    marginTop: 4,
  },
  macroTargetMicro: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  macroBarEdge: {
    marginTop: 8,
  },

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
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: 2,
  },
  loggedMealMacros: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  trashIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textTertiary,
  },
  quickLogSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  quickLogSlotLeft: {
    gap: 2,
  },
  quickLogSlotMeal: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  quickLogSlotHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
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
  adherenceLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  adherenceLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adherenceLegendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    marginRight: 4,
  },
  adherenceLegendSwatchSuccess: {
    backgroundColor: Colors.accent,
  },
  adherenceLegendSwatchWarning: {
    backgroundColor: Colors.warning,
  },
  adherenceLegendSwatchDanger: {
    backgroundColor: Colors.danger,
  },
  adherenceLegendLabel: {
    fontSize: FontSizes.caption,
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
  },
  jordanAdherenceCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentBorder,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  jordanAdherenceLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  jordanAdherenceBodyText: {
    fontSize: FontSizes.body,
    fontFamily: Fonts.regular,
    color: Colors.textPrimary,
  },
  statPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: Spacing.sm,
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
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  inputLabel: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginBottom: 4 },
  inputHint: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textTertiary,
  },
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
    marginTop: 0,
    marginBottom: Spacing.sm,
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
    backgroundColor: Colors.accent,
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
  prefsScrollContent: { paddingHorizontal: 20 },
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
