import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';

interface CardioDoneCardProps {
  cardioType: 'light' | 'medium';
  durationMinutes: number;
}

export default function CardioDoneCard({
  cardioType,
  durationMinutes,
}: CardioDoneCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>CARDIO COMPLETE</Text>
      <Text style={styles.value}>
        ✓ {durationMinutes} min{' '}
        {cardioType === 'light' ? 'light cardio' : 'steady-state cardio'} done
      </Text>
      <Text style={styles.sub}>Logged and counted toward your week.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.md,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  value: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sub: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
  },
});
