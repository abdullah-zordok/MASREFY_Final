import '@testing-library/jest-native/extend-expect';
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { changeLocale } from '@/localization/i18n';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: jest.fn(() => ({ dispatch: jest.fn() })),
  usePreventRemove: jest.fn()
}));

beforeEach(() => {
  const expoRouter = jest.requireMock<typeof import('expo-router')>('expo-router');
  expoRouter.usePathname ??= jest.fn(() => '/');
});

afterEach(() => changeLocale('ar'));

// React Native's setup happens via jest-expo preset. This file adds only the
// shared matchers and test-environment adjustments consumed by the foundation
// suite. The mobile Intl implementation under Node 20+ is sufficient for the
// locale-aware number and currency formatting used by the foundation, so no
// polyfill is required.
