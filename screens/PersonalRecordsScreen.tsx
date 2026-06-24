import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import { shareAsync } from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { supabase } from '../Lib/supabase';
import {
  fetchPersonalRecords,
  type PersonalRecord,
} from '../utils/personalRecords';
import { useMetric } from '../utils/units';
import { hapticLight } from '../utils/haptics';
import PRShareCard, { PR_SHARE_CARD_SIZE } from '../components/PRShareCard';
import type { ProgressStackParamList } from '../navigation/types';

type PRData = {
  exerciseName: string;
  estimated1RM: number;
  bestWeightLbs: number;
  bestReps: number;
  isEstimated?: boolean;
  rank?: number;
};

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'PersonalRecords'>;

export default function PersonalRecordsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { formatWorkoutWeight, isMetric } = useMetric();
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPR, setSelectedPR] = useState<PRData | null>(null);
  const prCardRef = useRef<View>(null);

  const handleShareSinglePR = useCallback(async (pr: PersonalRecord, rank: number) => {
    setSelectedPR({
      exerciseName: pr.exerciseName,
      estimated1RM: pr.estimated1RM,
      bestWeightLbs: pr.bestWeightLbs,
      bestReps: pr.bestReps,
      isEstimated: pr.bestReps > 1,
      rank: rank + 1,
    });
    await hapticLight();
    setTimeout(async () => {
      if (!prCardRef.current) return;
      try {
        const uri = await captureRef(prCardRef, {
          format: 'jpg',
          quality: 0.95,
          width: PR_SHARE_CARD_SIZE,
          result: 'tmpfile',
        });
        await shareAsync(uri, {
          mimeType: 'image/jpeg',
          dialogTitle: `Share ${pr.exerciseName} PR`,
        });
      } catch (e) {
        console.warn('[PRShare]', e);
      } finally {
        setSelectedPR(null);
      }
    }, 150);
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }
      const records = await fetchPersonalRecords(session.user.id, undefined, 50);
      setPrs(records);
      setLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.offscreen} pointerEvents="none">
        {selectedPR ? (
          <PRShareCard
            cardRef={prCardRef}
            exerciseName={selectedPR.exerciseName}
            estimated1RM={selectedPR.estimated1RM}
            bestWeightLbs={selectedPR.bestWeightLbs}
            bestReps={selectedPR.bestReps}
            isMetric={isMetric}
            isEstimated={selectedPR.isEstimated ?? true}
            rank={selectedPR.rank}
          />
        ) : null}
      </View>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Personal Records</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 80 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.strip}>
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>RECORDS</Text>
              <Text style={styles.stripValue}>{prs.length}</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>BEST LIFT</Text>
              <Text style={styles.stripValue} numberOfLines={1}>
                {prs[0]?.exerciseName?.split(' ')[0] ?? '—'}
              </Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={styles.stripLabel}>TOP 1RM</Text>
              <Text style={styles.stripValue}>
                {prs[0] ? formatWorkoutWeight(prs[0].estimated1RM) : '—'}
              </Text>
            </View>
          </View>

          {prs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No records yet. Complete your first session to start tracking.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {prs.map((pr, i) => (
                <View
                  key={`${pr.exerciseName}-${i}`}
                  style={[
                    styles.row,
                    i === prs.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.rowLeft}>
                    <Text
                      style={[
                        styles.rowRank,
                        i === 0 ? styles.rankGold
                        : i === 1 ? styles.rankSilver
                        : i === 2 ? styles.rankBronze
                        : null,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      #{i + 1}
                    </Text>
                    <View style={styles.rowMeta}>
                      <View style={styles.rowNameRow}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {pr.exerciseName}
                        </Text>
                        {pr.isRecent ? (
                          <View style={styles.newBadge}>
                            <Text style={styles.newText}>NEW</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.rowSub}>
                        Best set: {formatWorkoutWeight(pr.bestWeightLbs)} × {pr.bestReps} reps
                        {'  ·  '}
                        {new Date(pr.loggedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    <Text style={styles.rowValue}>{formatWorkoutWeight(pr.estimated1RM)}</Text>
                    <Text style={styles.rowUnit}>est. 1RM</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.prRowShareBtn}
                    onPress={() => void handleShareSinglePR(pr, i)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name="share-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.historyLink}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('WorkoutHistory')}
          >
            <Text style={styles.historyLinkText}>See full history →</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>
            Estimated 1RM calculated using the Epley formula. Single-rep maxes
            recorded directly.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  back: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  scroll: {
    padding: Spacing.md,
  },
  strip: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  stripCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  stripDivider: {
    width: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.sm,
  },
  stripLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  stripValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.textPrimary,
  },
  list: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  rowRank: {
    fontSize: 18,
    width: 44,
    fontFamily: Fonts.bold,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  rankGold:   { color: '#F59E0B' },
  rankSilver: { color: '#A1A1AA' },
  rankBronze: { color: '#C2783A' },
  rowMeta: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  rowName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flexShrink: 1,
    marginRight: 6,
  },
  rowSub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginRight: Spacing.sm,
  },
  prRowShareBtn: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offscreen: {
    position: 'absolute',
    top: -1000,
    left: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  rowValue: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading2,
    color: Colors.accent,
  },
  rowUnit: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
  newBadge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.micro,
    color: Colors.accent,
  },
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  historyLink: {
    marginTop: Spacing.lg,
    alignSelf: 'center',
  },
  historyLinkText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
});
