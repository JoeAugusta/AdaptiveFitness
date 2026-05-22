import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function AuthScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.logoZone}>
        <Svg width={120} height={120} viewBox="0 0 72 72">
          <Rect x="0" y="0" width="72" height="72" rx="16" fill="#F97316" />
          <Rect x="19" y="16" width="10" height="40" rx="3" fill="#09090B" />
          <Rect x="43" y="16" width="10" height="40" rx="3" fill="#09090B" />
          <Rect x="19" y="31" width="34" height="10" rx="3" fill="#09090B" />
        </Svg>
        <Text style={styles.wordmark}>hone</Text>
        <Text style={styles.tagline}>Your coach. Built around you.</Text>
      </View>

      <View style={[styles.bottomZone, { paddingBottom: 36 + insets.bottom }]}>
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
    justifyContent: 'center',
    paddingTop: 20,
  },
  wordmark: {
    marginTop: 24,
    fontFamily: Fonts.bold,
    fontSize: 38,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  tagline: {
    marginTop: 12,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bottomZone: {
    paddingHorizontal: 24,
  },
  primaryButton: {
    height: 56,
    marginBottom: 16,
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
