import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

const BG_DARK = '#0F172A';
const ACCENT_BLUE = '#3B82F6';
const CARD_BG = '#1E293B';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const CHECK_GREEN = '#10B981';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BuildingPlan'>;

const MESSAGES = [
  'Analysing your goals...',
  'Calculating your macros...',
  'Structuring your weekly split...',
  'Applying progressive overload...',
  'Personalising your coaching style...',
  'Almost ready...',
];

const STEPS = [
  'Goal & experience analysed',
  'Nutrition targets calculated',
  'Training plan structured',
];

export default function BuildingPlanScreen() {
  const navigation = useNavigation<NavProp>();

  // --- Pulsing circle ---
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.6,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // --- Cycling subtitle ---
  const [displayedMessage, setDisplayedMessage] = useState(MESSAGES[0]);
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const msgIndexRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(subtitleOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        msgIndexRef.current = (msgIndexRef.current + 1) % MESSAGES.length;
        setDisplayedMessage(MESSAGES[msgIndexRef.current]);
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [subtitleOpacity]);

  // --- Sequential step rows ---
  const stepAnims = useRef(STEPS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      const t = setTimeout(() => {
        Animated.timing(stepAnims[i], {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }, i * 1500);
      timeouts.push(t);
    });
    return () => timeouts.forEach(clearTimeout);
  }, [stepAnims]);

  // --- Navigate after 5000ms ---
  useEffect(() => {
    const t = setTimeout(() => {
      navigation.navigate('Dashboard');
    }, 5000);
    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Pulsing circle */}
      <View style={styles.outerCircle}>
        <Animated.View style={[styles.innerCircle, { opacity: pulseAnim }]} />
      </View>

      {/* Title + cycling subtitle */}
      <View style={styles.middleSection}>
        <Text style={styles.title}>Building Your Plan</Text>
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          {displayedMessage}
        </Animated.Text>
      </View>

      {/* Sequential step rows */}
      <View style={styles.stepsSection}>
        {STEPS.map((step, i) => (
          <Animated.View
            key={step}
            style={[styles.stepRow, { opacity: stepAnims[i] }]}
          >
            <Text style={styles.checkmark}>✓</Text>
            <Text style={styles.stepText}>{step}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT_BLUE,
  },
  middleSection: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 12,
  },
  stepsSection: {
    marginTop: 60,
    alignItems: 'flex-start',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkmark: {
    color: CHECK_GREEN,
    fontSize: 16,
    marginRight: 10,
  },
  stepText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
});
