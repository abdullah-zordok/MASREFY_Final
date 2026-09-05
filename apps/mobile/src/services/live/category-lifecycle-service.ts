import { randomUUID } from 'expo-crypto';

import {
  CoreFinanceError,
  type CategoryLifecycleService,
  type CategoryUsagePreview
} from '@/services/contracts/core-finance-service';

type TokenProvider = () => Promise<string>;

export function createLiveCategoryLifecycleService({
  baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '',
  token,
  request = fetch
}: {
  baseUrl?: string;
  token: TokenProvider;
  request?: typeof fetch;
}): CategoryLifecycleService {
  const send = async (
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<unknown> => {
    if (!baseUrl) throw new CoreFinanceError('offline');
    const response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() }),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const value: unknown =
      response.status === 204 ? null : await response.json();
    if (!response.ok)
      throw new CoreFinanceError(
        response.status === 404
          ? 'not_found'
          : response.status === 409
            ? 'conflict'
            : response.status >= 500
              ? 'offline'
              : 'validation'
      );
    return value;
  };
  const scopes = (id: string) => [
    'categories.list',
    `categories.detail.${id}`,
    'transactions.list',
    'home.summary'
  ];
  return {
    async getCategoryUsage(id) {
      const value = (await send(
        'GET',
        `/api/v1/categories/${encodeURIComponent(id)}/usage`
      )) as CategoryUsagePreview;
      if (
        !Number.isSafeInteger(value?.linkedTransactionCount) ||
        value.linkedTransactionCount < 0 ||
        !Number.isSafeInteger(value.version) ||
        value.version < 1
      )
        throw new CoreFinanceError('unknown');
      return value;
    },
    async setCategoryStatus(id, status, preview) {
      const encoded = encodeURIComponent(id);
      if (status === 'archived')
        await send(
          'DELETE',
          `/api/v1/categories/${encoded}?expectedVersion=${preview.version}&expectedLinkedTransactionCount=${preview.linkedTransactionCount}`
        );
      else
        await send('POST', `/api/v1/categories/${encoded}/restore`, {
          expectedVersion: preview.version
        });
      return { affectedScopes: scopes(id) };
    },
    async mergeCategory(sourceId, targetId, preview) {
      await send(
        'POST',
        `/api/v1/categories/${encodeURIComponent(sourceId)}/merge`,
        {
          targetId,
          expectedVersion: preview.version,
          expectedLinkedTransactionCount: preview.linkedTransactionCount
        }
      );
      return {
        affectedScopes: [...scopes(sourceId), `categories.detail.${targetId}`]
      };
    }
  };
}
