import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'ExerciseLibrary'>;

// ── Types ──

interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band';
  category: 'compound' | 'isolation';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

// ── Exercise Database (80+ exercises) ──

const EXERCISES: Exercise[] = [
  // ─ Chest ─
  { id: 'c01', name: 'Barbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'c02', name: 'Incline Barbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'c03', name: 'Dumbbell Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Shoulders'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  { id: 'c04', name: 'Incline Dumbbell Press', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders', 'Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  { id: 'c05', name: 'Cable Chest Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'c06', name: 'Dumbbell Chest Fly', primaryMuscle: 'Chest', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'c07', name: 'Machine Chest Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
  { id: 'c08', name: 'Push-Up', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps', 'Core'], equipment: 'bodyweight', category: 'compound', difficulty: 'beginner' },
  { id: 'c09', name: 'Decline Bench Press', primaryMuscle: 'Chest', secondaryMuscles: ['Triceps'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  // ─ Back ─
  { id: 'b01', name: 'Barbell Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'b02', name: 'Deadlift', primaryMuscle: 'Back', secondaryMuscles: ['Hamstrings', 'Glutes', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'advanced' },
  { id: 'b03', name: 'Pull-Up', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate' },
  { id: 'b04', name: 'Lat Pulldown', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'cable', category: 'compound', difficulty: 'beginner' },
  { id: 'b05', name: 'Seated Cable Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Traps'], equipment: 'cable', category: 'compound', difficulty: 'beginner' },
  { id: 'b06', name: 'Dumbbell Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  { id: 'b07', name: 'T-Bar Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'b08', name: 'Chin-Up', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate' },
  { id: 'b09', name: 'Machine Row', primaryMuscle: 'Back', secondaryMuscles: ['Biceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
  // ─ Shoulders ─
  { id: 's01', name: 'Overhead Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 's02', name: 'Dumbbell Shoulder Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  { id: 's03', name: 'Dumbbell Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 's04', name: 'Cable Lateral Raise', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 's05', name: 'Face Pull', primaryMuscle: 'Shoulders', secondaryMuscles: ['Traps', 'Back'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 's06', name: 'Reverse Dumbbell Fly', primaryMuscle: 'Shoulders', secondaryMuscles: ['Back', 'Traps'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 's07', name: 'Arnold Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate' },
  { id: 's08', name: 'Machine Shoulder Press', primaryMuscle: 'Shoulders', secondaryMuscles: ['Triceps'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
  // ─ Biceps ─
  { id: 'bi01', name: 'Barbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'bi02', name: 'Dumbbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'bi03', name: 'Hammer Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'bi04', name: 'Preacher Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'bi05', name: 'Cable Curl', primaryMuscle: 'Biceps', secondaryMuscles: ['Forearms'], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'bi06', name: 'Incline Dumbbell Curl', primaryMuscle: 'Biceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'intermediate' },
  // ─ Triceps ─
  { id: 'tr01', name: 'Tricep Pushdown', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'tr02', name: 'Overhead Tricep Extension', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'tr03', name: 'Skull Crushers', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate' },
  { id: 'tr04', name: 'Close-Grip Bench Press', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'tr05', name: 'Dumbbell Tricep Kickback', primaryMuscle: 'Triceps', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'tr06', name: 'Dips', primaryMuscle: 'Triceps', secondaryMuscles: ['Chest', 'Shoulders'], equipment: 'bodyweight', category: 'compound', difficulty: 'intermediate' },
  // ─ Quads ─
  { id: 'q01', name: 'Back Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'q02', name: 'Front Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Core', 'Glutes'], equipment: 'barbell', category: 'compound', difficulty: 'advanced' },
  { id: 'q03', name: 'Leg Press', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'beginner' },
  { id: 'q04', name: 'Leg Extension', primaryMuscle: 'Quads', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
  { id: 'q05', name: 'Hack Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes'], equipment: 'machine', category: 'compound', difficulty: 'intermediate' },
  { id: 'q06', name: 'Bulgarian Split Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Core'], equipment: 'dumbbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'q07', name: 'Goblet Squat', primaryMuscle: 'Quads', secondaryMuscles: ['Core', 'Glutes'], equipment: 'kettlebell', category: 'compound', difficulty: 'beginner' },
  { id: 'q08', name: 'Walking Lunge', primaryMuscle: 'Quads', secondaryMuscles: ['Glutes', 'Hamstrings'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  // ─ Hamstrings ─
  { id: 'h01', name: 'Romanian Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'h02', name: 'Leg Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
  { id: 'h03', name: 'Stiff-Leg Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'h04', name: 'Dumbbell Romanian Deadlift', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  { id: 'h05', name: 'Nordic Hamstring Curl', primaryMuscle: 'Hamstrings', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced' },
  { id: 'h06', name: 'Kettlebell Swing', primaryMuscle: 'Hamstrings', secondaryMuscles: ['Glutes', 'Core', 'Back'], equipment: 'kettlebell', category: 'compound', difficulty: 'intermediate' },
  // ─ Glutes ─
  { id: 'g01', name: 'Hip Thrust', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'g02', name: 'Glute Bridge', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
  { id: 'g03', name: 'Cable Pull-Through', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'cable', category: 'compound', difficulty: 'beginner' },
  { id: 'g04', name: 'Sumo Deadlift', primaryMuscle: 'Glutes', secondaryMuscles: ['Quads', 'Hamstrings', 'Back'], equipment: 'barbell', category: 'compound', difficulty: 'advanced' },
  { id: 'g05', name: 'Cable Kickback', primaryMuscle: 'Glutes', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'g06', name: 'Banded Hip Thrust', primaryMuscle: 'Glutes', secondaryMuscles: ['Hamstrings'], equipment: 'band', category: 'compound', difficulty: 'beginner' },
  // ─ Calves ─
  { id: 'cv01', name: 'Standing Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
  { id: 'cv02', name: 'Seated Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
  { id: 'cv03', name: 'Dumbbell Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'cv04', name: 'Leg Press Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
  { id: 'cv05', name: 'Bodyweight Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
  { id: 'cv06', name: 'Smith Machine Calf Raise', primaryMuscle: 'Calves', secondaryMuscles: [], equipment: 'machine', category: 'isolation', difficulty: 'beginner' },
  // ─ Core ─
  { id: 'co01', name: 'Plank', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
  { id: 'co02', name: 'Hanging Leg Raise', primaryMuscle: 'Core', secondaryMuscles: ['Forearms'], equipment: 'bodyweight', category: 'isolation', difficulty: 'intermediate' },
  { id: 'co03', name: 'Cable Crunch', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'co04', name: 'Ab Wheel Rollout', primaryMuscle: 'Core', secondaryMuscles: ['Shoulders'], equipment: 'bodyweight', category: 'isolation', difficulty: 'advanced' },
  { id: 'co05', name: 'Russian Twist', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
  { id: 'co06', name: 'Pallof Press', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'intermediate' },
  { id: 'co07', name: 'Dead Bug', primaryMuscle: 'Core', secondaryMuscles: [], equipment: 'bodyweight', category: 'isolation', difficulty: 'beginner' },
  // ─ Traps ─
  { id: 'tp01', name: 'Barbell Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'tp02', name: 'Dumbbell Shrug', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'tp03', name: 'Upright Row', primaryMuscle: 'Traps', secondaryMuscles: ['Shoulders'], equipment: 'barbell', category: 'compound', difficulty: 'intermediate' },
  { id: 'tp04', name: 'Cable Shrug', primaryMuscle: 'Traps', secondaryMuscles: [], equipment: 'cable', category: 'isolation', difficulty: 'beginner' },
  { id: 'tp05', name: 'Farmer Carry', primaryMuscle: 'Traps', secondaryMuscles: ['Core', 'Forearms'], equipment: 'dumbbell', category: 'compound', difficulty: 'beginner' },
  { id: 'tp06', name: 'Kettlebell Shrug', primaryMuscle: 'Traps', secondaryMuscles: [], equipment: 'kettlebell', category: 'isolation', difficulty: 'beginner' },
  // ─ Forearms ─
  { id: 'f01', name: 'Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'f02', name: 'Reverse Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'f03', name: 'Reverse Curl', primaryMuscle: 'Forearms', secondaryMuscles: ['Biceps'], equipment: 'barbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'f04', name: 'Plate Pinch Hold', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'barbell', category: 'isolation', difficulty: 'intermediate' },
  { id: 'f05', name: 'Dumbbell Wrist Curl', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'dumbbell', category: 'isolation', difficulty: 'beginner' },
  { id: 'f06', name: 'Band Wrist Extension', primaryMuscle: 'Forearms', secondaryMuscles: [], equipment: 'band', category: 'isolation', difficulty: 'beginner' },
];

const MUSCLE_GROUPS = ['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Traps', 'Forearms'];
const EQUIPMENT_OPTIONS = ['All', 'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band'];

const EQUIP_EMOJIS: Record<string, string> = {
  barbell: '🏋️', dumbbell: '💪', machine: '⚙️', cable: '🔗',
  bodyweight: '🤸', kettlebell: '🔔', band: '🟡',
};

const FAVS_KEY = 'exercise_favourites';

type TabId = 'all' | 'favourites' | 'avoided';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'avoided', label: 'Avoided' },
];

export default function ExerciseLibraryScreen() {
  const navigation = useNavigation<NavProp>();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('All');
  const [selectedEquipment, setSelectedEquipment] = useState('All');
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [favourites, setFavourites] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load data ──

  const loadUserData = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem(FAVS_KEY);
      if (stored) setFavourites(JSON.parse(stored));

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        const { data } = await supabase
          .from('user_profiles')
          .select('excluded_exercises, weak_points')
          .eq('user_id', userId)
          .single();
        if (data?.excluded_exercises) setExcluded(data.excluded_exercises);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUserData(); }, [loadUserData]);

  // ── Persistence ──

  const toggleFavourite = useCallback(async (id: string) => {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      AsyncStorage.setItem(FAVS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleAvoided = useCallback(async (name: string) => {
    const next = excluded.includes(name)
      ? excluded.filter((e) => e !== name)
      : [...excluded, name];

    setExcluded(next);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      await supabase
        .from('user_profiles')
        .update({ excluded_exercises: next })
        .eq('user_id', userId);
    }

    Alert.alert(
      next.includes(name) ? 'Added to avoided exercises' : 'Removed from avoided exercises',
      name,
      [{ text: 'OK' }],
    );
  }, [excluded]);

  // ── Filtering ──

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return EXERCISES.filter((ex) => {
      if (activeTab === 'favourites' && !favourites.includes(ex.id)) return false;
      if (activeTab === 'avoided' && !excluded.includes(ex.name)) return false;
      if (selectedMuscle !== 'All' && ex.primaryMuscle !== selectedMuscle) return false;
      if (selectedEquipment !== 'All' && ex.equipment !== selectedEquipment.toLowerCase()) return false;
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [searchQuery, selectedMuscle, selectedEquipment, activeTab, favourites, excluded]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedMuscle('All');
    setSelectedEquipment('All');
    setActiveTab('all');
  };

  // ── Render helpers ──

  const renderExercise = useCallback(
    ({ item: ex }: { item: Exercise }) => {
      const isFav = favourites.includes(ex.id);
      const isAvoided = excluded.includes(ex.name);
      const level = levelPillStyles(ex.difficulty);

      return (
        <View style={styles.exCard}>
          <View style={styles.exLeft}>
            <Text style={styles.exName}>{ex.name}</Text>
            <View style={styles.primaryPill}>
              <Text style={styles.primaryPillText}>{ex.primaryMuscle}</Text>
            </View>
            {ex.secondaryMuscles.length > 0 && (
              <Text style={styles.secondaryText}>
                Also works: {ex.secondaryMuscles.join(', ')}
              </Text>
            )}
            <View style={styles.metaRow}>
              <View style={styles.equipPill}>
                <Text style={styles.equipPillText}>
                  {EQUIP_EMOJIS[ex.equipment] ?? ''} {ex.equipment}
                </Text>
              </View>
              <View style={level.pill}>
                <Text style={level.text}>{ex.difficulty}</Text>
              </View>
            </View>
          </View>
          <View style={styles.exRight}>
            <TouchableOpacity onPress={() => toggleFavourite(ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.iconBtn}>{isFav ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleAvoided(ex.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.iconBtn}>{isAvoided ? '🚫' : '⭕'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [favourites, excluded, toggleFavourite, toggleAvoided],
  );

  const keyExtractor = useCallback((item: Exercise) => item.id, []);

  // ── Empty states ──

  const emptyComponent = useMemo(() => {
    if (activeTab === 'favourites' && filtered.length === 0) {
      return (
        <View style={styles.emptyStateTab}>
          <Text style={styles.emptyTextTab}>Tap ❤️ on any exercise to save it here</Text>
        </View>
      );
    }
    if (activeTab === 'avoided' && filtered.length === 0) {
      return (
        <View style={styles.emptyStateTab}>
          <Text style={styles.emptyTextTab}>No exercises marked as avoided</Text>
        </View>
      );
    }
    if (filtered.length === 0) {
      return (
        <View style={styles.emptyStateSearch}>
          <Text style={styles.emptyTextSearch}>No exercises match your search</Text>
          <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }, [activeTab, filtered.length]);

  if (loading) {
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
      <View style={styles.screenInner}>
        <View style={styles.controlsShell}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.backChevron}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Exercise Library</Text>
            <Text style={styles.headerCount}>{filtered.length} exercises</Text>
          </View>

          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search exercises..."
              placeholderTextColor={Colors.textTertiary}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearX}>×</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {MUSCLE_GROUPS.map((mg) => (
              <TouchableOpacity
                key={`m-${mg}`}
                style={[styles.chip, selectedMuscle === mg && styles.chipActive]}
                onPress={() => setSelectedMuscle(mg)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, selectedMuscle === mg && styles.chipTextActive]}>{mg}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {EQUIPMENT_OPTIONS.map((eq) => (
              <TouchableOpacity
                key={`e-${eq}`}
                style={[styles.chip, selectedEquipment === eq && styles.chipActive]}
                onPress={() => setSelectedEquipment(eq)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, selectedEquipment === eq && styles.chipTextActive]}>{eq}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.tabRow}>
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={styles.tab}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                  {active ? <View style={styles.tabUnderline} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <FlatList
          data={filtered}
          renderItem={renderExercise}
          keyExtractor={keyExtractor}
          style={styles.flatList}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={emptyComponent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screenInner: { flex: 1, paddingHorizontal: Spacing.xl },
  controlsShell: { backgroundColor: Colors.bgPrimary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
    paddingRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  headerCount: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchIcon: {
    fontFamily: Fonts.regular,
    color: Colors.textTertiary,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  clearX: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.heading1,
    lineHeight: 24,
    paddingLeft: 8,
  },

  chipScroll: { marginBottom: Spacing.sm },
  chipScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderWidth: 0,
  },
  chipText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
  },

  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: Spacing.md,
  },
  tab: {
    position: 'relative',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginRight: 24,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.accent,
  },
  tabText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },

  flatList: { flex: 1 },
  listContent: { paddingBottom: 40 },

  exCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 16,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  exLeft: { flex: 1 },
  exRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    marginLeft: 12,
  },
  exName: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  primaryPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
  },
  primaryPillText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  secondaryText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  equipPill: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  equipPillText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  levelPillBeginner: {
    backgroundColor: Colors.successMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelTextBeginner: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.success,
  },
  levelPillIntermediate: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelTextIntermediate: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  levelPillAdvanced: {
    backgroundColor: Colors.dangerMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelTextAdvanced: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.danger,
  },
  iconBtn: {
    fontFamily: Fonts.regular,
    fontSize: 20,
  },

  emptyStateTab: {
    alignItems: 'center',
    marginTop: 48,
  },
  emptyTextTab: {
    textAlign: 'center',
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  emptyStateSearch: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTextSearch: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  clearBtn: { marginTop: 12 },
  clearBtnText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
});

function levelPillStyles(difficulty: Exercise['difficulty']) {
  switch (difficulty) {
    case 'beginner':
      return { pill: styles.levelPillBeginner, text: styles.levelTextBeginner };
    case 'advanced':
      return { pill: styles.levelPillAdvanced, text: styles.levelTextAdvanced };
    default:
      return { pill: styles.levelPillIntermediate, text: styles.levelTextIntermediate };
  }
}
