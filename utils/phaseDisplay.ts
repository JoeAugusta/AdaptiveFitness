import { Colors } from '../constants/design';

export type PhaseOverride = { type: 'deload' | 'travel' };

export function normalizePhaseOverride(
  override?: { type?: string } | null,
): PhaseOverride | undefined {
  if (override?.type === 'deload' || override?.type === 'travel') {
    return { type: override.type };
  }
  return undefined;
}

export function getPhaseDisplay(
  phase: string | undefined,
  weekNumber: number,
  totalWeeks: number,
  override?: PhaseOverride,
): { label: string; color: string; bg: string; borderColor?: string } {
  if (override?.type === 'deload') {
    return {
      label: 'DELOAD',
      color: Colors.success,
      bg: Colors.successMuted,
    };
  }

  if (override?.type === 'travel') {
    return {
      label: 'TRAVEL',
      color: Colors.textSecondary,
      bg: Colors.bgElevated,
    };
  }

  const effectivePhase =
    weekNumber === 1 && (!phase || phase === 'accumulation')
      ? 'baseline'
      : phase;

  if (effectivePhase === 'baseline') {
    return {
      label: 'BASELINE',
      color: Colors.bgPrimary,
      bg: Colors.accent,
    };
  }

  if (effectivePhase === 'deload') {
    return {
      label: 'DELOAD',
      color: Colors.success,
      bg: Colors.successMuted,
    };
  }

  if (effectivePhase === 'intensification') {
    return {
      label: 'INTENSITY',
      color: Colors.warning,
      bg: Colors.warningMuted,
    };
  }

  if (effectivePhase === 'accumulation') {
    return {
      label: 'ACCUM',
      color: Colors.accent,
      bg: Colors.accentMuted,
    };
  }

  console.warn('[getPhaseDisplay] unrecognized phase, using week-number fallback', {
    phase,
    effectivePhase,
    weekNumber,
    totalWeeks,
  });

  if (weekNumber > totalWeeks / 2) {
    return {
      label: 'INTENSITY',
      color: Colors.warning,
      bg: Colors.warningMuted,
    };
  }

  return {
    label: 'ACCUM',
    color: Colors.accent,
    bg: Colors.accentMuted,
  };
}
