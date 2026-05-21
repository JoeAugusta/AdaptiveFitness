import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function AuthScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={[styles.outer, { paddingHorizontal: Spacing.xl }]}>
        <View style={styles.topZone}>
          <View style={styles.logoContainer}>
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Rect x="0" y="0" width="72" height="72" rx="16" fill="#F97316" />
              <Rect x="19" y="16" width="10" height="40" rx="3" fill="#09090B" />
              <Rect x="43" y="16" width="10" height="40" rx="3" fill="#09090B" />
              <Rect x="19" y="31" width="34" height="10" rx="3" fill="#09090B" />
            </Svg>

            <Text style={styles.wordmark}>hone</Text>
            <Text style={styles.tagline}>Your coach. Built around you.</Text>
          </View>
        </View>

        <View style={[styles.bottomZone, { paddingBottom: Spacing.xl + insets.bottom }]}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.primaryButtonText}>Get Started →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryWrap}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('SignIn')}
          >
            <Text style={styles.secondaryLine}>
              Already have an account?{' '}
              <Text style={styles.secondaryAccent}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  outer: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  topZone: {
    flex: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    gap: 12,
  },
  wordmark: {
    fontFamily: Fonts.bold,
    fontSize: 42,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  bottomZone: {
    flex: 6,
    justifyContent: 'flex-end',
    width: '100%',
    gap: Spacing.lg,
  },
  tagline: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  primaryButton: {
    width: '100%',
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.bgPrimary,
  },
  secondaryWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  secondaryLine: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  secondaryAccent: {
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
});
