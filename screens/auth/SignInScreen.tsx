import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';
import { useAuth } from '../../contexts/AuthContext';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'SignIn'>;

type FocusField = 'email' | 'password' | null;

export default function SignInScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const { refreshPlans } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetBanner, setResetBanner] = useState('');
  const [focusedField, setFocusedField] = useState<FocusField>(null);

  const onForgotPassword = useCallback(async () => {
    setError('');
    setResetBanner('');
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError('Enter your email above to reset your password.');
      return;
    }
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed);
    if (resetErr) {
      setError(resetErr.message);
      return;
    }
    setResetBanner(`Password reset email sent to ${trimmed}`);
  }, [email]);

  const onSubmit = useCallback(async () => {
    setError('');
    setResetBanner('');
    setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signErr || !data.session) {
        setError(signErr?.message ?? 'Could not sign in.');
        return;
      }

      const hasPlansNow = await refreshPlans();

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: hasPlansNow ? 'Dashboard' : 'Onboarding' }],
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [email, password, navigation, refreshPlans]);

  const emailBorder = [
    styles.input,
    focusedField === 'email' && styles.inputFocused,
    error && styles.inputError,
  ];

  const passwordBorder = [
    styles.input,
    focusedField === 'password' && styles.inputFocused,
    error && styles.inputError,
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Spacing.xl + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backIconRow}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.accent} />
          </TouchableOpacity>

          <Text style={styles.screenTitle}>Welcome back</Text>
          <Text style={styles.screenSubtitle}>Sign in to continue</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={emailBorder}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError('');
              }}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField((f) => (f === 'email' ? null : f))}
              editable={!loading}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={passwordBorder}
              placeholder="Your password"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (error) setError('');
              }}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField((f) => (f === 'password' ? null : f))}
              editable={!loading}
            />
          </View>

          {error ? <Text style={styles.fieldError}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonLoading]}
            activeOpacity={0.88}
            onPress={() => void onSubmit()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.bgPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.forgotWrap}
            onPress={() => void onForgotPassword()}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          {resetBanner ? <Text style={styles.resetBanner}>{resetBanner}</Text> : null}

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.bottomLinkWrap}
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.bottomLink}>
              Don&apos;t have an account?{' '}
              <Text style={styles.bottomLinkAccent}>Get Started →</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  backIconRow: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  screenTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  screenSubtitle: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: FontSizes.body * 1.35,
  },
  fieldBlock: {
    marginBottom: Spacing.md,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    height: 52,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
  },
  inputFocused: {
    borderColor: Colors.accent,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  fieldError: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginTop: 4,
    marginBottom: Spacing.sm,
    lineHeight: FontSizes.caption * 1.35,
  },
  primaryButton: {
    marginTop: Spacing.xl,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonLoading: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.bgPrimary,
  },
  forgotWrap: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  forgotText: {
    fontFamily: Fonts.medium,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
  },
  resetBanner: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    lineHeight: FontSizes.caption * 1.35,
  },
  bottomLinkWrap: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  bottomLink: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bottomLinkAccent: {
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
});
