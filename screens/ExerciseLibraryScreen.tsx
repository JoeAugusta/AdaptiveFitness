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
import { Colors, Fonts, FontSizes } from '../constants/design';

const DIFF_COLORS: Record<string, string> = {
  beginner: Colors.success,
  intermediate: Colors.warning,
  advanced: Colors.danger,
};

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
      const diffColor = DIFF_COLORS[ex.difficulty] ?? Colors.textSecondary;

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
              <Text style={styles.equipText}>
                {EQUIP_EMOJIS[ex.equipment] ?? ''} {ex.equipment}
              </Text>
              <View style={[styles.diffPill, { backgroundColor: diffColor + '22', borderColor: diffColor }]}>
                <Text style={[styles.diffText, { color: diffColor }]}>{ex.difficulty}</Text>
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
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Tap ❤️ on any exercise to save it here</Text>
        </View>
      );
    }
    if (activeTab === 'avoided' && filtered.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No exercises marked as avoided</Text>
        </View>
      );
    }
    if (filtered.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No exercises match your search</Text>
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
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Static controls — plain View, no flex, no justifyContent */}
      <View style={{ backgroundColor: Colors.bgPrimary, paddingTop: 0 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Exercise Library</Text>
          <Text style={styles.headerCount}>{filtered.length} exercises</Text>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search exercises..."
            placeholderTextColor={Colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearX}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Muscle group chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 6, marginBottom: 2 }}
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 16, gap: 6 }}
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

        {/* Equipment chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 6, marginBottom: 2 }}
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 16, gap: 6 }}
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

        {/* Tabs */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* List — flex: 1 so it fills all remaining space */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backChevron: {
    fontFamily: Fonts.regular,
    color: Colors.textPrimary, fontSize: FontSizes.display, lineHeight: 36, paddingRight: 8 },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.heading2, fontFamily: Fonts.bold,  flex: 1 },
  headerCount: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },

  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: 12, marginHorizontal: 20, marginTop: 4, marginBottom: 8, paddingHorizontal: 14, height: 44 },
  searchIcon: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption, marginRight: 8 },
  searchInput: {
    fontFamily: Fonts.regular,
    flex: 1, color: Colors.textPrimary, fontSize: FontSizes.body, },
  clearX: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.heading1, lineHeight: 24, paddingLeft: 8 },

  flatList: { flex: 1 },
  chip: { backgroundColor: Colors.divider, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  chipActive: { backgroundColor: Colors.accent },
  chipText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },
  chipTextActive: { color: '#FFFFFF' }, // TODO: map to design token

  tabRow: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 8, marginBottom: 0, gap: 16 },
  tab: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.accent },
  tabText: { color: Colors.textSecondary, fontSize: FontSizes.caption, fontFamily: Fonts.semiBold, },
  tabTextActive: { color: Colors.textPrimary },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  exCard: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row' },
  exLeft: { flex: 1 },
  exRight: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingLeft: 12 },
  exName: { color: Colors.textPrimary, fontSize: FontSizes.body, fontFamily: Fonts.bold, },
  primaryPill: { backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  primaryPillText: { color: '#FFFFFF', fontSize: FontSizes.micro, fontFamily: Fonts.semiBold, }, // TODO: map to design token
  secondaryText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  equipText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, },
  diffPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  diffText: { fontSize: FontSizes.micro, fontFamily: Fonts.semiBold, },
  iconBtn: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.heading2, },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary, fontSize: FontSizes.caption, textAlign: 'center' },
  clearBtn: { marginTop: 12 },
  clearBtnText: { color: Colors.accent, fontSize: FontSizes.caption, fontFamily: Fonts.semiBold, },
});
