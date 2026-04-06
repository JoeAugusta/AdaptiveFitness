/**
 * Codemod: Fonts + FontSizes from constants/design.ts
 * Run: node scripts/apply-font-tokens.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const FILES = [
  'navigation/index.tsx',
  'components/ExerciseCard.tsx',
  'components/InfoTooltip.tsx',
  'components/MealBuilderModal.tsx',
  'components/RPESelector.tsx',
  'screens/ActiveWorkoutScreen.tsx',
  'screens/ExerciseLibraryScreen.tsx',
  'screens/GoalTrackerScreen.tsx',
  'screens/HomeScreen.tsx',
  'screens/MacroTrackerScreen.tsx',
  'screens/NotificationsSettingsScreen.tsx',
  'screens/OnboardingScreen.tsx',
  'screens/PlanViewScreen.tsx',
  'screens/ProfileSettingsScreen.tsx',
  'screens/ProgressChartsScreen.tsx',
  'screens/SplashScreen.tsx',
  'screens/SubscriptionManagementScreen.tsx',
  'screens/WeeklyCoachSummaryScreen.tsx',
  'screens/WorkoutCompleteScreen.tsx',
  'screens/WorkoutHomeScreen.tsx',
  'screens/onboarding/BodyMetricsScreen.tsx',
  'screens/onboarding/BuildingPlanScreen.tsx',
  'screens/onboarding/ConstraintsScreen.tsx',
  'screens/onboarding/ExperienceScreen.tsx',
  'screens/onboarding/GoalDetailsScreen.tsx',
  'screens/onboarding/MacroSetupScreen.tsx',
  'screens/onboarding/PlanPreviewScreen.tsx',
];

const FONT_SIZE_NUM = new Map([
  [10, 'FontSizes.micro'],
  [11, 'FontSizes.label'],
  [12, 'FontSizes.caption'],
  [13, 'FontSizes.caption'],
  [14, 'FontSizes.caption'],
  [15, 'FontSizes.body'],
  [16, 'FontSizes.title'],
  [17, 'FontSizes.title'],
  [18, 'FontSizes.heading2'],
  [20, 'FontSizes.heading2'],
  [22, 'FontSizes.heading1'],
  [24, 'FontSizes.heading1'],
  [26, 'FontSizes.heading1'],
  [28, 'FontSizes.display'],
  [32, 'FontSizes.display'],
  [34, 'FontSizes.display'],
  [36, 'FontSizes.display'],
]);

const UNMAPPED_SIZES = new Set([38, 40, 48]);

function designImportPath(rel) {
  const norm = rel.replace(/\\/g, '/');
  if (norm.startsWith('screens/onboarding/')) return '../../constants/design';
  return '../constants/design';
}

function weightToFontFamilyKey(w) {
  const s = String(w).toLowerCase();
  if (s === '400') return 'Fonts.regular';
  if (s === '500') return 'Fonts.medium';
  if (s === '600') return 'Fonts.semiBold';
  if (s === '700' || s === '800' || s === 'bold') return 'Fonts.bold';
  return null;
}

function replaceFontWeights(s) {
  let out = s.replace(/fontWeight:\s*(['"])([^'"]+)\1\s*,?/g, (_, q, inner) => {
    const fm = weightToFontFamilyKey(inner);
    return fm ? `fontFamily: ${fm}, ` : '';
  });
  out = out.replace(/fontWeight:\s*(\d+)\s*,?/g, (_, n) => {
    const fm = weightToFontFamilyKey(n);
    return fm ? `fontFamily: ${fm}, ` : '';
  });
  return out;
}

function replaceFontSizes(s) {
  return s.replace(/fontSize:\s*(\d+)(\s*,)?/g, (match, nStr, comma) => {
    const n = parseInt(nStr, 10);
    if (UNMAPPED_SIZES.has(n)) {
      return `fontSize: ${n}${comma || ''} // TODO: map to design token`;
    }
    const token = FONT_SIZE_NUM.get(n);
    if (!token) {
      return `fontSize: ${n}${comma || ''} // TODO: map to design token`;
    }
    return `fontSize: ${token}${comma || ','}`;
  });
}

function replaceSvgFontWeight(s) {
  return s
    .replace(/fontWeight="bold"/g, 'fontFamily={Fonts.bold}')
    .replace(/fontWeight='bold'/g, "fontFamily={Fonts.bold}")
    .replace(/fontWeight="700"/g, 'fontFamily={Fonts.bold}')
    .replace(/fontWeight='700'/g, "fontFamily={Fonts.bold}")
    .replace(/fontWeight="600"/g, 'fontFamily={Fonts.semiBold}')
    .replace(/fontWeight='600'/g, "fontFamily={Fonts.semiBold}");
}

function replaceSvgFontSize(s) {
  return s.replace(/fontSize=\{(\d+)\}/g, (_, nStr) => {
    const n = parseInt(nStr, 10);
    if (UNMAPPED_SIZES.has(n)) return `fontSize={${n}} /* TODO: map to design token */`;
    const token = FONT_SIZE_NUM.get(n);
    if (!token) return `fontSize={${n}} /* TODO: map to design token */`;
    return `fontSize={${token}}`;
  });
}

function replaceSystemFontFamily(s) {
  return s.replace(/fontFamily:\s*['"]System['"]\s*,?/g, 'fontFamily: Fonts.regular, ');
}

function updateImport(s, rel) {
  const designPath = designImportPath(rel);
  const importRe =
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*constants\/design)['"]\s*;/;
  const m = s.match(importRe);
  if (m) {
    const parts = m[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((p) => p.split(/\s+as\s+/)[0].trim());
    const set = new Set(parts);
    set.add('Colors');
    set.add('Fonts');
    set.add('FontSizes');
    const preferred = ['Colors', 'Fonts', 'FontSizes'];
    const rest = [...set].filter((x) => !preferred.includes(x)).sort();
    const ordered = [...preferred.filter((x) => set.has(x)), ...rest];
    return s.replace(
      importRe,
      `import { ${ordered.join(', ')} } from '${designPath}';`,
    );
  }
  const first = s.match(/^import\s+[^\n]+/m);
  if (first) {
    const insert = `import { Colors, Fonts, FontSizes } from '${designPath}';\n`;
    return s.slice(0, first.index) + insert + s.slice(first.index);
  }
  return s;
}

/** Inject fontFamily: Fonts.regular into style value objects that have fontSize but no Fonts.* fontFamily */
function injectRegularInStyleSheetCreate(s) {
  const needle = 'StyleSheet.create';
  let from = 0;
  let out = '';
  while (true) {
    const mi = s.indexOf(needle, from);
    if (mi === -1) {
      out += s.slice(from);
      break;
    }
    out += s.slice(from, mi);
    let p = s.indexOf('{', mi + needle.length);
    if (p === -1) {
      out += s.slice(mi);
      break;
    }
    const openCreate = p;
    p += 1;
    let depth = 1;
    let i = p;
    while (i < s.length && depth > 0) {
      const c = s[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    const inner = s.slice(p, i - 1);
    const patchedInner = patchTopLevelStyleObjectBodies(inner);
    out += s.slice(mi, openCreate + 1) + patchedInner + s[i - 1];
    from = i;
  }
  return out;
}

function patchTopLevelStyleObjectBodies(inner) {
  let result = '';
  let pos = 0;
  const re = /([a-zA-Z_$][\w$]*)\s*:\s*\{/g;
  let m;
  while ((m = re.exec(inner)) !== null) {
    const bracePos = m.index + m[0].length - 1;
    result += inner.slice(pos, bracePos + 1);
    let depth = 1;
    let i = bracePos + 1;
    while (i < inner.length && depth > 0) {
      const c = inner[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    const body = inner.slice(bracePos + 1, i - 1);
    const hasFF = /fontFamily:\s*Fonts\.\w+/.test(body);
    const hasHardFF = /fontFamily:\s*['"]/.test(body);
    const hasFS =
      /fontSize:\s*FontSizes\.\w+/.test(body) || /fontSize:\s*\d+/.test(body);
    let newBody = body;
    if (hasFS && !hasFF && !hasHardFF) {
      const m2 = body.match(/\n(\s+)\S/);
      const ind = m2 ? m2[1] : '    ';
      newBody =
        `\n${ind}fontFamily: Fonts.regular,` +
        (body.startsWith('\n') ? body : `\n${ind}${body.trimStart()}`);
    }
    result += newBody + '}';
    pos = i;
    if (inner[pos] === ',') {
      result += ',';
      pos++;
    }
    re.lastIndex = pos;
  }
  result += inner.slice(pos);
  return result;
}

function processFile(rel) {
  const fp = path.join(ROOT, rel.replace(/\//g, path.sep));
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    return;
  }
  let s = fs.readFileSync(fp, 'utf8');
  const orig = s;

  s = updateImport(s, rel);
  s = replaceFontWeights(s);
  s = replaceSystemFontFamily(s);
  s = replaceFontSizes(s);
  s = injectRegularInStyleSheetCreate(s);
  s = replaceSvgFontWeight(s);
  s = replaceSvgFontSize(s);

  if (s !== orig) {
    fs.writeFileSync(fp, s);
    console.log('updated', rel);
  }
}

for (const f of FILES) {
  processFile(f);
}
