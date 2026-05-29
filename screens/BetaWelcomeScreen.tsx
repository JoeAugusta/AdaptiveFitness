import { useState, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Fonts, FontSizes, Radius } from '../constants/design';
import { Ionicons } from '@expo/vector-icons';

type BetaWelcomeNavProp = NativeStackNavigationProp<RootStackParamList, 'BetaWelcome'>;

const ASK_ROWS: { icon: ReactNode; text: string }[] = [
  { icon: <Ionicons name="flame-outline" size={20} color={Colors.accent} />, text: 'Use it like a real person would — not carefully' },
  { icon: <Ionicons name="search-outline" size={20} color={Colors.accent} />, text: 'Note anything confusing, broken, or ugly' },
  { icon: <Ionicons name="chatbubble-outline" size={20} color={Colors.accent} />, text: 'Profile → Support → Send Feedback to report it' },
];

export default function BetaWelcomeScreen() {
  /** Reserved — welcome flow may grow (e.g. staged reveals). */
  const [_seed] = useState(0);

  const navigation = useNavigation<BetaWelcomeNavProp>();

  const handleGetStarted = async () => {
    await AsyncStorage.setItem('hone_beta_welcome_seen', 'true');
    navigation.reset({
      index: 0,
      routes: [{ name: 'Auth' }],
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.betaBadge}>
          <Text style={styles.betaBadgeText}>BETA • FRIENDS & FAMILY</Text>
        </View>

        <View style={styles.messageCard}>
          <Text style={styles.messageText}>
            {'"'}
            Hiring a great coach used to cost hundreds of dollars a month and required working
            around someone else's schedule.{'\n\n'}
            I built hone because I want to share my passion for fitness with as many people as
            possible — and I think this app is the best way I can do that. AI has finally made it
            possible to give everyone access to the same quality of programming: personalized,
            adaptive, and built around your life.{'\n\n'}
            You're some of the first people to use it.{' '}
            <Text style={styles.messageEmphasis}>
              I need you to be brutally honest with me.
            </Text>
            {'\n\n'}
            Thank you — your feedback will be instrumental in making this app the best it can be.
            {'"'}
          </Text>
          <Text style={styles.signatureName}>— Joe</Text>
          <Text style={styles.signatureTitle}>Founder of hone</Text>
        </View>

        <Text style={styles.askSectionLabel}>WHAT I NEED FROM YOU</Text>
        <View style={styles.askCard}>
          {ASK_ROWS.map((row, index) => (
            <View
              key={row.text}
              style={[
                styles.askRow,
                index === ASK_ROWS.length - 1 ? styles.askRowLast : null,
              ]}
            >
              {row.icon}
              <Text style={styles.askText}>{row.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => void handleGetStarted()}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaLabel}>{`Let's Go →`}</Text>
        </TouchableOpacity>
        <Text style={styles.ctaNote}>
          This screen won't appear again after you close it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  betaBadge: {
    alignSelf: 'center',
    marginTop: 24,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  betaBadgeText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.accent,
    letterSpacing: 2,
  },
  messageCard: {
    marginTop: 16,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 24,
  },
  messageText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  messageEmphasis: {
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  signatureName: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
    marginTop: 20,
  },
  signatureTitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  askSectionLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 32,
  },
  askCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  askRowLast: {
    borderBottomWidth: 0,
  },
  askIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  askText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
  ctaButton: {
    marginTop: 40,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.bgPrimary,
  },
  ctaNote: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textTertiary,
    marginTop: 12,
    textAlign: 'center',
  },
});
