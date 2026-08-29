import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Deletion and retention routes E2E',()=>{
  it('routes deletion and hold mutations with their explicit status codes',async()=>{
    const {app,execute}=await createSecurityE2eHarness({id:'request-1',status:'verified'});
    try{
      await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/api/v1/me/deletion-requests')
        .set('idempotency-key','deletion-e2e-1').send({confirmation:'DELETE_MY_ACCOUNT',reason:'Customer confirmed deletion'}).expect(202);
      await request(app.getHttpServer() as Parameters<typeof request>[0]).post('/api/v1/admin/retention/holds')
        .set('idempotency-key','retention-hold-e2e').send({resourceType:'identity',resourceId:'customer-1',reason:'Legal preservation order'}).expect(201);
      expect(execute.mock.calls.map(([input])=>input.operation)).toEqual(['createMyDeletionRequest','createRetentionHold']);
    }finally{await app.close();}
  });
});
