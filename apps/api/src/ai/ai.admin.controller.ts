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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import { AiService } from './ai.service';
import { AiNoStoreInterceptor } from './ai-no-store.interceptor';

type Request = AdminPrincipalRequest & { requestId?: string };
function principal(request: Request): ClerkPrincipal {
  if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
  return request.clerkPrincipal;
}
function requestId(request: Request): string {
  return request.requestId ?? 'missing-request-id';
}

@Controller('api/v1/admin/ai')
@ApiBearerAuth('ClerkBearer')
@UseInterceptors(AiNoStoreInterceptor)
export class AiAdminController {
  constructor(private readonly ai: AiService) {}

  @Get('probe')
  @ApiOperation({ operationId: 'probeAiAdministration' })
  @adminPermission('ai.overview.read')
  @UseGuards(AdminAuthGuard)
  probe() {
    return this.ai.adminProbe();
  }

  @Get('overview')
  @ApiOperation({ operationId: 'getAiOverview' })
  @adminPermission('ai.overview.read')
  @UseGuards(AdminAuthGuard)
  async overview(@Req() request: Request) {
    return (await this.ai.adminList(principal(request), 'overview', {})).items[0];
  }

  @Get('providers')
  @ApiOperation({ operationId: 'listAiProviders' })
  @adminPermission('ai.providers.read')
  @UseGuards(AdminAuthGuard)
  providers(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'providers', query);
  }
  @Get('providers/:providerId')
  @ApiOperation({ operationId: 'getAiProvider' })
  @adminPermission('ai.providers.read')
  @UseGuards(AdminAuthGuard)
  provider(@Req() request: Request, @Param('providerId') id: string) {
    return this.ai.adminGet(principal(request), 'providers', id);
  }
  @Patch('providers/:providerId')
  @ApiOperation({ operationId: 'updateAiProvider' })
  @adminPermission('ai.providers.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  updateProvider(
    @Req() request: Request,
    @Param('providerId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(principal(request), 'providers', id, body, key, requestId(request));
  }
  @Post('providers/:providerId/actions')
  @HttpCode(200)
  @ApiOperation({ operationId: 'actOnAiProvider' })
  @adminPermission('ai.providers.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  actProvider(
    @Req() request: Request,
    @Param('providerId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(principal(request), 'providers', id, body, key, requestId(request));
  }

  @Get('models')
  @ApiOperation({ operationId: 'listAiModels' })
  @adminPermission('ai.models.read')
  @UseGuards(AdminAuthGuard)
  models(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'models', query);
  }
  @Patch('models/:modelId')
  @ApiOperation({ operationId: 'updateAiModel' })
  @adminPermission('ai.models.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  updateModel(
    @Req() request: Request,
    @Param('modelId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(principal(request), 'models', id, body, key, requestId(request));
  }
  @Post('models/:modelId/actions')
  @HttpCode(200)
  @ApiOperation({ operationId: 'actOnAiModel' })
  @adminPermission('ai.models.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  actModel(
    @Req() request: Request,
    @Param('modelId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(principal(request), 'models', id, body, key, requestId(request));
  }

  @Get('routes')
  @ApiOperation({ operationId: 'listAiRoutes' })
  @adminPermission('ai.routes.read')
  @UseGuards(AdminAuthGuard)
  routes(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'routes', query);
  }
  @Patch('routes/:routeId')
  @ApiOperation({ operationId: 'updateAiRoute' })
  @adminPermission('ai.routes.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  updateRoute(
    @Req() request: Request,
    @Param('routeId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(principal(request), 'routes', id, body, key, requestId(request));
  }

  @Get('prompts')
  @ApiOperation({ operationId: 'listAiPrompts' })
  @adminPermission('ai.prompts.read')
  @UseGuards(AdminAuthGuard)
  prompts(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'prompts', query);
  }
  @Post('prompts')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createAiPromptVersion' })
  @adminPermission('ai.prompts.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  createPrompt(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(principal(request), 'prompts', null, body, key, requestId(request));
  }
  @Get('prompts/:promptVersionId')
  @ApiOperation({ operationId: 'getAiPromptVersion' })
  @adminPermission('ai.prompts.read')
  @UseGuards(AdminAuthGuard)
  prompt(@Req() request: Request, @Param('promptVersionId') id: string) {
    return this.ai.adminGet(principal(request), 'prompts', id);
  }
  @Post('prompts/:promptVersionId/test')
  @HttpCode(202)
  @ApiOperation({ operationId: 'testAiPromptVersion' })
  @adminPermission('ai.prompts.publish', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  testPrompt(
    @Req() request: Request,
    @Param('promptVersionId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.testPrompt(principal(request), id, body, key, requestId(request));
  }
  @Post('prompts/:promptVersionId/publish')
  @HttpCode(200)
  @ApiOperation({ operationId: 'publishAiPromptVersion' })
  @adminPermission('ai.prompts.publish', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  publishPrompt(
    @Req() request: Request,
    @Param('promptVersionId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.publishPrompt(principal(request), id, body, key, requestId(request));
  }

  @Get('usage')
  @ApiOperation({ operationId: 'listAiUsage' })
  @adminPermission('ai.usage.read')
  @UseGuards(AdminAuthGuard)
  usage(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'usage', query);
  }
  @Get('failures')
  @ApiOperation({ operationId: 'listAiFailures' })
  @adminPermission('ai.failures.manage')
  @UseGuards(AdminAuthGuard)
  failures(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'failures', query);
  }
  @Get('response-reports')
  @ApiOperation({ operationId: 'listAiResponseReports' })
  @adminPermission('ai.reports.read')
  @UseGuards(AdminAuthGuard)
  reports(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'response-reports', query);
  }
  @Patch('response-reports/:reportId')
  @ApiOperation({ operationId: 'reviewAiResponseReport' })
  @adminPermission('ai.reports.manage')
  @UseGuards(AdminAuthGuard)
  reviewReport(
    @Req() request: Request,
    @Param('reportId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(
      principal(request),
      'response-reports',
      id,
      body,
      key,
      requestId(request),
    );
  }

  @Get('safety-rules')
  @ApiOperation({ operationId: 'listAiSafetyRules' })
  @adminPermission('ai.safety.read')
  @UseGuards(AdminAuthGuard)
  safety(@Req() request: Request, @Query() query: unknown) {
    return this.ai.adminList(principal(request), 'safety-rules', query);
  }
  @Post('safety-rules')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createAiSafetyRule' })
  @adminPermission('ai.safety.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  createSafety(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(
      principal(request),
      'safety-rules',
      null,
      body,
      key,
      requestId(request),
    );
  }
  @Patch('safety-rules/:ruleId')
  @ApiOperation({ operationId: 'updateAiSafetyRule' })
  @adminPermission('ai.safety.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  updateSafety(
    @Req() request: Request,
    @Param('ruleId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.adminMutate(
      principal(request),
      'safety-rules',
      id,
      body,
      key,
      requestId(request),
    );
  }

  @Post(':resource/:resourceId/actions')
  @HttpCode(200)
  @ApiOperation({ operationId: 'actOnAiOperationalResource' })
  @adminPermission('ai.operations.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  operationalAction(
    @Req() request: Request,
    @Param('resource') resource: string,
    @Param('resourceId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!['prompts', 'failures', 'response-reports', 'safety-rules'].includes(resource))
      throw new HttpException({ code: 'NOT_FOUND' }, 404);
    return this.ai.adminMutate(principal(request), resource, id, body, key, requestId(request));
  }
}
