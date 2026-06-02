import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';
import { supabase } from '../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { JordanAvatar } from '../components/JordanAvatar';

type AdaptationChangeType =
  | 'increase'
  | 'decrease'
  | 'hold'
  | 'deload'
  | 'calibration';

interface AdaptationChange {
  exerciseName: string;
  muscleGroup: string;
  changeType: AdaptationChangeType;
  previousWeight: number;
  newWeight: number;
  weightDelta: number;
  avgLoggedRpe: number | null;
  targetRpe: number | null;
  rpeGap: number | null;
  reason: string;
}

type NavProp = NativeStackNavigationProp<RootStackParamList, 'AdaptationFeed'>;
type RouteType = RouteProp<RootStackParamList, 'AdaptationFeed'>;

const CHANGE_SORT_ORDER: Record<AdaptationChangeType, number> = {
  increase: 0,
  hold: 1,
  decrease: 2,
  deload: 3,
  calibration: 4,
};

function formatWeight(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
}

function ChangeBadge({ item }: { item: AdaptationChange }) {
  const delta = Math.abs(item.weightDelta);
  const deltaStr = formatWeight(delta);

  if (item.changeType === 'increase') {
    return (
      <View style={[styles.badge, styles.badgeIncrease]}>
        <Text style={styles.badgeTextOnColor}>↑ +{deltaStr} lbs</Text>
      </View>
    );
  }
  if (item.changeType === 'decrease') {
    return (
      <View style={[styles.badge, styles.badgeDecrease]}>
        <Text style={styles.badgeTextOnColor}>↓ −{deltaStr} lbs</Text>
      </View>
    );
  }
  if (item.changeType === 'deload') {
    return (
      <View style={[styles.badge, styles.badgeDeload]}>
        <Text style={styles.badgeTextDeload}>↓ Deload</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeHold]}>
      <Text style={styles.badgeTextHold}>→ Held</Text>
    </View>
  );
}

function ChangeCard({ item }: { item: AdaptationChange }) {
  const weightLine =
    item.previousWeight === 0
      ? `Self-selected → ${formatWeight(item.newWeight)} lbs`
      : `${formatWeight(item.previousWeight)} lbs → ${formatWeight(item.newWeight)} lbs`;

  return (
    <View style={styles.changeCard}>
      <View style={styles.changeCardTop}>
        <Text style={styles.exerciseName} numberOfLines={2}>
          {(item.exerciseName ?? '').toUpperCase()}
        </Text>
        <ChangeBadge item={item} />
      </View>
      {item.muscleGroup ? (
        <Text style={styles.muscleGroup}>{item.muscleGroup}</Text>
      ) : null}
      <Text style={styles.weightLine}>{weightLine}</Text>
      <Text style={styles.reasonText}>"{item.reason}"</Text>
    </View>
  );
}

export default function AdaptationFeedScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { weekNumber } = route.params;

  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<AdaptationChange[]>([]);
  const [phase, setPhase] = useState<string | null>(null);

  const loadChanges = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setChanges([]);
        return;
      }

      const { data: plan, error } = await supabase
        .from('plans')
        .select('plan_json')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const weeks = (plan?.plan_json as { weeks?: unknown[] } | undefined)?.weeks ?? [];
      const weekEntry = weeks.find((w) => {
        const row = w as { weekNumber?: number; week_number?: number };
        const n = row.weekNumber ?? row.week_number;
        return n === weekNumber;
      }) as { adaptationChanges?: AdaptationChange[]; phase?: string } | undefined;

      setChanges(
        Array.isArray(weekEntry?.adaptationChanges)
          ? weekEntry.adaptationChanges
          : [],
      );
      setPhase(weekEntry?.phase ?? null);
    } catch {
      setChanges([]);
    } finally {
      setLoading(false);
    }
  }, [weekNumber]);

  useEffect(() => {
    void loadChanges();
  }, [loadChanges]);

  const sortedChanges = useMemo(
    () =>
      [...changes].sort(
        (a, b) =>
          (CHANGE_SORT_ORDER[a.changeType] ?? 9) -
          (CHANGE_SORT_ORDER[b.changeType] ?? 9),
      ),
    [changes],
  );

  const isDeloadWeek = phase === 'deload' || changes.some((c) => c.changeType === 'deload');
  const isEmpty = !loading && sortedChanges.length === 0;

  const ListHeader = (
    <View style={styles.headerBlock}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.backHit}
      >
        <Text style={styles.backChevron}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.sectionTitle}>WEEK {weekNumber} ADJUSTMENTS</Text>
      <Text style={styles.sectionCaption}>
        {loading
          ? 'Loading…'
          : isEmpty
            ? 'Adjustments appear from Week 2'
            : `${sortedChanges.length} change${sortedChanges.length === 1 ? '' : 's'} this week`}
      </Text>
      <View style={styles.accentLine} />
      {isDeloadWeek && !isEmpty ? (
        <View style={styles.deloadBanner}>
          <View style={styles.deloadBannerTitleRow}>
            <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
            <Text style={styles.deloadBannerTitle}>SCHEDULED RECOVERY WEEK</Text>
          </View>
          <Text style={styles.deloadBannerBody}>
            Week {weekNumber} is your deload. Weights drop to 85% across the board
            — this is programmed.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const ListFooter = !isEmpty ? (
    <View style={styles.jordanFooter}>
      <View style={styles.jordanFooterRow}>
        <JordanAvatar size={32} />
        <Text style={styles.jordanLabel}>JORDAN</Text>
      </View>
      <Text style={styles.jordanFooterText}>
        These adjustments are based on your effort ratings from last week. The more
        honest your RPE, the more accurate your plan gets.
      </Text>
    </View>
  ) : null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.safe}>
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={
            <>
              {ListHeader}
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No adjustments yet</Text>
                <Text style={styles.emptyBody}>
                  Jordan will explain exactly what changed in your plan starting Week
                  2, based on your effort ratings and session completion from the week
                  before.
                </Text>
              </View>
            </>
          }
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={sortedChanges}
        keyExtractor={(item, index) =>
          `${item.exerciseName}-${item.changeType}-${index}`
        }
        renderItem={({ item }) => <ChangeCard item={item} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.itemGap} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  headerBlock: {
    paddingTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  backHit: {
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  backChevron: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  sectionTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionCaption: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  accentLine: {
    height: 2,
    backgroundColor: Colors.accent,
    marginTop: Spacing.md,
    opacity: 0.6,
  },
  deloadBanner: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.lg,
  },
  deloadBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  deloadBannerTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  deloadBannerBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  changeCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
  },
  changeCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  exerciseName: {
    flex: 1,
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  muscleGroup: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  weightLine: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  reasonText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: Spacing.md,
  },
  badge: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  badgeIncrease: {
    backgroundColor: Colors.success,
  },
  badgeDecrease: {
    backgroundColor: Colors.danger,
  },
  badgeHold: {
    backgroundColor: Colors.bgElevated,
  },
  badgeDeload: {
    backgroundColor: Colors.accent,
  },
  badgeTextOnColor: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: '#FFFFFF',
  },
  badgeTextHold: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  badgeTextDeload: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.bgPrimary,
  },
  itemGap: {
    height: Spacing.md,
  },
  jordanFooter: {
    marginTop: Spacing.xxl,
    paddingTop: Spacing.lg,
  },
  jordanFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  jordanLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  jordanFooterText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.xl,
    marginTop: Spacing.lg,
  },
  emptyTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptyBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
});
