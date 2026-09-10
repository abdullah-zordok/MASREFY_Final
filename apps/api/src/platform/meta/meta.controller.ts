import { Controller, Get, Headers, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { SafeErrorDto } from '../http/platform-contract.dto';
import { derivePercentageCohort } from '../../operations/feature-evaluator';
import { MetaAuthGuard, type MetaRequest } from './meta-auth.guard';
import { MetaResponseDto } from './meta.dto';
import { MetaService } from './meta.service';

@ApiTags('Platform')
@Controller('api/v1/meta')
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get()
  @UseGuards(MetaAuthGuard)
  @ApiBearerAuth('ClerkBearer')
  @ApiOperation({ operationId: 'getPlatformMetadata' })
  @ApiOkResponse({ type: MetaResponseDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 429, type: SafeErrorDto })
  @ApiResponse({ status: 500, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  async get(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Headers('x-masarifi-platform') platform: string | undefined,
    @Headers('x-masarifi-app-version') appVersion: string | undefined,
    @Headers('x-masarifi-locale') locale: string | undefined,
    @Req() request: MetaRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MetaResponseDto | undefined> {
    const context = {
      ...(platform && ['ios', 'android', 'admin'].includes(platform)
        ? { platform: platform as 'ios' | 'android' | 'admin' }
        : {}),
      ...(appVersion && /^\d+(?:\.\d+){0,2}$/u.test(appVersion) ? { appVersion } : {}),
      ...(locale && ['ar', 'en'].includes(locale) ? { locale: locale as 'ar' | 'en' } : {}),
      ...(request.metaSubject
        ? { cohort: derivePercentageCohort(request.metaSubject) }
        : {}),
    };
    const value = await this.meta.get(context);
    const etag = await this.meta.etag(context);
    response.setHeader('Cache-Control', 'private, max-age=30');
    response.setHeader('ETag', etag);
    if (ifNoneMatch === etag) {
      response.status(304);
      return undefined;
    }
    return value;
  }
}
