import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const CARD_SELECTED_BG = 'rgba(59,130,246,0.12)';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const DISABLED_BG = '#334155';

interface Goal {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const GOALS: Goal[] = [
  { id: 'strength', emoji: '🏋️', title: 'Strength Focus', subtitle: 'Hit a new 1RM on a specific lift' },
  { id: 'hypertrophy', emoji: '💪', title: 'Hypertrophy', subtitle: 'Build muscle size and definition' },
  { id: 'recomp', emoji: '🔄', title: 'Body Recomposition', subtitle: 'Lose fat while gaining muscle' },
  { id: 'fat_loss', emoji: '🔥', title: 'Fat Loss', subtitle: 'Lose weight while preserving muscle' },
  { id: 'general', emoji: '❤️', title: 'General Fitness', subtitle: 'Improve overall health and fitness' },
];

export default function OnboardingScreen() {
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const handleContinue = () => {
    const goal = GOALS.find((g) => g.id === selectedGoal);
    console.log('Selected goal:', goal);
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>
      <Text style={styles.stepLabel}>Step 1 of 6</Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>What's your main goal?</Text>
        <Text style={styles.subtitle}>
          We'll build your personalized plan around this
        </Text>

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
                <Text style={styles.emoji}>{goal.emoji}</Text>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{goal.title}</Text>
                  <Text style={styles.cardSubtitle}>{goal.subtitle}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, !selectedGoal && styles.buttonDisabled]}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  progressBar: {
    height: 4,
    backgroundColor: CARD_BG,
    borderRadius: 2,
    marginHorizontal: 24,
    marginTop: 60,
  },
  progressFill: {
    width: '16.6%',
    height: '100%',
    backgroundColor: ACCENT_BLUE,
    borderRadius: 2,
  },
  stepLabel: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 10,
    marginLeft: 24,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    marginBottom: 32,
  },
  cardsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: ACCENT_BLUE,
    backgroundColor: CARD_SELECTED_BG,
  },
  emoji: {
    fontSize: 28,
    marginRight: 14,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    backgroundColor: BG_DARK,
  },
  button: {
    backgroundColor: ACCENT_BLUE,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: DISABLED_BG,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  buttonTextDisabled: {
    color: TEXT_SECONDARY,
  },
});
