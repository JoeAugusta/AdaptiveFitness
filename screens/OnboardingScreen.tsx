import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Colors, Fonts, FontSizes } from '../constants/design';

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

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen() {
  const navigation = useNavigation<NavProp>();
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const handleContinue = () => {
    if (!selectedGoal) return;
    navigation.navigate('GoalDetails', { goal: selectedGoal });
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>
      <Text style={styles.stepLabel}>Step 1 of 7</Text>

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
    backgroundColor: Colors.bgPrimary,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.bgCard,
    borderRadius: 2,
    marginHorizontal: 24,
    marginTop: 60,
  },
  progressFill: {
    width: '14.3%',
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  stepLabel: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 10,
    marginLeft: 24,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  heading: {
    fontSize: FontSizes.display,
    fontFamily: Fonts.bold, 
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.title,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  cardsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentMuted,
  },
  emoji: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.display,
    marginRight: 14,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold, 
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
    backgroundColor: Colors.bgPrimary,
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: Colors.divider,
  },
  buttonText: {
    fontSize: FontSizes.title,
    fontFamily: Fonts.semiBold, 
    color: Colors.textPrimary,
  },
  buttonTextDisabled: {
    color: Colors.textSecondary,
  },
});
