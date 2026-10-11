import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { voiceAnalyzerService } from '@/services/voice-analyzer-service';
import type {
  VoiceBatchApi,
  VoiceBatchResult
} from '@/services/live/voice-batch-api-service';
import { translate, translateDynamic } from '@/localization/i18n';
import { VoiceBatchStatus } from './VoiceBatchStatus';
import { useVoiceBatches } from './useVoiceBatches';
import { voiceAnalysisKey } from './voice-analysis-query';

jest.mock('@/services/voice-analyzer-service', () => ({
  voiceAnalyzerService: {}
}));

const capture = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const receipt = (status: VoiceBatchResult['status']): VoiceBatchResult => ({
  sessionId: session,
  batchId: null,
  status,
  addedCount: 0,
  transactionIds: [],
  ledgerVersion: 0
});
const empty = {
  results: [],
  pendingIds: [],
  uncertain: false,
  localFailure: false
};

function statusFixture(
  latest: VoiceBatchResult
): ReturnType<typeof useVoiceBatches> {
  return {
    ...empty,
    latest,
    submit: jest.fn(),
    recover: async () => undefined,
    cancel: async () => undefined,
    cancelIds: [],
    localFailureCode: undefined,
    processing: false
  };
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  let batches!: ReturnType<typeof useVoiceBatches>;
  function Harness() {
    batches = useVoiceBatches('fixture-owner');
    return <VoiceBatchStatus batches={batches} />;
  }
  const view = render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  );
  return {
    client,
    get batches() {
      return batches;
    },
    unmount() {
      view.unmount();
      client.clear();
    }
  };
}

it('confirms the authoritative saved count for a multi-event receipt without another Save action', async () => {
  Object.assign(voiceAnalyzerService, {
    recoverBatches: async () => empty,
    runBatch: async () => ({
      ...receipt('completed'),
      addedCount: 2,
      transactionIds: [
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444'
      ],
      ledgerVersion: 2
    }),
    pauseBatches: () => undefined
  });
  const view = mount();
  try {
    await act(async () => {});
    await act(async () => view.batches.submit(capture));
    expect(
      screen.getByText(translateDynamic('voice.batch.added', { count: 2 }))
    ).toBeTruthy();
    expect(screen.queryByText(translate('voice.batch.empty'))).toBeNull();
  } finally {
    view.unmount();
  }
});

it.each([
  { addedCount: 2, transactionIds: [capture, capture], ledgerVersion: 2 },
  {
    addedCount: 2,
    transactionIds: [capture, session, capture],
    ledgerVersion: 2
  },
  { addedCount: 1, transactionIds: [capture], ledgerVersion: 0 },
  {
    addedCount: 1,
    transactionIds: [capture],
    ledgerVersion: 1,
    analysis: {
      mode: 'analysis_only',
      persisted: false,
      events: [],
      expiresAt: new Date(Date.now() + 60000).toISOString()
    }
  }
])(
  'does not claim financial saving from an incomplete or analysis-only receipt %#',
  (fields) => {
    const latest = { ...receipt('completed'), ...fields } as VoiceBatchResult;
    render(<VoiceBatchStatus batches={statusFixture(latest)} />);
    expect(
      screen.queryByText(
        translateDynamic('voice.batch.added', { count: latest.addedCount })
      )
    ).toBeNull();
  }
);

it('shows the committed count and remaining failure for a partial financial receipt', () => {
  const latest = {
    ...receipt('failed'),
    addedCount: 1,
    transactionIds: [capture],
    ledgerVersion: 1
  };
  render(<VoiceBatchStatus batches={statusFixture(latest)} />);
  expect(
    screen.getByText(translateDynamic('voice.batch.added', { count: 1 }))
  ).toBeTruthy();
  expect(screen.getByText(translate('voice.batch.failed'))).toBeTruthy();
});

it('scrubs expired analysis fields from hook state and shared cache', async () => {
  jest.useFakeTimers();
  const expiresAt = new Date(Date.now() + 1000).toISOString();
  Object.assign(voiceAnalyzerService, {
    recoverBatches: async () => ({
      results: [
        {
          ...receipt('completed'),
          analysis: {
            mode: 'analysis_only',
            persisted: false,
            expiresAt,
            events: [
              {
                ordinal: 0,
                kind: 'expense',
                amountMinor: 2500,
                currency: 'SAR',
                accountId: capture,
                categoryId: null,
                title: 'Private breakfast',
                merchant: null,
                occurredAt: new Date().toISOString()
              }
            ]
          }
        }
      ],
      pendingIds: [],
      uncertain: false,
      localFailure: false
    }),
    pauseBatches: () => undefined
  });
  const view = mount();
  try {
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.batches.latest?.analysis?.events).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(1001);
    });
    expect(view.batches.latest?.analysis?.events).toEqual([]);
    expect(
      view.client.getQueryData<
        import('@/services/live/voice-batch-api-service').VoiceBatchResult[]
      >(voiceAnalysisKey('fixture-owner'))?.[0]?.analysis?.events
    ).toEqual([]);
  } finally {
    view.unmount();
    jest.useRealTimers();
  }
});

it('ignores an older recovery snapshot arriving after a terminal submit receipt', async () => {
  let finishRecovery!: (
    value: Awaited<ReturnType<VoiceBatchApi['recoverBatches']>>
  ) => void;
  let finishRun!: (value: VoiceBatchResult) => void;
  const recover = jest
    .fn()
    .mockResolvedValueOnce(empty)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRecovery = resolve;
        })
    );
  Object.assign(voiceAnalyzerService, {
    recoverBatches: recover,
    runBatch: () =>
      new Promise<VoiceBatchResult>((resolve) => {
        finishRun = resolve;
      }),
    pauseBatches: () => undefined
  });
  const view = mount();
  try {
    await act(async () => {});
    act(() => view.batches.submit(capture));
    let recovering!: Promise<void>;
    act(() => {
      recovering = view.batches.recover();
    });
    await act(async () => finishRun(receipt('completed')));
    expect(view.batches.latest?.status).toBe('completed');
    await act(async () => {
      finishRecovery({
        results: [receipt('analyzing')],
        pendingIds: [capture],
        uncertain: false,
        localFailure: false
      });
      await recovering;
    });
    expect(view.batches.latest?.status).toBe('completed');
    expect(view.batches.processing).toBe(false);
    expect(view.batches.pendingIds).toEqual([]);
    expect(screen.queryByText(translate('voice.action.cancel'))).toBeNull();
  } finally {
    view.unmount();
  }
});

it('clears both cancellation aliases without exposing a manual cancellation control', async () => {
  Object.assign(voiceAnalyzerService, {
    recoverBatches: async () => ({
      results: [receipt('analyzing')],
      pendingIds: [capture],
      uncertain: false,
      localFailure: false,
      localSessions: { [capture]: session }
    }),
    cancelBatch: jest.fn(async () => receipt('cancelled')),
    pauseBatches: () => undefined
  });
  const view = mount();
  try {
    await waitFor(() => expect(view.batches.results).toHaveLength(1));
    expect(
      screen.queryByLabelText(translate('voice.action.cancel'))
    ).toBeNull();
    await act(async () => view.batches.cancel(capture));
    await waitFor(() => expect(view.batches.latest?.status).toBe('cancelled'));
    expect(view.batches.pendingIds).toEqual([]);
    await act(async () => view.batches.recover());
    expect(view.batches.latest?.status).toBe('cancelled');
    expect(view.batches.pendingIds).toEqual([]);
  } finally {
    view.unmount();
  }
});
