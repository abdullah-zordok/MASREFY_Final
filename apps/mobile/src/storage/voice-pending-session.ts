import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { z } from 'zod';

const pendingSchema = z.object({
  sessionId: z.string().uuid(),
  sessionVersion: z.number().int().positive(),
  recordedAt: z.number().int().nonnegative(),
  timezoneOffsetMinutes: z.number().int(),
  createdAt: z.number().int().nonnegative()
}).strict();

export type PendingVoiceSession = z.infer<typeof pendingSchema>;

function key(ownerId: string): string {
  const hash = bytesToHex(sha256(new TextEncoder().encode(ownerId))).slice(0, 24);
  return `masarifi.voice.pending.${hash}`;
}

export async function loadPendingVoiceSession(
  ownerId: string
): Promise<PendingVoiceSession | null> {
  const raw = await AsyncStorage.getItem(key(ownerId));
  if (!raw) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function savePendingVoiceSession(
  ownerId: string,
  pending: PendingVoiceSession
): Promise<void> {
  return AsyncStorage.setItem(key(ownerId), JSON.stringify(pending));
}

export function clearPendingVoiceSession(ownerId: string): Promise<void> {
  return AsyncStorage.removeItem(key(ownerId));
}
