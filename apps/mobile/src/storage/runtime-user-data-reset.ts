const resets = new Set<() => void | Promise<void>>();
const identityResets = new Set<() => void | Promise<void>>();

export function registerRuntimeUserDataReset(
  reset: () => void | Promise<void>
): () => void {
  resets.add(reset);
  return () => resets.delete(reset);
}

export async function resetRuntimeUserData(): Promise<void> {
  const outcomes = await Promise.allSettled(
    Array.from(resets, async (reset) => reset())
  );
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
  );
  if (failure) throw failure.reason;
}

export function registerRuntimeIdentityReset(
  reset: () => void | Promise<void>
): () => void {
  identityResets.add(reset);
  return () => identityResets.delete(reset);
}

export async function resetRuntimeIdentityData(): Promise<void> {
  const outcomes = await Promise.allSettled(
    Array.from(identityResets, async (reset) => reset())
  );
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
  );
  if (failure) throw failure.reason;
}
