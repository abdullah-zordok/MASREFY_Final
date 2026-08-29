import request from 'supertest';
import { createSecurityE2eHarness } from './security-e2e-harness';

describe('Audit and incident routes E2E',()=>{
  it('preserves bounded query input and incident version commands',async()=>{
    const {app,execute}=await createSecurityE2eHarness({items:[],nextCursor:null});
    try{
      await request(app.getHttpServer() as Parameters<typeof request>[0]).get('/api/v1/admin/audit/events?limit=25&severity=high').expect(200);
      await request(app.getHttpServer() as Parameters<typeof request>[0]).patch('/api/v1/admin/security/incidents/incident-1')
        .set('idempotency-key','incident-e2e-1').send({action:'contain',reason:'Confirmed containment action',expectedVersion:2}).expect(200);
      expect(execute.mock.calls[0]?.[0].query).toEqual({limit:'25',severity:'high'});
      expect(execute.mock.calls[1]?.[0]).toMatchObject({operation:'updateSecurityIncident',params:{incidentId:'incident-1'}});
    }finally{await app.close();}
  });
});
