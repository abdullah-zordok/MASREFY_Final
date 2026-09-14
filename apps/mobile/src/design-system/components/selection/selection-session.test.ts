import {
  completeSelectionSession,
  openSelectionSession
} from './selection-session';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args)
  }
}));

test('returns to the owning form after a routed selection completes', () => {
  const onSelect = jest.fn();
  const sessionId = openSelectionSession({
    targetRoute: '/settings/currency',
    selectedId: 'SAR',
    onSelect
  });

  expect(completeSelectionSession(sessionId, 'AED')).toBe(true);
  expect(onSelect).toHaveBeenCalledWith('AED');
  expect(mockBack).toHaveBeenCalledTimes(1);
});
