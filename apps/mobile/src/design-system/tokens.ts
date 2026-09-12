import type { TextStyle } from 'react-native';

/**
 * Masarifi Gulf Premium design-system token adapter (mobile).
 *
 * This is the ONLY module in the mobile app that owns raw color values. Every
 * feature component consumes the semantic names exported here; raw hex values
 * may never appear outside this file. This satisfies Constitution Principle IV
 * (Semantic Design System Only) and the UI Contract §9.
 *
 * When packages/ui-tokens exports runtime tokens, this adapter will consume
 * them; until then it owns the single approved mapping.
 *
 * Authority: docs/design-system/masarifi-gulf-premium-design-system-v2.1.md
 *            specs/001-mobile-foundation/contracts/foundation-ui-contract.md §9
 */

// Teal is the primary interaction family. Bronze is a restrained premium accent,
// never a second primary.
export const colorTokens = {
  teal: {
    50: '#F2F8F6',
    100: '#DBECE7',
    300: '#C8E2D9',
    500: '#2E8A76',
    600: '#1D7464',
    700: '#175B4F',
    800: '#124A40',
    900: '#103F37',
    950: '#0B2F29'
  },
  bronze: {
    300: '#E2CEB7',
    500: '#CFA47A',
    700: '#93663D'
  },
  sand: {
    50: '#FFFFFF',
    100: '#EEF6F4',
    200: '#F1F5F3',
    300: '#EEF3F0',
    400: '#D7E1DC'
  },
  ink: {
    900: '#10231F',
    700: '#4B534E',
    500: '#707870'
  },
  surface: {
    white: '#FFFFFF'
  },
  neutral: {
    warmSurface: '#F6F7F5',
    warmMuted: '#FAFBFA',
    warmBorder: '#E7E9E6',
    warmText: '#202824'
  },
  dark: {
    background: '#111816',
    surface: '#19231F',
    surfaceMuted: '#202B27',
    border: '#2C3934',
    text: '#F8F0E5',
    textMuted: '#D9CDBD',
    inverse: '#0F211E'
  },
  border: {
    light: '#E7E9E6',
    dark: '#3B4A44',
    focus: '#2E756B'
  },
  // Operational status colors are kept DISTINCT from financial semantic colors
  // per Constitution Product & Technical Constraints.
  status: {
    success: '#2F765D',
    warning: '#93663D',
    danger: '#C04B45',
    info: '#367184',
    neutral: '#746D5D',
    pending: '#6B7280',
    offline: '#7C5F42',
    sync: '#2E7087'
  },
  // Financial semantic colors: positive/inflow vs negative/outflow.
  financial: {
    income: '#0D684A',
    expense: '#B3261E',
    incomeSurface: '#BFEBD9',
    expenseSurface: '#FBC8C3',
    incomeOnHero: '#DDF8EF',
    expenseOnHero: '#FF8F87',
    transfer: '#376E86',
    refund: '#6D6A2E',
    savings: '#5E7464',
    debt: '#8B5A44',
    positive: '#0D684A',
    negative: '#B3261E'
  },
  obligationForm: {
    payableSurface: '#FDF3F2',
    payableBadge: '#FCE4E2',
    payableText: '#B4473F',
    receivableSurface: '#EEF8F4',
    receivableBadge: '#D7F1E6',
    receivableText: '#1B6A4F',
    neutralBadge: '#F4F6F5',
    placeholder: '#A0A8A4',
    card: '#FFFFFF',
    border: '#E8EDE9',
    textMuted: '#555E59',
    helperText: '#34403B',
    inset: '#FAFCFB',
    subduedTrack: '#DCE4E0',
    selectedSurface: '#EEF4F1',
    selectedBorder: '#C6E8DA',
    shadow: '#000'
  },
  chart: {
    donut: ['#1C3934', '#93663D', '#46756C', '#6D6A2E', '#8B5A44'],
    line: ['#1C3934', '#93663D', '#46756C', '#B4473F'],
    patterns: ['solid', 'dash', 'dot', 'dashDot']
  },
  // Exact legacy palette values retained to remove raw colors from feature
  // code without changing the approved rendered UI.
  raw: {
    '000': '#000',
    '000000': '#000000',
    '003399': '#003399',
    '006C35': '#006C35',
    '00732F': '#00732F',
    '007A3D': '#007A3D',
    '008000': '#008000',
    '00B8A6': '#00B8A6',
    '00E5D0': '#00E5D0',
    '012169': '#012169',
    '082A24': '#082A24',
    '0A3161': '#0A3161',
    '0B1A17': '#0B1A17',
    '0D523F': '#0D523F',
    '0D684A': '#0D684A',
    '0D9488': '#0D9488',
    '0F6B58': '#0F6B58',
    '10231F': '#10231F',
    '102723': '#102723',
    '103F37': '#103F37',
    '10B981': '#10B981',
    '14B8A6': '#14B8A6',
    '175B4F': '#175B4F',
    '17211D': '#17211D',
    '16332F': '#16332F',
    '167052': '#167052',
    '1C3934': '#1C3934',
    '1F7A5A': '#1F7A5A',
    '202B27': '#202B27',
    '227D72': '#227D72',
    '2A332F': '#2A332F',
    '2C3934': '#2C3934',
    '2D4B41': '#2D4B41',
    '2DD4BF': '#2DD4BF',
    '2E7087': '#2E7087',
    '2E8A57': '#2E8A57',
    '244541': '#244541',
    '315C55': '#315C55',
    '46756C': '#46756C',
    '38FDF2': '#38FDF2',
    '42A5F5': '#42A5F5',
    '4B534E': '#4B534E',
    '4B5563': '#4B5563',
    '4F46E5': '#4F46E5',
    '5C6BC0': '#5C6BC0',
    '657872': '#657872',
    '68469C': '#68469C',
    '68716C': '#68716C',
    '6B7280': '#6B7280',
    '707870': '#707870',
    '7C8B85': '#7C8B85',
    '8D1B3D': '#8D1B3D',
    '92400E': '#92400E',
    '93663D': '#93663D',
    '94A3B8': '#94A3B8',
    A0A8A4: '#A0A8A4',
    A7F3D0: '#A7F3D0',
    A87446: '#A87446',
    AB47BC: '#AB47BC',
    B22234: '#B22234',
    B4473F: '#B4473F',
    C04B45: '#C04B45',
    C0E5D7: '#C0E5D7',
    C69214: '#C69214',
    CFE0DA: '#CFE0DA',
    C8102E: '#C8102E',
    CBD5E1: '#CBD5E1',
    CE1126: '#CE1126',
    D1E0DA: '#D1E0DA',
    D2E8DC: '#D2E8DC',
    D48B17: '#D48B17',
    D4E2DC: '#D4E2DC',
    D5E5E0: '#D5E5E0',
    D7E1DC: '#D7E1DC',
    D7EFE6: '#D7EFE6',
    D97706: '#D97706',
    DA291C: '#DA291C',
    DB161B: '#DB161B',
    DCE7E2: '#DCE7E2',
    DDE5E1: '#DDE5E1',
    E0E0E0: '#E0E0E0',
    E0E6E2: '#E0E6E2',
    E0E7FF: '#E0E7FF',
    E1ECE8: '#E1ECE8',
    E0F2EB: '#E0F2EB',
    E2EAE6: '#E2EAE6',
    E2E7E3: '#E2E7E3',
    E3ECE9: '#E3ECE9',
    E2F0E8: '#E2F0E8',
    E3F7F2: '#E3F7F2',
    E5E7EB: '#E5E7EB',
    E6F4EE: '#E6F4EE',
    E7E9E6: '#E7E9E6',
    E7F3EF: '#E7F3EF',
    E8EFEC: '#E8EFEC',
    E8F5F0: '#E8F5F0',
    E91E63: '#E91E63',
    EAF2FB: '#EAF2FB',
    EAF4F4: '#EAF4F4',
    EAF5F0: '#EAF5F0',
    EBF0FC: '#EBF0FC',
    EBF5EC: '#EBF5EC',
    EBF7EE: '#EBF7EE',
    EEF2FF: '#EEF2FF',
    EEF3F0: '#EEF3F0',
    EEF6F4: '#EEF6F4',
    EDF0ED: '#EDF0ED',
    EF4444: '#EF4444',
    EF5350: '#EF5350',
    F0F4F2: '#F0F4F2',
    F0F6F3: '#F0F6F3',
    F0F6F4: '#F0F6F4',
    F0F8EC: '#F0F8EC',
    F1F5F3: '#F1F5F3',
    F3EEF9: '#F3EEF9',
    F3F4F6: '#F3F4F6',
    F3F5F3: '#F3F5F3',
    F3F8F5: '#F3F8F5',
    F3F9F6: '#F3F9F6',
    F4F6F5: '#F4F6F5',
    F6F7F5: '#F6F7F5',
    F6F8F7: '#F6F8F7',
    F6FAF8: '#F6FAF8',
    F8FAF9: '#F8FAF9',
    F8FAF8: '#F8FAF8',
    F8FAFB: '#F8FAFB',
    FAFCFB: '#FAFCFB',
    FCECEB: '#FCECEB',
    FDE68A: '#FDE68A',
    FDF0ED: '#FDF0ED',
    FEE2E2: '#FEE2E2',
    FEF8E7: '#FEF8E7',
    FF0000: '#FF0000',
    FF7043: '#FF7043',
    FFA726: '#FFA726',
    FFCC00: '#FFCC00',
    FFF3E8: '#FFF3E8',
    FFF5EB: '#FFF5EB',
    FFF8E7: '#FFF8E7',
    FFFBEB: '#FFFBEB',
    FFFFFF: '#FFFFFF'
  },
  effects: {
    horizonGlow: 'rgba(49, 179, 151, 0.34)',
    horizonGlowDark: 'rgba(29, 116, 100, 0.24)',
    glass: 'rgba(255, 255, 255, 0.08)',
    glassStrong: 'rgba(255, 255, 255, 0.14)',
    glassBorder: 'rgba(255, 255, 255, 0.18)',
    scrim: 'rgba(6, 29, 25, 0.58)',
    scrimDark: 'rgba(6, 29, 25, 0.72)'
  }
} as const;

export type SemanticColorToken =
  | 'primary'
  | 'primaryPressed'
  | 'accent'
  | 'background'
  | 'surface'
  | 'surfaceMuted'
  | 'border'
  | 'textPrimary'
  | 'textSecondary'
  | 'textInverse'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'financialPositive'
  | 'financialNegative';

export interface IconBadgeColors {
  background: string;
  border: string;
  foreground: string;
}

const lightCategoryIconPalette: readonly IconBadgeColors[] = [
  {
    background: '#E7F3EF',
    border: '#C8E2D9',
    foreground: colorTokens.teal['700']
  },
  {
    background: '#FFF3E6',
    border: '#F1D9C2',
    foreground: colorTokens.bronze['700']
  },
  {
    background: '#EAF2FB',
    border: '#CEDFF1',
    foreground: colorTokens.financial.transfer
  },
  {
    background: '#FCECEB',
    border: '#F1D2CF',
    foreground: colorTokens.financial.expense
  },
  {
    background: '#F3EFE8',
    border: '#E2D8CB',
    foreground: colorTokens.status.neutral
  }
];

const darkCategoryIconPalette: readonly IconBadgeColors[] = [
  {
    background: '#18352E',
    border: '#28564A',
    foreground: colorTokens.teal['100']
  },
  {
    background: '#3A2C20',
    border: '#62472F',
    foreground: colorTokens.bronze['300']
  },
  { background: '#1B303A', border: '#315467', foreground: '#9CC4D6' },
  { background: '#3B2424', border: '#633A38', foreground: '#F0A29B' },
  {
    background: '#302D28',
    border: '#4D473E',
    foreground: colorTokens.dark.textMuted
  }
];

export interface ThemeColors {
  primary: string;
  primaryPressed: string;
  accent: string;
  focus: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  financialPositive: string;
  financialNegative: string;
  surfaces: {
    page: string;
    grouped: string;
    card: string;
    inset: string;
    brandStrong: string;
    brandSubtle: string;
    financialHero: string;
    attention: string;
    overlay: string;
  };
  content: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    onFinancialHero: string;
    link: string;
    tertiary?: string;
    disabled: string;
    sensitive: string;
  };
  borders: {
    default: string;
    subtle: string;
    strong: string;
    focus: string;
    selected: string;
    error: string;
    disabled: string;
  };
  interactions: {
    primary: string;
    primaryPressed: string;
    secondary: string;
    quietPressed: string;
    destructive: string;
    premium: string;
  };
  status: {
    success: string;
    warning: string;
    danger: string;
    info: string;
    neutral: string;
    pending: string;
    offline: string;
    sync: string;
    review: string;
    conflict: string;
    readOnly: string;
  };
  financial: {
    income: string;
    expense: string;
    incomeSurface: string;
    expenseSurface: string;
    incomeOnHero: string;
    expenseOnHero: string;
    transfer: string;
    refund: string;
    savings: string;
    debt: string;
  };
  iconBadges: {
    primary: IconBadgeColors;
    accent: IconBadgeColors;
    success: IconBadgeColors;
    warning: IconBadgeColors;
    danger: IconBadgeColors;
    info: IconBadgeColors;
    income: IconBadgeColors;
    expense: IconBadgeColors;
    transfer: IconBadgeColors;
    neutral: IconBadgeColors;
    category: readonly IconBadgeColors[];
  };
  chart: typeof colorTokens.chart;
  horizon: {
    heroStart: string;
    heroEnd: string;
    glow: string;
    wash: string;
    sheet: string;
    sheetBorder: string;
    glass: string;
    metricSurface: string;
    glassStrong: string;
    glassBorder: string;
    ink: string;
    scrim: string;
  };
}

export const lightThemeColors: ThemeColors = {
  primary: colorTokens.teal['900'],
  primaryPressed: colorTokens.teal['950'],
  accent: colorTokens.bronze['700'],
  focus: colorTokens.teal['600'],
  background: colorTokens.sand['100'],
  surface: colorTokens.sand['50'],
  surfaceMuted: colorTokens.sand['200'],
  border: colorTokens.sand['400'],
  textPrimary: colorTokens.ink['900'],
  textSecondary: colorTokens.ink['700'],
  textInverse: colorTokens.surface.white,
  success: colorTokens.status.success,
  warning: colorTokens.status.warning,
  danger: colorTokens.status.danger,
  info: colorTokens.status.info,
  financialPositive: colorTokens.financial.positive,
  financialNegative: colorTokens.financial.negative,
  surfaces: {
    page: colorTokens.sand['100'],
    grouped: colorTokens.sand['50'],
    card: colorTokens.sand['50'],
    inset: colorTokens.sand['200'],
    brandStrong: colorTokens.teal['900'],
    brandSubtle: colorTokens.teal['50'],
    financialHero: colorTokens.teal['900'],
    attention: colorTokens.sand['50'],
    overlay: colorTokens.surface.white
  },
  content: {
    primary: colorTokens.ink['900'],
    secondary: colorTokens.ink['700'],
    muted: colorTokens.ink['500'],
    inverse: colorTokens.surface.white,
    onFinancialHero: colorTokens.surface.white,
    link: colorTokens.teal['900'],
    disabled: colorTokens.ink['500'],
    sensitive: colorTokens.ink['900']
  },
  borders: {
    default: colorTokens.sand['400'],
    subtle: colorTokens.sand['300'],
    strong: colorTokens.border.dark,
    focus: colorTokens.teal['600'],
    selected: colorTokens.teal['900'],
    error: colorTokens.status.danger,
    disabled: colorTokens.sand['400']
  },
  interactions: {
    primary: colorTokens.teal['900'],
    primaryPressed: colorTokens.teal['950'],
    secondary: colorTokens.sand['200'],
    quietPressed: colorTokens.sand['300'],
    destructive: colorTokens.status.danger,
    premium: colorTokens.bronze['700']
  },
  status: {
    ...colorTokens.status,
    review: colorTokens.status.info,
    conflict: colorTokens.status.warning,
    readOnly: colorTokens.status.neutral
  },
  financial: {
    income: colorTokens.financial.income,
    expense: colorTokens.financial.expense,
    incomeSurface: colorTokens.financial.incomeSurface,
    expenseSurface: colorTokens.financial.expenseSurface,
    incomeOnHero: colorTokens.financial.incomeOnHero,
    expenseOnHero: colorTokens.financial.expenseOnHero,
    transfer: colorTokens.financial.transfer,
    refund: colorTokens.financial.refund,
    savings: colorTokens.financial.savings,
    debt: colorTokens.financial.debt
  },
  iconBadges: {
    primary: lightCategoryIconPalette[0],
    accent: lightCategoryIconPalette[1],
    success: lightCategoryIconPalette[0],
    warning: lightCategoryIconPalette[1],
    danger: lightCategoryIconPalette[3],
    info: lightCategoryIconPalette[2],
    income: lightCategoryIconPalette[0],
    expense: lightCategoryIconPalette[3],
    transfer: lightCategoryIconPalette[2],
    neutral: lightCategoryIconPalette[4],
    category: lightCategoryIconPalette
  },
  chart: colorTokens.chart,
  horizon: {
    heroStart: colorTokens.teal['900'],
    heroEnd: colorTokens.teal['600'],
    glow: colorTokens.effects.horizonGlow,
    wash: colorTokens.teal['100'],
    sheet: colorTokens.sand['50'],
    sheetBorder: colorTokens.sand['400'],
    glass: colorTokens.effects.glass,
    metricSurface: colorTokens.teal['800'],
    glassStrong: colorTokens.effects.glassStrong,
    glassBorder: colorTokens.effects.glassBorder,
    ink: colorTokens.ink['900'],
    scrim: colorTokens.effects.scrim
  }
};

export const darkThemeColors: ThemeColors = {
  primary: colorTokens.teal['100'],
  primaryPressed: colorTokens.teal['50'],
  accent: colorTokens.bronze['300'],
  focus: colorTokens.teal['500'],
  background: colorTokens.dark.background,
  surface: colorTokens.dark.surface,
  surfaceMuted: colorTokens.dark.surfaceMuted,
  border: colorTokens.dark.border,
  textPrimary: colorTokens.dark.text,
  textSecondary: colorTokens.dark.textMuted,
  textInverse: colorTokens.dark.inverse,
  success: colorTokens.status.success,
  warning: colorTokens.status.warning,
  danger: colorTokens.status.danger,
  info: colorTokens.status.info,
  financialPositive: colorTokens.financial.positive,
  financialNegative: colorTokens.financial.negative,
  surfaces: {
    page: colorTokens.dark.background,
    grouped: colorTokens.dark.surfaceMuted,
    card: colorTokens.dark.surface,
    inset: colorTokens.dark.surfaceMuted,
    brandStrong: colorTokens.teal['100'],
    brandSubtle: colorTokens.teal['900'],
    financialHero: colorTokens.teal['950'],
    attention: colorTokens.dark.surface,
    overlay: colorTokens.dark.surface
  },
  content: {
    primary: colorTokens.dark.text,
    secondary: colorTokens.dark.textMuted,
    muted: colorTokens.dark.textMuted,
    inverse: colorTokens.dark.inverse,
    onFinancialHero: colorTokens.surface.white,
    link: colorTokens.teal['100'],
    disabled: colorTokens.ink['500'],
    sensitive: colorTokens.dark.text
  },
  borders: {
    default: colorTokens.dark.border,
    subtle: colorTokens.dark.surfaceMuted,
    strong: colorTokens.border.dark,
    focus: colorTokens.teal['500'],
    selected: colorTokens.teal['100'],
    error: colorTokens.status.danger,
    disabled: colorTokens.dark.border
  },
  interactions: {
    primary: colorTokens.teal['100'],
    primaryPressed: colorTokens.teal['50'],
    secondary: colorTokens.dark.surfaceMuted,
    quietPressed: colorTokens.dark.surfaceMuted,
    destructive: colorTokens.status.danger,
    premium: colorTokens.bronze['300']
  },
  status: {
    ...colorTokens.status,
    review: colorTokens.status.info,
    conflict: colorTokens.status.warning,
    readOnly: colorTokens.status.neutral
  },
  financial: {
    income: colorTokens.financial.income,
    expense: colorTokens.financial.expense,
    incomeSurface: colorTokens.teal['900'],
    expenseSurface: colorTokens.dark.surfaceMuted,
    incomeOnHero: colorTokens.financial.incomeOnHero,
    expenseOnHero: colorTokens.financial.expenseOnHero,
    transfer: colorTokens.financial.transfer,
    refund: colorTokens.financial.refund,
    savings: colorTokens.financial.savings,
    debt: colorTokens.financial.debt
  },
  iconBadges: {
    primary: darkCategoryIconPalette[0],
    accent: darkCategoryIconPalette[1],
    success: darkCategoryIconPalette[0],
    warning: darkCategoryIconPalette[1],
    danger: darkCategoryIconPalette[3],
    info: darkCategoryIconPalette[2],
    income: darkCategoryIconPalette[0],
    expense: darkCategoryIconPalette[3],
    transfer: darkCategoryIconPalette[2],
    neutral: darkCategoryIconPalette[4],
    category: darkCategoryIconPalette
  },
  chart: colorTokens.chart,
  horizon: {
    heroStart: colorTokens.teal['950'],
    heroEnd: colorTokens.teal['900'],
    glow: colorTokens.effects.horizonGlowDark,
    wash: colorTokens.dark.surfaceMuted,
    sheet: colorTokens.dark.surface,
    sheetBorder: colorTokens.dark.border,
    glass: colorTokens.effects.glass,
    metricSurface: colorTokens.teal['950'],
    glassStrong: colorTokens.effects.glassStrong,
    glassBorder: colorTokens.effects.glassBorder,
    ink: colorTokens.dark.text,
    scrim: colorTokens.effects.scrimDark
  }
};

// ─── Spacing / radii / typography ────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const radius = {
  sm: 16,
  md: 18,
  control: 18,
  status: 16,
  lg: 18,
  group: 18,
  actionTray: 18,
  card: 18,
  overlay: 18,
  bottomSheet: 18,
  pill: 999
} as const;

export const borderWidth = {
  hairline: 0.5,
  default: 1,
  focus: 2
} as const;

export const elevation = {
  none: {
    shadowOpacity: 0,
    elevation: 0
  },
  raised: {
    shadowColor: colorTokens.teal['950'],
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2
  }
} as const;

export const iconSize = {
  tiny: 17,
  xs: 16,
  sm: 18,
  control: 20,
  feature: 22,
  md: 24,
  lg: 28,
  hero: 30,
  xl: 32
} as const;

export const controlHeight = {
  sm: 44,
  md: 48,
  lg: 56
} as const;

export const viewport = {
  minWidth: 320,
  minHeight: 568
} as const;

// Minimum touch target per Constitution Principle III and UI Contract §8.
export const minTouchTarget = 44;

export const typography = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  headline: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  amount: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as NonNullable<TextStyle['fontVariant']>
  }
} as const;
