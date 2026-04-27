import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { supabase } from '../Lib/supabase';
import {
  fetchPersonalRecords,
  type PersonalRecord,
} from '../utils/personalRecords';
import { useMetric } from '../utils/units';
import type { ProgressStackParamList } from '../navigation/types';

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' };

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'PersonalRecords'>;

export default function PersonalRecordsScreen() {
  const navigation = useNavigation<Nav>();
  const { formatWorkoutWeight } = useMetric();
  const [prs, setPrs] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }
      const records = await fetchPersonalRecords(session.user.id, 50);
      setPrs(records);
      setLoading(false);
    })();
  }, []);

  return (
    <View style={styles.container}>
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
          contentContainerStyle={styles.scroll}
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
                      style={styles.rowRank}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {MEDAL[i] ?? `#${i + 1}`}
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
                </View>
              ))}
            </View>
          )}

          <Text style={styles.footer}>
            Estimated 1RM calculated using the Epley formula. Single-rep maxes
            recorded directly.
          </Text>
        </ScrollView>
      )}
    </View>
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
    paddingTop: Spacing.xl,
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
    paddingBottom: 48,
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
  },
});
