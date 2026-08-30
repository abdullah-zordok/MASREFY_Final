/**
 * Centralized Currencies domain definitions and utilities for Masarifi Mobile.
 */

export interface CurrencyItem {
  code: string;
  minorUnitScale: 0 | 2 | 3;
  symbol: string;
  symbolAr?: string;
  symbolEn?: string;
  flag: string;
  nameAr: string;
  nameEn: string;
  countryAr: string;
  countryEn: string;
}

export const supportedCurrencies: readonly CurrencyItem[] = [
  {
    code: 'SAR',
    minorUnitScale: 2,
    symbol: 'SAR',
    symbolAr: '﷼',
    symbolEn: 'SAR',
    flag: '🇸🇦',
    nameAr: 'الريال السعودي',
    nameEn: 'Saudi Riyal',
    countryAr: 'السعودية',
    countryEn: 'Saudi Arabia'
  },
  {
    code: 'AED',
    minorUnitScale: 2,
    symbol: 'AED',
    symbolAr: 'د.إ',
    symbolEn: 'AED',
    flag: '🇦🇪',
    nameAr: 'الدرهم الإماراتي',
    nameEn: 'UAE Dirham',
    countryAr: 'الإمارات',
    countryEn: 'United Arab Emirates'
  },
  {
    code: 'KWD',
    minorUnitScale: 3,
    symbol: 'KWD',
    symbolAr: 'د.ك',
    symbolEn: 'KWD',
    flag: '🇰🇼',
    nameAr: 'الدينار الكويتي',
    nameEn: 'Kuwaiti Dinar',
    countryAr: 'الكويت',
    countryEn: 'Kuwait'
  },
  {
    code: 'QAR',
    minorUnitScale: 2,
    symbol: 'QAR',
    symbolAr: 'ر.ق',
    symbolEn: 'QAR',
    flag: '🇶🇦',
    nameAr: 'الريال القطري',
    nameEn: 'Qatari Riyal',
    countryAr: 'قطر',
    countryEn: 'Qatar'
  },
  {
    code: 'BHD',
    minorUnitScale: 3,
    symbol: 'BHD',
    symbolAr: 'د.ب',
    symbolEn: 'BHD',
    flag: '🇧🇭',
    nameAr: 'الدينار البحريني',
    nameEn: 'Bahraini Dinar',
    countryAr: 'البحرين',
    countryEn: 'Bahrain'
  },
  {
    code: 'OMR',
    minorUnitScale: 3,
    symbol: 'OMR',
    symbolAr: 'ر.ع',
    symbolEn: 'OMR',
    flag: '🇴🇲',
    nameAr: 'الريال العماني',
    nameEn: 'Omani Rial',
    countryAr: 'عمان',
    countryEn: 'Oman'
  },
  {
    code: 'EGP',
    minorUnitScale: 2,
    symbol: 'EGP',
    symbolAr: 'ج.م',
    symbolEn: 'EGP',
    flag: '🇪🇬',
    nameAr: 'الجنيه المصري',
    nameEn: 'Egyptian Pound',
    countryAr: 'مصر',
    countryEn: 'Egypt'
  },
  {
    code: 'USD',
    minorUnitScale: 2,
    symbol: '$',
    symbolAr: '$',
    symbolEn: '$',
    flag: '🇺🇸',
    nameAr: 'الدولار الأمريكي',
    nameEn: 'US Dollar',
    countryAr: 'الولايات المتحدة',
    countryEn: 'United States'
  },
  {
    code: 'EUR',
    minorUnitScale: 2,
    symbol: '€',
    symbolAr: '€',
    symbolEn: '€',
    flag: '🇪🇺',
    nameAr: 'اليورو',
    nameEn: 'Euro',
    countryAr: 'الاتحاد الأوروبي',
    countryEn: 'European Union'
  },
  {
    code: 'GBP',
    minorUnitScale: 2,
    symbol: '£',
    symbolAr: '£',
    symbolEn: '£',
    flag: '🇬🇧',
    nameAr: 'الجنيه الإسترليني',
    nameEn: 'British Pound',
    countryAr: 'المملكة المتحدة',
    countryEn: 'United Kingdom'
  },
  {
    code: 'JOD',
    minorUnitScale: 3,
    symbol: 'JOD',
    symbolAr: 'د.أ',
    symbolEn: 'JOD',
    flag: '🇯🇴',
    nameAr: 'الدينار الأردني',
    nameEn: 'Jordanian Dinar',
    countryAr: 'الأردن',
    countryEn: 'Jordan'
  },
  {
    code: 'JPY',
    minorUnitScale: 0,
    symbol: '¥',
    symbolAr: '¥',
    symbolEn: '¥',
    flag: '🇯🇵',
    nameAr: 'الين الياباني',
    nameEn: 'Japanese Yen',
    countryAr: 'اليابان',
    countryEn: 'Japan'
  }
];

export function getCurrencySymbol(
  currency: CurrencyItem,
  locale: 'ar' | 'en' = 'en'
): string {
  if (locale === 'ar') {
    return currency.symbolAr || currency.symbol;
  }
  return currency.symbolEn || currency.symbol;
}

export function getCurrencyDetails(code: string): CurrencyItem {
  const normalized = (code || 'SAR').toUpperCase().trim();
  const found = supportedCurrencies.find((c) => c.code === normalized);
  if (found) return found;
  return {
    code: normalized,
    minorUnitScale: 2,
    symbol: normalized,
    flag: '🌐',
    nameAr: normalized,
    nameEn: normalized,
    countryAr: '',
    countryEn: ''
  };
}

export function getCurrencyMinorUnitScale(currencyCode: string): number {
  return getCurrencyDetails(currencyCode).minorUnitScale;
}

export function minorToMajorAmount(
  minorUnits: number,
  currencyCode: string
): number {
  return minorUnits / 10 ** getCurrencyMinorUnitScale(currencyCode);
}

export function minorToMajorAmountText(
  minorUnits: number,
  currencyCode: string
): string {
  const scale = getCurrencyMinorUnitScale(currencyCode);
  const factor = 10 ** scale;
  const absoluteMinor = Math.abs(minorUnits);
  const whole = Math.trunc(absoluteMinor / factor);
  const sign = minorUnits < 0 ? '-' : '';
  if (scale === 0) return `${sign}${whole}`;
  const fraction = String(absoluteMinor % factor).padStart(scale, '0');
  const trimmedFraction = fraction.replace(/0+$/, '');
  return trimmedFraction.length > 0
    ? `${sign}${whole}.${trimmedFraction}`
    : `${sign}${whole}`;
}

export function matchesCurrencySearch(
  currency: CurrencyItem,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    currency.code.toLowerCase().includes(q) ||
    currency.symbol.toLowerCase().includes(q) ||
    currency.nameAr.toLowerCase().includes(q) ||
    currency.nameEn.toLowerCase().includes(q) ||
    currency.countryAr.toLowerCase().includes(q) ||
    currency.countryEn.toLowerCase().includes(q)
  );
}
