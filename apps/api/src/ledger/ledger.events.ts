const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowed = {
  'transaction.created': [
    'transactionId',
    'kind',
    'accountIds',
    'version',
    'ledgerVersion',
    'occurredAt',
    'requestId',
  ],
  'transfer.created': [
    'transactionId',
    'kind',
    'accountIds',
    'version',
    'ledgerVersion',
    'occurredAt',
    'requestId',
  ],
  'transaction.refunded': [
    'transactionId',
    'kind',
    'accountIds',
    'version',
    'ledgerVersion',
    'occurredAt',
    'requestId',
  ],
  'transaction.reversed': [
    'transactionId',
    'kind',
    'accountIds',
    'version',
    'ledgerVersion',
    'occurredAt',
    'requestId',
  ],
  'transaction.revised': [
    'transactionId',
    'oldVersion',
    'version',
    'accountIds',
    'ledgerVersion',
    'requestId',
  ],
  'transaction.deleted': [
    'transactionId',
    'version',
    'undoExpiresAt',
    'ledgerVersion',
    'requestId',
  ],
  'transaction.restored': ['transactionId', 'version', 'ledgerVersion', 'requestId'],
  'balance.changed': ['transactionId', 'accountIds', 'ledgerVersion', 'requestId'],
  'ledger.reconciliation_failed': [
    'accountId',
    'mismatchKind',
    'ledgerVersion',
    'observedAt',
    'requestId',
  ],
} as const;

export type LedgerEventType = keyof typeof allowed;

export function buildLedgerEvent(
  type: LedgerEventType,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const keys = allowed[type];
  if (Object.keys(value).some((key) => !(keys as readonly string[]).includes(key)))
    throw new Error('LEDGER_EVENT_INVALID');
  const integer = (candidate: unknown, minimum = 1) =>
    typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= minimum;
  const transactionEvent = type.startsWith('transaction.');
  const createdKinds: Partial<Record<LedgerEventType, readonly string[]>> = {
    'transaction.created': ['income', 'expense', 'opening'],
    'transfer.created': ['transfer'],
    'transaction.refunded': ['refund'],
    'transaction.reversed': ['reversal'],
  };
  const accountList =
    type === 'transaction.revised' || type === 'balance.changed' || type in createdKinds;
  if (
    !integer(value.ledgerVersion, type === 'ledger.reconciliation_failed' ? 0 : 1) ||
    typeof value.requestId !== 'string' ||
    !value.requestId ||
    value.requestId.length > 128 ||
    (transactionEvent &&
      (typeof value.transactionId !== 'string' ||
        !UUID.test(value.transactionId) ||
        !integer(value.version))) ||
    (type === 'balance.changed' &&
      (typeof value.transactionId !== 'string' || !UUID.test(value.transactionId))) ||
    (accountList &&
      (!Array.isArray(value.accountIds) ||
        value.accountIds.length < 1 ||
        value.accountIds.length > 3 ||
        value.accountIds.some((id) => typeof id !== 'string' || !UUID.test(id)))) ||
    (type === 'balance.changed' &&
      Array.isArray(value.accountIds) &&
      value.accountIds.some(
        (id, index, accountIds) => index > 0 && String(accountIds[index - 1]) >= String(id),
      )) ||
    (type in createdKinds &&
      (!createdKinds[type]?.includes(String(value.kind)) ||
        typeof value.occurredAt !== 'string')) ||
    (type === 'transaction.revised' && !integer(value.oldVersion)) ||
    (type === 'transaction.deleted' && typeof value.undoExpiresAt !== 'string') ||
    (type === 'ledger.reconciliation_failed' &&
      (typeof value.accountId !== 'string' ||
        !UUID.test(value.accountId) ||
        typeof value.mismatchKind !== 'string' ||
        typeof value.observedAt !== 'string'))
  )
    throw new Error('LEDGER_EVENT_INVALID');
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
