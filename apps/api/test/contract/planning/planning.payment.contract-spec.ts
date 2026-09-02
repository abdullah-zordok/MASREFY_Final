import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../src/app.module';
import { generateOpenApi } from '../../../src/platform/http/openapi';

describe('payment and match HTTP contract', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  it('registers payment record/reversal and bounded match decision operations', () => {
    const runtime = generateOpenApi(app);
    expect(runtime.paths['/api/v1/obligations/{obligationId}/payments']?.post?.operationId).toBe(
      'allocateObligationPayment',
    );
    expect(
      runtime.paths['/api/v1/obligations/{obligationId}/payments/{paymentId}/reverse']?.post
        ?.operationId,
    ).toBe('reverseObligationPayment');
    expect(runtime.paths['/api/v1/payment-matches']?.get?.operationId).toBe('listPaymentMatches');
    expect(runtime.paths['/api/v1/payment-matches/{matchId}']?.get?.operationId).toBe(
      'getPaymentMatch',
    );
    expect(runtime.paths['/api/v1/payment-matches/{matchId}']?.patch?.operationId).toBe(
      'decidePaymentMatch',
    );
  });
});
