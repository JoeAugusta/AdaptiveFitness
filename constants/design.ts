export const Colors = {
  // Backgrounds
  bgPrimary: '#09090B',
  bgCard: '#111113',
  bgElevated: '#1C1C1E',

  // Accent
  accent: '#F97316',
  accentDark: '#EA580C',
  accentMuted: 'rgba(249,115,22,0.12)',
  accentBorder: 'rgba(249,115,22,0.4)',

  // Text
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textTertiary: '#52525B',

  // Semantic
  success: '#22C55E',
  successMuted: 'rgba(34,197,94,0.12)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245,158,11,0.12)',
  danger: '#EF4444',
  dangerMuted: 'rgba(239,68,68,0.12)',

  // Surface
  divider: '#27272A',
  border: '#3F3F46',
  overlay: 'rgba(0,0,0,0.7)',
} as const;

export const Fonts = {
  regular: 'DMSans_400Regular',
  italic: 'DMSans_400Regular_Italic',
  medium: 'DMSans_500Medium',
  semiBold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

export const FontSizes = {
  display: 32,
  heading1: 26,
  heading2: 20,
  title: 17,
  body: 15,
  caption: 13,
  label: 11,
  micro: 10,
} as const;

export const LineHeights = {
  display: 38,
  heading1: 32,
  heading2: 26,
  title: 24,
  body: 22,
  caption: 18,
  label: 14,
  micro: 14,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const CommonStyles = {
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans_700Bold',
    color: '#A1A1AA',
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    marginBottom: 12,
    marginTop: 28,
  },
  card: {
    backgroundColor: '#111113',
    borderRadius: 16,
    padding: 20,
  },
  cardCompact: {
    backgroundColor: '#111113',
    borderRadius: 16,
    padding: 16,
  },
  elevatedCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 20,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F97316',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: 'DMSans_600SemiBold',
    color: '#FAFAFA',
  },
  secondaryButton: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F97316',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: 'DMSans_600SemiBold',
    color: '#F97316',
  },
  destructiveButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  destructiveButtonText: {
    fontSize: 16,
    fontFamily: 'DMSans_600SemiBold',
    color: '#EF4444',
  },
  selectedCard: {
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(249,115,22,0.4)',
    borderRadius: 16,
    padding: 20,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    alignSelf: 'flex-start' as const,
  },
  pillText: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
  },
  accentPill: {
    backgroundColor: 'rgba(249,115,22,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  accentPillText: {
    fontSize: 12,
    fontFamily: 'DMSans_700Bold',
    color: '#F97316',
  },
  inputField: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#3F3F46',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'DMSans_400Regular',
    color: '#FAFAFA',
  },
  screenPadding: {
    paddingHorizontal: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#27272A',
  },
} as const;

export const Shadows = {
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;
