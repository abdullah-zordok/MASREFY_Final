import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey } from '../ledger/idempotency';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import { TrackingService } from './tracking.service';

type Request = AdminPrincipalRequest & { requestId?: string };

@Controller()
@ApiBearerAuth('ClerkBearer')
@UseGuards(AdminAuthGuard)
export class TrackingAdminController {
  constructor(readonly tracking: TrackingService) {}

  @Get('api/v1/admin/imports/overview')
  @ApiOperation({ operationId: 'getAdminImportsOverview' })
  @adminPermission('imports.read')
  overview(@Req() r: Request): Promise<unknown> {
    return this.read(r, 'overview', null, {});
  }
  @Get('api/v1/admin/imports/sessions')
  @ApiOperation({ operationId: 'listAdminImportSessions' })
  @adminPermission('imports.read')
  sessions(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'sessions', null, q);
  }
  @Get('api/v1/admin/imports/sessions/:sessionId')
  @ApiOperation({ operationId: 'getAdminImportSession' })
  @adminPermission('imports.detail.read')
  session(
    @Req() r: Request,
    @Param('sessionId') id: string,
    @Headers('x-access-purpose') purpose?: string,
  ): Promise<unknown> {
    return this.read(r, 'sessions', id, { purpose });
  }
  @Post('api/v1/admin/imports/sessions/:sessionId/retry-handoff')
  @HttpCode(202)
  @ApiOperation({ operationId: 'retryAdminImportSession' })
  @adminPermission('imports.failures.manage', { recentMfa: true })
  retryHandoff(
    @Req() r: Request,
    @Param('sessionId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'sessions', id, b, k);
  }
  @Get('api/v1/admin/imports/failures')
  @ApiOperation({ operationId: 'listAdminImportFailures' })
  @adminPermission('imports.read')
  failures(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'failures', null, q);
  }
  @Post('api/v1/admin/imports/failures/:itemId/action')
  @ApiOperation({ operationId: 'actOnAdminImportFailure' })
  @adminPermission('imports.failures.manage', { recentMfa: true })
  failure(
    @Req() r: Request,
    @Param('itemId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'failures', id, b, k);
  }
  @Get('api/v1/admin/imports/low-confidence')
  @ApiOperation({ operationId: 'listAdminLowConfidence' })
  @adminPermission('imports.read')
  confidence(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'low-confidence', null, q);
  }
  @Post('api/v1/admin/imports/low-confidence/:reviewId/review')
  @ApiOperation({ operationId: 'reviewAdminLowConfidence' })
  @adminPermission('imports.confidence.manage', { recentMfa: true })
  review(
    @Req() r: Request,
    @Param('reviewId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'low-confidence', id, b, k);
  }
  @Get('api/v1/admin/imports/duplicates')
  @ApiOperation({ operationId: 'listAdminDuplicates' })
  @adminPermission('imports.read')
  duplicates(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'duplicates', null, q);
  }
  @Post('api/v1/admin/imports/duplicates/:candidateId/resolve')
  @ApiOperation({ operationId: 'resolveAdminDuplicate' })
  @adminPermission('imports.duplicates.manage', { recentMfa: true })
  duplicate(
    @Req() r: Request,
    @Param('candidateId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'duplicates', id, b, k);
  }
  @Get('api/v1/admin/imports/unsupported-formats')
  @ApiOperation({ operationId: 'listAdminUnsupportedFormats' })
  @adminPermission('imports.read')
  unsupportedFormats(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'unsupported', null, q);
  }
  @Post('api/v1/admin/imports/unsupported-formats/:formatId/action')
  @ApiOperation({ operationId: 'actOnUnsupportedFormat' })
  @adminPermission('imports.unsupported.manage', { recentMfa: true })
  unsupportedAction(
    @Req() r: Request,
    @Param('formatId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'unsupported', id, b, k);
  }

  @Get('api/v1/admin/parsers/institutions')
  @ApiOperation({ operationId: 'listParserInstitutions' })
  @adminPermission('parsers.coverage.read')
  institutions(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'institutions', null, q);
  }
  @Post('api/v1/admin/parsers/institutions')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createParserInstitution' })
  @adminPermission('parsers.senders.manage', { recentMfa: true })
  createInstitution(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.create(r, 'institutions', b, k);
  }
  @Get('api/v1/admin/parsers/institutions/:institutionId')
  @ApiOperation({ operationId: 'getParserInstitution' })
  @adminPermission('parsers.coverage.read')
  institution(@Req() r: Request, @Param('institutionId') id: string): Promise<unknown> {
    return this.read(r, 'institutions', id, {});
  }
  @Patch('api/v1/admin/parsers/institutions/:institutionId')
  @ApiOperation({ operationId: 'updateParserInstitution' })
  @adminPermission('parsers.senders.manage', { recentMfa: true })
  updateInstitution(
    @Req() r: Request,
    @Param('institutionId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'institutions', id, b, k);
  }

  @Get('api/v1/admin/parsers/senders')
  @ApiOperation({ operationId: 'listInstitutionSenders' })
  @adminPermission('parsers.coverage.read')
  parserSenders(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'senders', null, q);
  }
  @Post('api/v1/admin/parsers/senders')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createParserSender' })
  @adminPermission('parsers.senders.manage', { recentMfa: true })
  createSender(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.create(r, 'senders', b, k);
  }
  @Post('api/v1/admin/parsers/senders/:senderId/action')
  @ApiOperation({ operationId: 'mutateInstitutionSender' })
  @adminPermission('parsers.senders.manage', { recentMfa: true })
  senderAction(
    @Req() r: Request,
    @Param('senderId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'senders', id, b, k);
  }
  @Patch('api/v1/admin/parsers/senders/:senderId')
  @ApiOperation({ operationId: 'updateParserSender' })
  @adminPermission('parsers.senders.manage', { recentMfa: true })
  updateSender(
    @Req() r: Request,
    @Param('senderId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'senders', id, b, k);
  }

  @Get('api/v1/admin/parsers/rules')
  @ApiOperation({ operationId: 'listParserRules' })
  @adminPermission('parsers.rules.read')
  rules(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'rules', null, q);
  }
  @Post('api/v1/admin/parsers/rules')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createParserRule' })
  @adminPermission('parsers.rules.manage', { recentMfa: true })
  createRule(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.create(r, 'rules', b, k);
  }
  @Get('api/v1/admin/parsers/rules/:ruleId')
  @ApiOperation({ operationId: 'getParserRule' })
  @adminPermission('parsers.rules.read')
  rule(@Req() r: Request, @Param('ruleId') id: string): Promise<unknown> {
    return this.read(r, 'rules', id, {});
  }
  @Patch('api/v1/admin/parsers/rules/:ruleId')
  @ApiOperation({ operationId: 'updateParserRule' })
  @adminPermission('parsers.rules.manage', { recentMfa: true })
  updateRule(
    @Req() r: Request,
    @Param('ruleId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'rules', id, b, k);
  }
  @Post('api/v1/admin/parsers/rules/:ruleId/test-preview')
  @ApiOperation({ operationId: 'previewParserRule' })
  @adminPermission('parsers.rules.manage')
  preview(
    @Req() r: Request,
    @Param('ruleId') id: string,
    @Body() b: unknown,
  ): Promise<Record<string, unknown>> {
    return this.tracking.parserPreview(this.principal(r), id, b);
  }
  @Post('api/v1/admin/parsers/rules/:ruleId/versions')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createParserVersion' })
  @adminPermission('parsers.versions.manage', { recentMfa: true })
  createVersion(
    @Req() r: Request,
    @Param('ruleId') ruleId: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.tracking.createParserVersion(ruleId, this.input(r, b, k));
  }

  @Get('api/v1/admin/parsers/test-cases')
  @ApiOperation({ operationId: 'listParserTestCases' })
  @adminPermission('parsers.rules.read')
  cases(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'test-cases', null, q);
  }
  @Post('api/v1/admin/parsers/test-cases')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createParserTestCase' })
  @adminPermission('parsers.versions.manage', { recentMfa: true })
  createCase(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.create(r, 'test-cases', b, k);
  }
  @Post('api/v1/admin/parsers/test-cases/run')
  @HttpCode(202)
  @ApiOperation({ operationId: 'runParserCorpus' })
  @adminPermission('parsers.tests.run', { recentMfa: true })
  runCases(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.tracking.runCorpus(null, this.input(r, b, k));
  }
  @Patch('api/v1/admin/parsers/test-cases/:caseId')
  @ApiOperation({ operationId: 'updateParserTestCase' })
  @adminPermission('parsers.versions.manage', { recentMfa: true })
  updateCase(
    @Req() r: Request,
    @Param('caseId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'test-cases', id, b, k);
  }

  @Get('api/v1/admin/parsers/versions')
  @ApiOperation({ operationId: 'listParserVersions' })
  @adminPermission('parsers.rules.read')
  versions(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'versions', null, q);
  }
  @Post('api/v1/admin/parsers/versions/:versionId/action')
  @ApiOperation({ operationId: 'mutateParserVersion' })
  @adminPermission('parsers.versions.manage', { recentMfa: true })
  versionAction(
    @Req() r: Request,
    @Param('versionId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'versions', id, b, k);
  }
  @Post('api/v1/admin/parsers/versions/:versionId/corpus-runs')
  @HttpCode(202)
  @ApiOperation({ operationId: 'runParserVersionCorpus' })
  @adminPermission('parsers.tests.run', { recentMfa: true })
  runVersion(
    @Req() r: Request,
    @Param('versionId') id: string,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.tracking.runCorpus(
      id,
      this.input(
        r,
        { action: 'run', reason: 'Operator requested parser corpus run', expectedVersion: 1 },
        k,
      ),
    );
  }
  @Post('api/v1/admin/parsers/versions/:versionId/publish')
  @ApiOperation({ operationId: 'publishParserVersion' })
  @adminPermission('parsers.versions.manage', { recentMfa: true })
  publish(
    @Req() r: Request,
    @Param('versionId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.tracking.publishVersion(id, this.input(r, b, k));
  }

  @Get('api/v1/admin/parsers/merchant-rules')
  @ApiOperation({ operationId: 'listMerchantRules' })
  @adminPermission('parsers.rules.read')
  merchants(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'merchant-rules', null, q);
  }
  @Post('api/v1/admin/parsers/merchant-rules')
  @ApiOperation({ operationId: 'mutateMerchantRule' })
  @adminPermission('parsers.merchants.manage', { recentMfa: true })
  createMerchant(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'merchant-rules', null, b, k);
  }
  @Patch('api/v1/admin/parsers/merchant-rules/:ruleId')
  @ApiOperation({ operationId: 'updateMerchantRule' })
  @adminPermission('parsers.merchants.manage', { recentMfa: true })
  updateMerchant(
    @Req() r: Request,
    @Param('ruleId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'merchant-rules', id, b, k);
  }
  @Get('api/v1/admin/parsers/category-rules')
  @ApiOperation({ operationId: 'listCategoryRules' })
  @adminPermission('parsers.rules.read')
  categories(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'category-rules', null, q);
  }
  @Post('api/v1/admin/parsers/category-rules')
  @ApiOperation({ operationId: 'mutateCategoryRule' })
  @adminPermission('parsers.categories.manage', { recentMfa: true })
  createCategory(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'category-rules', null, b, k);
  }
  @Patch('api/v1/admin/parsers/category-rules/:ruleId')
  @ApiOperation({ operationId: 'updateCategoryRule' })
  @adminPermission('parsers.categories.manage', { recentMfa: true })
  updateCategory(
    @Req() r: Request,
    @Param('ruleId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'category-rules', id, b, k);
  }

  @Post('api/v1/admin/imports/:sessionId/retry')
  @HttpCode(202)
  @ApiOperation({ operationId: 'retryImportSession' })
  @adminPermission('imports.failures.manage', { recentMfa: true })
  retry(
    @Req() r: Request,
    @Param('sessionId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'sessions', id, b, k);
  }
  @Post('api/v1/admin/imports/:sessionId/cancel')
  @ApiOperation({ operationId: 'cancelImportSession' })
  @adminPermission('imports.failures.manage', { recentMfa: true })
  cancel(
    @Req() r: Request,
    @Param('sessionId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'sessions', id, b, k);
  }
  @Get('api/v1/admin/imports/unsupported')
  @ApiOperation({ operationId: 'listUnsupportedFormats' })
  @adminPermission('imports.read')
  unsupported(@Req() r: Request, @Query() q: Record<string, unknown>): Promise<unknown> {
    return this.read(r, 'unsupported', null, q);
  }
  @Patch('api/v1/admin/imports/unsupported/:formatId')
  @ApiOperation({ operationId: 'updateUnsupportedFormat' })
  @adminPermission('imports.unsupported.manage', { recentMfa: true })
  updateUnsupported(
    @Req() r: Request,
    @Param('formatId') id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'unsupported', id, b, k);
  }
  @Get('api/v1/admin/settings/imports')
  @ApiOperation({ operationId: 'getImportSettings' })
  @adminPermission('settings.imports.read')
  settings(@Req() r: Request): Promise<unknown> {
    return this.read(r, 'settings', null, {});
  }
  @Patch('api/v1/admin/settings/imports')
  @ApiOperation({ operationId: 'updateImportSettings' })
  @adminPermission('settings.imports.manage', { recentMfa: true })
  updateSettings(
    @Req() r: Request,
    @Body() b: unknown,
    @Headers('idempotency-key') k?: string,
  ): Promise<unknown> {
    return this.mutate(r, 'settings', null, b, k);
  }

  private principal(r: Request): ClerkPrincipal {
    if (!r.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    return r.clerkPrincipal;
  }
  private input(r: Request, body: unknown, key?: string) {
    try {
      hashIdempotencyKey(key ?? '');
    } catch {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    }
    return {
      principal: this.principal(r),
      body,
      idempotencyKey: key as string,
      requestId: r.requestId ?? 'missing-request-id',
    };
  }
  private read(r: Request, resource: string, id: string | null, query: unknown): Promise<unknown> {
    return this.tracking.adminRead(this.principal(r), resource, id, query);
  }
  private mutate(
    r: Request,
    resource: string,
    id: string | null,
    body: unknown,
    key?: string,
  ): Promise<unknown> {
    return this.tracking.adminMutate(resource, id, this.input(r, body, key));
  }
  private create(r: Request, resource: string, body: unknown, key?: string): Promise<unknown> {
    const value = this.createBody(body);
    return this.mutate(
      r,
      resource,
      null,
      { action: 'create', reason: value.reason, expectedVersion: 1, patch: value.value },
      key,
    );
  }
  private createBody(body: unknown): { reason: string; value: Record<string, unknown> } {
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    const input = body as { reason?: unknown; value?: unknown };
    if (
      typeof input.reason !== 'string' ||
      !input.value ||
      typeof input.value !== 'object' ||
      Array.isArray(input.value) ||
      Object.keys(body).some((key) => !['reason', 'value'].includes(key))
    )
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    return { reason: input.reason, value: input.value as Record<string, unknown> };
  }
}
