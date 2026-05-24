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
import Svg, { Polygon, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { supabase } from '../../Lib/supabase';
import { Colors, Fonts, FontSizes, Spacing, Radius } from '../../constants/design';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'SignUp'>;

type FieldErrors = {
  fullName: string;
  email: string;
  password: string;
  confirm: string;
};

const EMPTY_ERRORS: FieldErrors = {
  fullName: '',
  email: '',
  password: '',
  confirm: '',
};

export default function SignUpScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(EMPTY_ERRORS);
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const inputBorderColor = (
    field: 'fullName' | 'email' | 'password' | 'confirm',
    errorKey: keyof FieldErrors,
  ) =>
    fieldErrors[errorKey]
      ? Colors.danger
      : focusedField === field
        ? Colors.accentBorder
        : Colors.border;

  const validate = useCallback(() => {
    const next: FieldErrors = { ...EMPTY_ERRORS };
    let ok = true;
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      next.fullName = 'Enter your full name';
      ok = false;
    }
    if (!trimmedEmail.includes('@')) {
      next.email = 'Enter a valid email address';
      ok = false;
    }
    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters';
      ok = false;
    }
    if (password !== confirmPassword) {
      next.confirm = 'Passwords must match';
      ok = false;
    }
    setFieldErrors(next);
    return ok;
  }, [email, password, confirmPassword, fullName]);

  const onSubmit = useCallback(async () => {
    setSubmitError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setSubmitError(error.message);
        return;
      }

      if (data.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: data.user.id,
              full_name: fullName.trim(),
            },
            {
              onConflict: 'user_id',
              ignoreDuplicates: false,
            },
          );

        if (profileError) {
          console.log('[SIGNUP] profile upsert error:', profileError.message);
        } else {
          console.log('[SIGNUP] profile saved:', fullName.trim());
        }
      }

      if (data.session) {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'JordanIntro' }],
          }),
        );
      } else {
        setShowConfirmation(true);
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, navigation, validate, fullName]);

  if (showConfirmation) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.confirmWrap, { paddingBottom: Spacing.xl + insets.bottom }]}>
          <TouchableOpacity
            style={styles.backIconRow}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.accent} />
          </TouchableOpacity>

          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Check your email</Text>
            <Text style={styles.confirmBody}>
              We sent a confirmation link to{' '}
              <Text style={styles.confirmEmail}>{email.trim()}</Text>. Once confirmed, come back and sign in.
            </Text>

            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.88}
              onPress={() => navigation.navigate('SignIn')}
            >
              <Text style={styles.secondaryButtonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

          <View style={styles.brandHeader}>
            <Svg width={56} height={56} viewBox="0 0 100 100">
              <Polygon
                points="50,7 89,28 89,72 50,93 11,72 11,28"
                fill="#09090B"
                stroke="#F97316"
                strokeWidth="5"
              />
              <Rect x="24" y="28" width="18" height="44" rx="4" fill="#F97316"/>
              <Rect x="58" y="28" width="18" height="44" rx="4" fill="#F97316"/>
              <Rect x="24" y="42" width="52" height="14" rx="3" fill="#F97316"/>
            </Svg>
            <Text style={styles.brandWord}>hone</Text>
          </View>

          <Text style={styles.screenTitle}>Create account</Text>
          <Text style={styles.screenSubtitle}>Sign up to get started</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.labelFirst}>FULL NAME</Text>
            <TextInput
              style={[
                styles.inputBase,
                { borderColor: inputBorderColor('fullName', 'fullName') },
              ]}
              placeholder="Joe Smith"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="words"
              autoCorrect={false}
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: '' }));
              }}
              onFocus={() => {
                setFocusedField('fullName');
                setSubmitError('');
              }}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
            {fieldErrors.fullName ? (
              <Text style={styles.fieldError}>{fieldErrors.fullName}</Text>
            ) : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={[
                styles.inputBase,
                { borderColor: inputBorderColor('email', 'email') },
              ]}
              placeholder="you@example.com"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
              }}
              onFocus={() => {
                setFocusedField('email');
                setSubmitError('');
              }}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
            {fieldErrors.email ? (
              <Text style={styles.fieldError}>{fieldErrors.email}</Text>
            ) : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={[
                styles.inputBase,
                { borderColor: inputBorderColor('password', 'password') },
              ]}
              placeholder="Minimum 8 characters"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
              }}
              onFocus={() => {
                setFocusedField('password');
                setSubmitError('');
              }}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
            {fieldErrors.password ? (
              <Text style={styles.fieldError}>{fieldErrors.password}</Text>
            ) : null}
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[
                styles.inputBase,
                { borderColor: inputBorderColor('confirm', 'confirm') },
              ]}
              placeholder="Re-enter password"
              placeholderTextColor={Colors.textTertiary}
              secureTextEntry
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (fieldErrors.confirm) setFieldErrors((prev) => ({ ...prev, confirm: '' }));
              }}
              onFocus={() => {
                setFocusedField('confirm');
                setSubmitError('');
              }}
              onBlur={() => setFocusedField(null)}
              editable={!loading}
            />
            {fieldErrors.confirm ? (
              <Text style={styles.fieldError}>{fieldErrors.confirm}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonLoading]}
            activeOpacity={0.88}
            onPress={() => void onSubmit()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.bgPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </TouchableOpacity>

          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

          <Text style={styles.footerSubText}>
            Already have an account?{' '}
            <Text style={styles.footerLink} onPress={() => navigation.navigate('SignIn')}>
              Sign in
            </Text>
          </Text>
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
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.xxxl,
    marginTop: Spacing.sm,
  },
  brandWord: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.title,
    color: Colors.textPrimary,
    letterSpacing: 2,
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
    marginBottom: 0,
  },
  labelFirst: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 0,
    marginBottom: 8,
  },
  label: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  inputBase: {
    height: 52,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    color: Colors.textPrimary,
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
  },
  fieldError: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginTop: 6,
  },
  submitError: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.caption,
    color: Colors.danger,
    marginTop: 6,
    textAlign: 'center',
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
  footerSubText: {
    marginTop: Spacing.xl,
    alignSelf: 'center',
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  footerLink: {
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  confirmWrap: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'flex-start',
  },
  confirmCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  confirmTitle: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.heading1,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  confirmBody: {
    fontFamily: Fonts.regular,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    lineHeight: FontSizes.body * 1.4,
    marginBottom: Spacing.xl,
  },
  confirmEmail: {
    fontFamily: Fonts.semiBold,
    color: Colors.textPrimary,
  },
  secondaryButton: {
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: Fonts.bold,
    fontSize: FontSizes.body,
    color: Colors.accent,
  },
});
