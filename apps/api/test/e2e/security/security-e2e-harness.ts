import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ClerkAuthGuard } from '../../../src/identity/clerk-auth.guard';
import { PlatformConfigService } from '../../../src/platform/config/platform-config.service';
import { AdminAuthGuard } from '../../../src/security/admin-auth.guard';
import { SecurityController } from '../../../src/security/security.controller';
import { SecurityService, type SecurityOperation } from '../../../src/security/security.service';

export async function createSecurityE2eHarness(result: unknown = {}): Promise<{
  app: INestApplication;
  execute: jest.Mock<Promise<unknown>, [SecurityOperation]>;
}> {
  const execute=jest.fn<Promise<unknown>, [SecurityOperation]>().mockResolvedValue(result);
  const guard={canActivate:(context:{switchToHttp():{getRequest():Record<string,unknown>}})=>{
    context.switchToHttp().getRequest().clerkPrincipal={
      userId:'e2e-admin',sessionId:'e2e-session',factorAgeSeconds:0,mfaAgeSeconds:0,
    };
    return true;
  }};
  const module=await Test.createTestingModule({
    controllers:[SecurityController],
    providers:[
      {provide:SecurityService,useValue:{execute}},
      {provide:PlatformConfigService,useValue:{get:()=>true}},
    ],
  }).overrideGuard(ClerkAuthGuard).useValue(guard)
    .overrideGuard(AdminAuthGuard).useValue(guard).compile();
  const app=module.createNestApplication();
  await app.init();
  return {app,execute};
}
