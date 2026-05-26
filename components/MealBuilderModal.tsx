import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  type ViewStyle,
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
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

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
  onLog: (meal: BuiltMeal) => void | Promise<void>;
  /** Fired after `onLog` completes (e.g. parent saved to DB). */
  onMealLogged?: () => void;
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

const CATEGORY_BADGE_BG: Record<IngredientCategory, string> = {
  protein: Colors.accent,
  carb: Colors.warning,
  fat: Colors.success,
  vegetable: Colors.success,
};

const CATEGORY_BADGE_LABEL: Record<IngredientCategory, string> = {
  protein: 'Protein',
  carb: 'Carbs',
  fat: 'Fat',
  vegetable: 'Veg',
};

/** Full library for search: all four categories, independent of active tab. */
const ALL_INGREDIENT_CATEGORIES: IngredientCategory[] = [
  'protein',
  'carb',
  'fat',
  'vegetable',
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
  onMealLogged,
  slot,
  targetCalories,
  targetProtein,
  dietaryStyle,
  allergies,
}: MealBuilderModalProps) {
  const [activeCategory, setActiveCategory] = useState<IngredientCategory>('protein');
  const [selectedIngredients, setSelectedIngredients] = useState<Ingredient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedIngredients([]);
      setActiveCategory('protein');
      setSearchQuery('');
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

  const allIngredientsFlat = useMemo(
    () =>
      ALL_INGREDIENT_CATEGORIES.flatMap((category) =>
        getFilteredIngredients(category, dietaryStyle, allergies),
      ),
    [dietaryStyle, allergies],
  );

  const isSearchActive = searchQuery.trim().length > 0;

  const displayedIngredients = useMemo(() => {
    if (!isSearchActive) {
      return getFilteredIngredients(activeCategory, dietaryStyle, allergies);
    }
    const q = searchQuery.trim().toLowerCase();
    return allIngredientsFlat
      .filter((i) => i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isSearchActive, searchQuery, activeCategory, dietaryStyle, allergies, allIngredientsFlat]);

  const calRatio = targetCalories > 0 ? totals.calories / targetCalories : 0;
  const progressPct = Math.min(100, calRatio * 100);

  let progressFillStyle: ViewStyle = styles.progressFillBlue;
  if (calRatio > 1.1) {
    progressFillStyle = styles.progressFillAmber;
  } else if (calRatio >= 0.9) {
    progressFillStyle = styles.progressFillGreen;
  }

  const addIngredient = useCallback((ing: Ingredient) => {
    setSelectedIngredients((prev) => [...prev, ing]);
  }, []);

  const removeOneIngredient = useCallback((ing: Ingredient) => {
    setSelectedIngredients((prev) => {
      const idx = prev.findIndex((x) => x.id === ing.id);
      if (idx === -1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleLog = useCallback(() => {
    if (selectedIngredients.length === 0) return;
    const meal: BuiltMeal = {
      slot,
      ingredients: selectedIngredients,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFats: totals.fats,
    };
    void (async () => {
      await Promise.resolve(onLog(meal));
      onMealLogged?.();
      onClose();
    })();
  }, [selectedIngredients, slot, totals, onLog, onMealLogged, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.modalContainer}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.headerClose}>×</Text>
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

          <View style={styles.targetBlock}>
            <View style={styles.targetRow}>
              <Text style={styles.targetRowLabel}>TARGET</Text>
              <View style={styles.pillRow}>
                <View style={styles.pillCal}>
                  <Text style={styles.pillCalText}>{targetCalories} cal</Text>
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
            </View>
            <View style={styles.targetDivider} />
            <View style={styles.targetRow}>
              <Text style={styles.targetRowLabel}>YOURS</Text>
              <View style={styles.pillRow}>
                <View style={styles.pillCal}>
                  <Text style={styles.pillCalText}>{totals.calories} cal</Text>
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

          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search ingredients..."
              placeholderTextColor={Colors.textTertiary}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
              >
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            ) : null}
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
              data={displayedIngredients}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.listContent,
                isSearchActive && displayedIngredients.length === 0
                  ? styles.listContentEmptySearch
                  : null,
              ]}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={<View style={styles.listFooterSpacer} />}
              ListEmptyComponent={
                isSearchActive ? (
                  <View style={styles.searchEmpty}>
                    <Text style={styles.searchEmptyTitle}>No ingredients found</Text>
                    <Text style={styles.searchEmptySub}>Try a different search</Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const count = selectedIngredients.filter((x) => x.id === item.id).length;
                return (
                  <View style={styles.ingredientRow}>
                    <View style={styles.ingredientLeft}>
                      <View style={styles.ingredientNameRow}>
                        {isSearchActive ? (
                          <View
                            style={[
                              styles.categoryBadge,
                              { backgroundColor: CATEGORY_BADGE_BG[item.category] },
                            ]}
                          >
                            <Text style={styles.categoryBadgeText}>
                              {CATEGORY_BADGE_LABEL[item.category]}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={styles.ingredientName}>{item.name}</Text>
                      </View>
                      <Text style={styles.ingredientPortion}>{item.portion}</Text>
                      <View style={styles.ingredientMacroRow}>
                        <View style={styles.miniPillCal}>
                          <Text style={styles.miniPillCalText}>{item.calories} cal</Text>
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
                    {count === 0 ? (
                      <TouchableOpacity
                        style={styles.qtyBtn}
                        onPress={() => addIngredient(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.qtyBtnPlus}>+</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.qtyControlRow}>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => removeOneIngredient(item)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.qtyBtnMinus}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.qtyCount}>{count}</Text>
                        <TouchableOpacity
                          style={styles.qtyBtn}
                          onPress={() => addIngredient(item)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.qtyBtnPlus}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          </View>

          {selectedIngredients.length > 0 ? (
            <View style={styles.summaryBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipScroll}
              >
                {selectedIngredients.map((ing, index) => (
                  <View key={`${ing.id}-${index}`} style={styles.selectedChip}>
                    <Text style={styles.selectedChipText} numberOfLines={1}>
                      {ing.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeOneIngredient(ing)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={styles.chipRemove}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgElevated },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 32,
  },
  headerRow: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerClose: {
    fontFamily: Fonts.bold,
    fontSize: 24,
    color: Colors.textSecondary,
    width: 44,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: Colors.textPrimary,
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold,
  },
  headerLogText: {
    color: Colors.accent,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
  },
  headerLogTextDisabled: { color: Colors.textSecondary },

  targetBlock: {
    marginBottom: Spacing.sm,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  targetRowLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginRight: 8,
    marginTop: 2,
  },
  targetDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 12,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  pillCal: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillCalText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
  },
  pillBlue: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillAmber: {
    backgroundColor: Colors.warning,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillGreen: {
    backgroundColor: Colors.success,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillWhiteText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.label,
    fontFamily: Fonts.semiBold,
  },

  searchBar: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  searchIcon: {
    fontSize: 16,
    color: Colors.textTertiary,
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    backgroundColor: 'transparent',
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    paddingVertical: 0,
  },
  searchClear: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  ingredientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginRight: 6,
  },
  categoryBadgeText: {
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
    color: Colors.bgPrimary,
  },
  searchEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  searchEmptyTitle: {
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  searchEmptySub: {
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.divider,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFillBase: { height: 6, borderRadius: 3 },
  progressFillBlue: { backgroundColor: Colors.accent },
  progressFillAmber: { backgroundColor: Colors.warning },
  progressFillGreen: { backgroundColor: Colors.success },

  tabScroll: { marginVertical: 16, maxHeight: 44 },
  tabScrollContent: { gap: 8, flexDirection: 'row', alignItems: 'center' },
  tabPill: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabPillActive: {
    backgroundColor: Colors.accent,
    borderWidth: 0,
  },
  tabPillText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.medium,
  },
  tabPillTextActive: {
    color: Colors.textPrimary,
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
  },

  listWrap: { flex: 1 },
  listContent: { paddingBottom: 8 },
  listContentEmptySearch: { flexGrow: 1 },
  listFooterSpacer: { height: 100 },
  ingredientRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ingredientLeft: { flex: 1, marginRight: Spacing.sm },
  ingredientName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.body,
    fontFamily: Fonts.semiBold,
    flex: 1,
    flexShrink: 1,
  },
  ingredientPortion: {
    fontFamily: Fonts.regular,
    color: Colors.textSecondary,
    fontSize: FontSizes.caption,
    marginTop: 2,
  },
  ingredientMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  miniPillCal: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginTop: 4,
  },
  miniPillCalText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  miniPillBlue: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginTop: 4,
  },
  miniPillAmber: {
    backgroundColor: Colors.warning,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginTop: 4,
  },
  miniPillGreen: {
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginTop: 4,
  },
  miniPillWhite: {
    color: Colors.textPrimary,
    fontSize: FontSizes.micro,
    fontFamily: Fonts.bold,
  },

  qtyBtn: {
    width: 32,
    height: 32,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnPlus: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  qtyBtnMinus: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyCount: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },

  summaryBar: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingVertical: 10,
    marginHorizontal: -Spacing.xl,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bgPrimary,
  },
  chipScroll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
    maxWidth: 200,
  },
  selectedChipText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.semiBold,
    flexShrink: 1,
  },
  chipRemove: {
    color: Colors.textPrimary,
    fontSize: FontSizes.title,
    fontFamily: Fonts.bold,
  },
});
