import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getFilteredIngredients,
  type Allergen,
  type DietaryStyle,
  type Ingredient,
  type IngredientCategory,
  type MealSlot,
} from '../constants/ingredientLibrary';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';
const DIVIDER_COLOR = '#2D3F55';
const AMBER = '#F59E0B';
const GREEN = '#22C55E';

export type BuiltMeal = {
  slot: MealSlot;
  ingredients: Ingredient[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
};

type MealBuilderModalProps = {
  visible: boolean;
  onClose: () => void;
  onLog: (meal: BuiltMeal) => void;
  slot: MealSlot;
  targetCalories: number;
  targetProtein: number;
  dietaryStyle: DietaryStyle;
  allergies: Allergen[];
};

const CATEGORY_TABS: { key: IngredientCategory; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carb', label: 'Carb' },
  { key: 'fat', label: 'Fat' },
  { key: 'vegetable', label: 'Veg' },
];

function remainderMacroTargets(targetCalories: number, targetProtein: number): {
  targetCarbsG: number;
  targetFatsG: number;
} {
  const proteinCals = targetProtein * 4;
  const remaining = Math.max(0, targetCalories - proteinCals);
  const targetCarbsG = Math.round((remaining * 0.55) / 4);
  const targetFatsG = Math.round((remaining * 0.45) / 9);
  return { targetCarbsG, targetFatsG };
}

export default function MealBuilderModal({
  visible,
  onClose,
  onLog,
  slot,
  targetCalories,
  targetProtein,
  dietaryStyle,
  allergies,
}: MealBuilderModalProps) {
  const [activeCategory, setActiveCategory] = useState<IngredientCategory>('protein');
  const [selectedIngredients, setSelectedIngredients] = useState<Ingredient[]>([]);

  useEffect(() => {
    if (visible) {
      setSelectedIngredients([]);
      setActiveCategory('protein');
    }
  }, [visible]);

  const totals = useMemo(
    () => ({
      calories: selectedIngredients.reduce((s, i) => s + i.calories, 0),
      protein: selectedIngredients.reduce((s, i) => s + i.protein_g, 0),
      carbs: selectedIngredients.reduce((s, i) => s + i.carbs_g, 0),
      fats: selectedIngredients.reduce((s, i) => s + i.fats_g, 0),
    }),
    [selectedIngredients],
  );

  const { targetCarbsG, targetFatsG } = useMemo(
    () => remainderMacroTargets(targetCalories, targetProtein),
    [targetCalories, targetProtein],
  );

  const filteredList = useMemo(
    () => getFilteredIngredients(activeCategory, slot, dietaryStyle, allergies),
    [activeCategory, slot, dietaryStyle, allergies],
  );

  const calRatio = targetCalories > 0 ? totals.calories / targetCalories : 0;
  const progressPct = Math.min(100, calRatio * 100);

  let progressFillStyle = styles.progressFillBlue;
  if (calRatio > 1.1) {
    progressFillStyle = styles.progressFillAmber;
  } else if (calRatio >= 0.9) {
    progressFillStyle = styles.progressFillGreen;
  }

  const toggleIngredient = useCallback((ing: Ingredient) => {
    setSelectedIngredients((prev) => {
      const exists = prev.some((x) => x.id === ing.id);
      if (exists) return prev.filter((x) => x.id !== ing.id);
      return [...prev, ing];
    });
  }, []);

  const removeIngredient = useCallback((id: string) => {
    setSelectedIngredients((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleLog = useCallback(() => {
    if (selectedIngredients.length === 0) return;
    onLog({
      slot,
      ingredients: selectedIngredients,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFats: totals.fats,
    });
    onClose();
  }, [selectedIngredients, slot, totals, onLog, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.headerClose}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} pointerEvents="none">
            {slot} Builder
          </Text>
          <TouchableOpacity
            onPress={handleLog}
            disabled={selectedIngredients.length === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text
              style={[
                styles.headerLogText,
                selectedIngredients.length === 0 && styles.headerLogTextDisabled,
              ]}
            >
              Log Meal
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.targetBarCard}>
          <Text style={styles.targetLabel}>TARGET</Text>
          <View style={styles.pillRow}>
            <View style={styles.pillNeutral}>
              <Text style={styles.pillNeutralText}>{targetCalories} cal</Text>
            </View>
            <View style={styles.pillBlue}>
              <Text style={styles.pillWhiteText}>{targetProtein}g protein</Text>
            </View>
            <View style={styles.pillAmber}>
              <Text style={styles.pillWhiteText}>{targetCarbsG}g carbs</Text>
            </View>
            <View style={styles.pillGreen}>
              <Text style={styles.pillWhiteText}>{targetFatsG}g fat</Text>
            </View>
          </View>
          <Text style={[styles.targetLabel, styles.yoursLabel]}>YOURS</Text>
          <View style={styles.pillRow}>
            <View style={styles.pillNeutral}>
              <Text style={styles.pillNeutralText}>{totals.calories} cal</Text>
            </View>
            <View style={styles.pillBlue}>
              <Text style={styles.pillWhiteText}>{Math.round(totals.protein)}g protein</Text>
            </View>
            <View style={styles.pillAmber}>
              <Text style={styles.pillWhiteText}>{Math.round(totals.carbs)}g carbs</Text>
            </View>
            <View style={styles.pillGreen}>
              <Text style={styles.pillWhiteText}>{Math.round(totals.fats)}g fat</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFillBase,
                progressFillStyle,
                { width: `${progressPct}%` as `${number}%` },
              ]}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabScrollContent}
        >
          {CATEGORY_TABS.map((tab) => {
            const active = activeCategory === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabPill, active && styles.tabPillActive]}
                onPress={() => setActiveCategory(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.listWrap}>
          <FlatList
            data={filteredList}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={<View style={styles.listFooterSpacer} />}
            renderItem={({ item }) => {
            const selected = selectedIngredients.some((x) => x.id === item.id);
            return (
              <View style={styles.ingredientRow}>
                <View style={styles.ingredientLeft}>
                  <Text style={styles.ingredientName}>{item.name}</Text>
                  <Text style={styles.ingredientPortion}>{item.portion}</Text>
                  <View style={styles.ingredientMacroRow}>
                    <View style={styles.miniPillNeutral}>
                      <Text style={styles.miniPillText}>{item.calories} cal</Text>
                    </View>
                    <View style={styles.miniPillBlue}>
                      <Text style={styles.miniPillWhite}>{item.protein_g}g P</Text>
                    </View>
                    <View style={styles.miniPillAmber}>
                      <Text style={styles.miniPillWhite}>{item.carbs_g}g C</Text>
                    </View>
                    <View style={styles.miniPillGreen}>
                      <Text style={styles.miniPillWhite}>{item.fats_g}g F</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={selected ? styles.addBtnSelected : styles.addBtn}
                  onPress={() => toggleIngredient(item)}
                  activeOpacity={0.7}
                >
                  {selected ? (
                    <Text style={styles.checkMark}>✓</Text>
                  ) : (
                    <Text style={styles.plusMark}>+</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
          />
        </View>

        {selectedIngredients.length > 0 ? (
          <View style={styles.summaryBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {selectedIngredients.map((ing) => (
                <View key={ing.id} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText} numberOfLines={1}>
                    {ing.name}
                  </Text>
                  <TouchableOpacity onPress={() => removeIngredient(ing.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.chipRemove}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG_DARK },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerClose: { color: TEXT_SECONDARY, fontSize: 22, width: 44 },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
  },
  headerLogText: { color: ACCENT_BLUE, fontSize: 15, fontWeight: '600' },
  headerLogTextDisabled: { color: TEXT_SECONDARY },

  targetBarCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  targetLabel: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  yoursLabel: { marginTop: 10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pillNeutral: {
    backgroundColor: DISABLED_BG,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillNeutralText: { color: TEXT_SECONDARY, fontSize: 11, fontWeight: '600' },
  pillBlue: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillAmber: {
    backgroundColor: AMBER,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillGreen: {
    backgroundColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillWhiteText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: DISABLED_BG,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFillBase: { height: 6, borderRadius: 3 },
  progressFillBlue: { backgroundColor: ACCENT_BLUE },
  progressFillAmber: { backgroundColor: AMBER },
  progressFillGreen: { backgroundColor: GREEN },

  tabScroll: { marginBottom: 8, maxHeight: 44 },
  tabScrollContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tabPill: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabPillActive: { backgroundColor: ACCENT_BLUE },
  tabPillText: { color: TEXT_SECONDARY, fontSize: 14, fontWeight: '600' },
  tabPillTextActive: { color: '#FFFFFF' },

  listWrap: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 8 },
  listFooterSpacer: { height: 100 },
  ingredientRow: {
    backgroundColor: CARD_BG,
    marginBottom: 8,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingredientLeft: { flex: 1 },
  ingredientName: { color: TEXT_PRIMARY, fontSize: 15, fontWeight: '600' },
  ingredientPortion: { color: TEXT_SECONDARY, fontSize: 12, marginTop: 2 },
  ingredientMacroRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  miniPillNeutral: {
    backgroundColor: DISABLED_BG,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPillText: { color: TEXT_SECONDARY, fontSize: 11 },
  miniPillBlue: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPillAmber: {
    backgroundColor: AMBER,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPillGreen: {
    backgroundColor: GREEN,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniPillWhite: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: DIVIDER_COLOR,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnSelected: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusMark: { color: TEXT_PRIMARY, fontSize: 18, fontWeight: '600' },
  checkMark: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  summaryBar: {
    borderTopWidth: 1,
    borderTopColor: DIVIDER_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: BG_DARK,
  },
  chipScroll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    maxWidth: 200,
  },
  selectedChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chipRemove: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
