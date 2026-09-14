import { router } from 'expo-router';
import type { SelectionItem } from './selection-types';

export interface SelectionSessionOptions<T = string> {
  targetRoute?: string;
  title?: string;
  subtitle?: string;
  items?: readonly SelectionItem<T>[];
  selectedId?: T | null;
  onSelect: (selectedId: T) => void;
}

export interface SelectionSession<T = string> extends SelectionSessionOptions<T> {
  sessionId: string;
}

const sessions = new Map<string, unknown>();
let nextSessionCounter = 0;

export function openSelectionSession<T = string>(
  options: SelectionSessionOptions<T>
): string {
  const sessionId = `selection-${++nextSessionCounter}`;
  sessions.set(sessionId, {
    ...options,
    sessionId
  });
  if (options.targetRoute) {
    router.push({
      pathname: options.targetRoute,
      params: { sessionId }
    });
  }
  return sessionId;
}

export function getSelectionSession<T = string>(
  sessionId: string
): SelectionSession<T> | undefined {
  return sessions.get(sessionId) as SelectionSession<T> | undefined;
}

export function completeSelectionSession<T = string>(
  sessionId: string,
  selectedValue: T
): boolean {
  const session = getSelectionSession<T>(sessionId);
  if (!session) return false;
  sessions.delete(sessionId);
  session.onSelect(selectedValue);
  if (session.targetRoute) router.back();
  return true;
}

export function cancelSelectionSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}
