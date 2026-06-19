import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function AuthScreen() {
  const navigation = useNavigation<NavProp>();

  // One shared driver per element, staggered via delay
  const logoAnim = useRef(new Animated.Value(0)).current;
  const wordmarkAnim = useRef(new Animated.Value(0)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;
  const ctaAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeUp = (val: Animated.Value, delay: number) =>
      Animated.timing(val, {
        toValue: 1,
        duration: 500,
        delay,
        useNativeDriver: true,
      });

    Animated.stagger(100, [
      fadeUp(logoAnim, 0),
      fadeUp(wordmarkAnim, 0),
      fadeUp(taglineAnim, 0),
      fadeUp(ctaAnim, 0),
    ]).start();
  }, [logoAnim, wordmarkAnim, taglineAnim, ctaAnim]);

  // Helper: maps 0→1 driver to {opacity, translateY}
  const entrance = (val: Animated.Value) => ({
    opacity: val,
    transform: [
      {
        translateY: val.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.logoZone}>
        <Animated.View style={entrance(logoAnim)}>
          <Image
            source={require('../../assets/logo-transparent.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text style={[styles.wordmark, entrance(wordmarkAnim)]}>
          Hone
        </Animated.Text>

        <Animated.Text style={[styles.tagline, entrance(taglineAnim)]}>
          Your coach. Built around you.
        </Animated.Text>

        <Animated.View style={[styles.ctaZone, entrance(ctaAnim)]}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.primaryButtonText}>Get Started →</Text>
          </TouchableOpacity>

          <Text style={styles.subText}>
            Already have an account?{' '}
            <Text style={styles.signInLink} onPress={() => navigation.navigate('SignIn')}>
              Sign in
            </Text>
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  logoZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '28%',
    paddingHorizontal: Spacing.xl,
  },
  brandLogo: {
    width: 150,
    height: 150,
  },
  wordmark: {
    marginTop: 8,
    fontFamily: Fonts.bold,
    fontSize: 38,
    color: Colors.textPrimary,
    letterSpacing: 3,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  ctaZone: {
    marginTop: 96,
    alignSelf: 'stretch',
  },
  primaryButton: {
    height: 56,
    marginBottom: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.bgPrimary,
  },
  subText: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  signInLink: {
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
});