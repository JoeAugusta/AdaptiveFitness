import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../constants/design';
import { supabase } from '../Lib/supabase';

interface CardioDayCardProps {
  cardioType: 'light' | 'medium';
  suggestedDurationMinutes: number;
  planId: string;
  weekNumber: number;
  dayNumber: number;
  onComplete: () => void;
}

const CARDIO_COPY = {
  light: {
    label: 'LIGHT CARDIO',
    description:
      'Walking, cycling, or elliptical at a comfortable conversation pace.',
    jordanNote:
      "Zone 2 today. You should be able to hold a full conversation. This burns fat without taxing recovery.",
  },
  medium: {
    label: 'STEADY-STATE CARDIO',
    description:
      'Treadmill jog, rowing, or stair climber at a moderate pace.',
    jordanNote:
      "Moderate intensity today. You're breathing harder but controlled. This is where conditioning improves.",
  },
};

export default function CardioDayCard({
  cardioType,
  suggestedDurationMinutes,
  planId,
  weekNumber,
  dayNumber,
  onComplete,
}: CardioDayCardProps) {
  const [logging, setLogging] = useState(false);
  const copy = CARDIO_COPY[cardioType] ?? CARDIO_COPY.light;

  const handleMarkDone = async () => {
    setLogging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error('No session');

      const { error } = await supabase.from('cardio_logs').insert({
        user_id: session.user.id,
        plan_id: planId,
        week_number: weekNumber,
        day_number: dayNumber,
        cardio_type: cardioType,
        duration_minutes: suggestedDurationMinutes,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;

      onComplete();
    } catch {
      Alert.alert('Error', 'Could not log cardio. Please try again.');
    } finally {
      setLogging(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{copy.label}</Text>
        <View style={styles.durationPill}>
          <Text style={styles.durationText}>{suggestedDurationMinutes} min</Text>
        </View>
      </View>

      <Text style={styles.description}>{copy.description}</Text>

      <View style={styles.jordanStrip}>
        <Text style={styles.jordanStripText}>
          <Text style={styles.jordanStripLabel}>Jordan: </Text>
          {copy.jordanNote}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.cta}
        onPress={handleMarkDone}
        disabled={logging}
        activeOpacity={0.8}
      >
        <Text style={styles.ctaText}>
          {logging ? 'Logging...' : `Mark Done: ${suggestedDurationMinutes} min`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
  },
  durationPill: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  durationText: {
    fontFamily: Fonts.monoMedium,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  jordanStrip: {
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    marginBottom: Spacing.md,
  },
  jordanStripLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.caption,
    color: Colors.accent,
  },
  jordanStripText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  cta: {
    backgroundColor: Colors.accent,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
});
