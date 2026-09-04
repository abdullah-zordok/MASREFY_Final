import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import type { ClerkPrincipal } from '../identity/clerk-auth.guard';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import { ReportsService } from './reports.service';

type AdminRequest = AdminPrincipalRequest & { requestId?: string };
function principal(request: AdminPrincipalRequest): ClerkPrincipal {
  if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
  return request.clerkPrincipal;
}

@Controller('api/v1/admin')
@ApiBearerAuth('ClerkBearer')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @ApiOperation({ operationId: 'getAdminOverview' })
  @adminPermission('admin.overview.read')
  @UseGuards(AdminAuthGuard)
  overview(
    @Req() request: AdminPrincipalRequest,
    @Query() query: unknown,
  ): Promise<Record<string, unknown>> {
    return this.reports.getAdminOverview(principal(request), query);
  }

  @Get('overview/platform-analytics')
  @ApiOperation({ operationId: 'getAdminPlatformAnalytics' })
  @adminPermission('admin.overview.read')
  @UseGuards(AdminAuthGuard)
  platform(
    @Req() request: AdminPrincipalRequest,
    @Query() query: unknown,
  ): Promise<Record<string, unknown>> {
    return this.reports.getAdminPlatformAnalytics(principal(request), query);
  }

  @Get('overview/activity')
  @ApiOperation({ operationId: 'getAdminOverviewActivity' })
  @adminPermission('admin.overview.read')
  @UseGuards(AdminAuthGuard)
  activity(
    @Req() request: AdminPrincipalRequest,
    @Query() query: unknown,
  ): Promise<Record<string, unknown>> {
    return this.reports.getAdminOverviewActivity(principal(request), query);
  }

  @Post('exports')
  @HttpCode(202)
  @ApiOperation({ operationId: 'createAdminExport' })
  @adminPermission('privacy.exports.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  createExport(
    @Req() request: AdminRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, unknown>> {
    response.setHeader('Cache-Control', 'private, no-store');
    return this.reports.createAdminExport(
      principal(request),
      body,
      idempotencyKey ?? '',
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('exports/:attemptId')
  @ApiOperation({ operationId: 'getAdminExport' })
  @adminPermission('privacy.exports.manage', { recentMfa: true })
  @UseGuards(AdminAuthGuard)
  getExport(
    @Req() request: AdminRequest,
    @Param('attemptId') attemptId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    response.setHeader('Cache-Control', 'private, no-store');
    return this.reports.getAdminExport(
      principal(request),
      attemptId,
      request.requestId ?? 'missing-request-id',
    );
  }
}
