import {
  colorTokens,
  spacing,
  radius,
  elevation,
  iconSize,
  controlHeight,
  borderWidth,
  viewport,
  typography,
  minTouchTarget
} from './tokens';
import { darkThemeColors, lightThemeColors } from './tokens';

describe('SPEC-002 design tokens', () => {
  it('owns approved reference color families centrally', () => {
    expect(colorTokens.teal['900']).toBe(hex('103F37'));
    expect(colorTokens.teal['600']).toBe(hex('1D7464'));
    expect(colorTokens.bronze['500']).toBe(hex('CFA47A'));
    expect(colorTokens.neutral.warmSurface).toBe(hex('F6F7F5'));
    expect(colorTokens.dark.surface).toBe(hex('19231F'));
    expect(colorTokens.border.light).toBe(hex('E7E9E6'));
  });

  it('keeps operational status and financial meaning distinct', () => {
    expect(colorTokens.status.success).not.toBe(colorTokens.financial.income);
    expect(colorTokens.status.danger).not.toBe(colorTokens.financial.expense);
    expect(colorTokens.financial.transfer).toBeDefined();
    expect(colorTokens.financial.savings).toBeDefined();
    expect(colorTokens.financial.debt).toBeDefined();
  });

  it('applies the approved light canvas and card hierarchy without changing the hero or dark theme', () => {
    expect(lightThemeColors).toMatchObject({
      background: hex('F6F7F5'),
      surface: hex('FFFFFF'),
      border: hex('D7E1DC'),
      surfaces: {
        page: hex('F6F7F5'),
        grouped: hex('FFFFFF'),
        card: hex('FFFFFF'),
        inset: hex('F1F5F3'),
        financialHero: hex('103F37')
      },
      borders: {
        default: hex('D7E1DC'),
        subtle: hex('E7E9E6')
      },
      financial: {
        incomeSurface: hex('BFEBD9'),
        expenseSurface: hex('FBC8C3')
      },
      horizon: {
        heroStart: hex('103F37'),
        heroEnd: hex('1D7464'),
        sheet: hex('FFFFFF'),
        sheetBorder: hex('D7E1DC')
      }
    });
    expect(darkThemeColors.surfaces).toMatchObject({
      page: hex('111816'),
      grouped: hex('202B27'),
      card: hex('19231F'),
      inset: hex('202B27'),
      financialHero: hex('0B2F29')
    });
    expect(darkThemeColors.financial).toMatchObject({
      incomeSurface: darkThemeColors.surfaces.brandSubtle,
      expenseSurface: darkThemeColors.surfaces.inset
    });
  });

  it('defines chart palettes with non-color cue names', () => {
    expect(colorTokens.chart.donut).toHaveLength(5);
    expect(colorTokens.chart.line).toHaveLength(4);
    expect(colorTokens.chart.patterns).toEqual([
      'solid',
      'dash',
      'dot',
      'dashDot'
    ]);
  });

  it('defines shared mobile metrics', () => {
    expect(spacing).toMatchObject({ xs: 4, sm: 8, md: 12, lg: 16 });
    expect(radius).toMatchObject({
      sm: 16,
      md: 18,
      control: 18,
      status: 16,
      lg: 18,
      group: 18,
      actionTray: 18,
      card: 18,
      overlay: 18,
      bottomSheet: 18
    });
    expect(borderWidth.default).toBe(1);
    expect(elevation.raised).toMatchObject({
      elevation: 2,
      shadowOpacity: 0.08,
      shadowRadius: 12
    });
    expect(elevation.card).toMatchObject({
      elevation: 3,
      shadowColor: hex('0B2F29'),
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12
    });
    expect(iconSize.md).toBe(24);
    expect(controlHeight.md).toBeGreaterThanOrEqual(minTouchTarget);
    expect(viewport.minWidth).toBe(320);
    expect(viewport.minHeight).toBe(568);
    expect(typography.amount.fontVariant).toEqual(['tabular-nums']);
  });

  it('defines the R01 Gulf Premium semantic roles', () => {
    expect(lightThemeColors.surfaces).toMatchObject({
      page: expect.any(String),
      grouped: expect.any(String),
      card: expect.any(String),
      inset: expect.any(String),
      brandStrong: expect.any(String),
      brandSubtle: expect.any(String),
      attention: expect.any(String),
      overlay: expect.any(String)
    });
    expect(Object.keys(darkThemeColors.surfaces)).toEqual(
      Object.keys(lightThemeColors.surfaces)
    );
    expect(lightThemeColors.content).toMatchObject({
      primary: lightThemeColors.textPrimary,
      secondary: lightThemeColors.textSecondary,
      muted: expect.any(String),
      inverse: lightThemeColors.textInverse,
      link: lightThemeColors.primary,
      disabled: expect.any(String),
      sensitive: expect.any(String)
    });
    expect(lightThemeColors.borders).toMatchObject({
      default: lightThemeColors.border,
      subtle: expect.any(String),
      strong: expect.any(String),
      focus: lightThemeColors.focus,
      selected: lightThemeColors.primary,
      error: lightThemeColors.danger,
      disabled: expect.any(String)
    });
  });

  it('provides the reusable Horizon visual contract', () => {
    expect(lightThemeColors.horizon).not.toBe(darkThemeColors.horizon);
    expect(lightThemeColors.horizon.heroStart).toBe(colorTokens.teal['900']);
    expect(lightThemeColors.horizon.heroEnd).toBe(colorTokens.teal['600']);
    expect(lightThemeColors.horizon.referenceStart).toBe(hex('007A56'));
    expect(lightThemeColors.horizon.referenceEnd).toBe(hex('009F70'));
    expect(lightThemeColors.surfaces.brandStrong).toBe(colorTokens.teal['900']);
    expect(darkThemeColors.horizon.heroStart).toBe(colorTokens.teal['950']);
    expect(darkThemeColors.horizon.heroEnd).toBe(colorTokens.teal['900']);
    expect(Object.keys(lightThemeColors.horizon)).toEqual([
      'heroStart',
      'heroEnd',
      'referenceStart',
      'referenceEnd',
      'glow',
      'wash',
      'sheet',
      'sheetBorder',
      'glass',
      'metricSurface',
      'glassStrong',
      'glassBorder',
      'ink',
      'scrim'
    ]);
    expect(Object.keys(darkThemeColors.horizon)).toEqual(
      Object.keys(lightThemeColors.horizon)
    );
    expect(radius).toMatchObject({
      actionTray: 18,
      bottomSheet: 18,
      group: 18
    });
  });
});

function hex(value: string) {
  return `#${value}`;
}
