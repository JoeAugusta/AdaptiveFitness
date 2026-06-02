import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'Auth'>;

export default function AuthScreen() {
  const navigation = useNavigation<NavProp>();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.logoZone}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <Text style={styles.wordmark}>Hone</Text>
        <Text style={styles.tagline}>Your coach. Built around you.</Text>

        <View style={styles.ctaZone}>
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
    width: 96,
    height: 96,
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
