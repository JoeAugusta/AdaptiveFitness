import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import BetaFeedbackModal from '../components/BetaFeedbackModal';

interface Goal {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;
}

// GAP-5: Added power_hypertrophy as a first-class goal
const GOALS: Goal[] = [
  { id: 'strength',          title: 'Strength Focus',     subtitle: 'Hit a new 1RM on a specific lift',                                                      accentColor: Colors.accent },
  { id: 'power_hypertrophy', title: 'Strength & Size',    subtitle: 'Build serious strength on the big lifts while adding muscle everywhere else',            accentColor: Colors.accent },
  { id: 'hypertrophy',       title: 'Hypertrophy',        subtitle: 'Build muscle size and definition',                                                       accentColor: Colors.success },
  { id: 'recomp',            title: 'Body Recomposition', subtitle: 'Lose fat while gaining muscle',                                                          accentColor: Colors.warning },
  { id: 'fat_loss',          title: 'Fat Loss',           subtitle: 'Lose weight while preserving muscle',                                                    accentColor: Colors.warning },
  { id: 'general',           title: 'General Fitness',    subtitle: 'Improve overall health and fitness',                                                     accentColor: Colors.textSecondary },
];

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen() {
  const navigation = useNavigation<NavProp>();
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const insets = useSafeAreaInsets();

  const handleContinue = () => {
    if (!selectedGoal) return;
    navigation.navigate('GoalDetails', { goal: selectedGoal });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.stepHeader}>
        <View style={styles.stepHeaderTrailing}>
          <Text style={styles.stepIndicator}>1 of 8</Text>
          <TouchableOpacity
            onPress={() => setShowFeedback(true)}
            style={styles.feedbackLink}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.feedbackLinkText}>Feedback</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.heading}>{"What's your main goal?"}</Text>
          <Text style={styles.subtitle}>
            {"We'll build your personalized plan around this"}
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          {GOALS.map((goal) => {
            const isSelected = selectedGoal === goal.id;
            return (
              <TouchableOpacity
                key={goal.id}
                activeOpacity={0.7}
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                ]}
                onPress={() => setSelectedGoal(goal.id)}
              >
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{goal.title}</Text>
                  <Text style={styles.cardSubtitle}>{goal.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Spacing.xxxl + insets.bottom },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.button,
            !selectedGoal && styles.buttonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedGoal}
        >
          <Text
            style={[
              styles.buttonText,
              !selectedGoal && styles.buttonTextDisabled,
            ]}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
      <BetaFeedbackModal
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
        defaultArea="onboarding"
        lockArea={true}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  stepHeader: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    alignItems: 'flex-end',
  },
  stepHeaderTrailing: {
    alignItems: 'flex-end',
  },
  feedbackLink: {
    marginTop: Spacing.xs,
  },
  feedbackLinkText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
  stepIndicator: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
  },
  titleBlock: {
    marginTop: 56,
  },
  heading: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xxxl,
  },
  cardsContainer: {
    gap: 0,
  },
  card: {
    height: 72,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  cardSelected: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentBorder,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Colors.bgPrimary,
  },
  button: {
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    opacity: 1,
  },
  buttonText: {
    fontFamily: Fonts.semiBold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
  },
  buttonTextDisabled: {
    color: Colors.textTertiary,
  },
});
