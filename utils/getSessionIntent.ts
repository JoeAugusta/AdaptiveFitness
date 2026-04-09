export function getSessionIntent(
  phase: string | undefined,
  sessionFocus: string | undefined,
  split: string | undefined,
): string {
  if (sessionFocus && sessionFocus.trim().length > 0) {
    return sessionFocus;
  }
  const phaseMap: Record<string, string> = {
    baseline: 'Calibration week — choose your starting weights',
    accumulation: 'Volume focus — hit your rep targets across all sets',
    intensification: 'Intensity focus — push the top end, not total volume',
    deload: 'Recovery week — 60% effort, prioritise movement quality',
    power: 'Power focus — heavy loads, full rest between sets',
  };
  const normalised = phase?.toLowerCase().trim() ?? '';
  if (phaseMap[normalised]) return phaseMap[normalised];
  const splitDisplay = split
    ? split.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Training';
  return `${splitDisplay} — follow Jordan's targets`;
}
