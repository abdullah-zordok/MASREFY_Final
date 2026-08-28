import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { SafeErrorDto } from '../platform/http/platform-contract.dto';
import { ClerkAuthGuard, type ClerkPrincipalRequest } from './clerk-auth.guard';
import {
  PreferencesDto,
  PreferencesReplaceDto,
  OnboardingProgressDto,
  OnboardingReplaceDto,
  DeviceListQueryDto,
  DevicePageDto,
  DeviceRegistrationDto,
  DeviceRegistrationResultDto,
  ProfileDto,
  ProfileUpdateDto,
} from './identity.dto';
import { IdentityService } from './identity.service';

const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
};

function principal(request: ClerkPrincipalRequest) {
  if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
  return request.clerkPrincipal;
}

@ApiTags('Identity')
@ApiBearerAuth('ClerkBearer')
@UseGuards(ClerkAuthGuard)
@Controller('api/v1/me')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @ApiOperation({ operationId: 'getMyProfile' })
  @ApiOkResponse({ type: ProfileDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  getProfile(@Req() request: ClerkPrincipalRequest): Promise<ProfileDto> {
    return this.identity.getProfile(principal(request));
  }

  @Patch()
  @ApiOperation({ operationId: 'updateMyProfile' })
  @ApiHeader(idempotencyHeader)
  @ApiOkResponse({ type: ProfileDto })
  @ApiResponse({ status: 400, type: SafeErrorDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 409, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  updateProfile(
    @Req() request: ClerkPrincipalRequest,
    @Body() input: ProfileUpdateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<ProfileDto> {
    return this.identity.updateProfile(principal(request), input, idempotencyKey);
  }

  @Get('preferences')
  @ApiOperation({ operationId: 'getMyPreferences' })
  @ApiOkResponse({ type: PreferencesDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  getPreferences(@Req() request: ClerkPrincipalRequest): Promise<PreferencesDto> {
    return this.identity.getPreferences(principal(request));
  }

  @Put('preferences')
  @ApiOperation({ operationId: 'replaceMyPreferences' })
  @ApiHeader(idempotencyHeader)
  @ApiOkResponse({ type: PreferencesDto })
  @ApiResponse({ status: 400, type: SafeErrorDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 409, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  replacePreferences(
    @Req() request: ClerkPrincipalRequest,
    @Body() input: PreferencesReplaceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<PreferencesDto> {
    return this.identity.replacePreferences(principal(request), input, idempotencyKey);
  }

  @Get('onboarding')
  @ApiOperation({ operationId: 'getMyOnboardingProgress' })
  @ApiOkResponse({ type: OnboardingProgressDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  getOnboarding(@Req() request: ClerkPrincipalRequest): Promise<OnboardingProgressDto> {
    return this.identity.getOnboarding(principal(request));
  }

  @Put('onboarding')
  @ApiOperation({ operationId: 'replaceMyOnboardingProgress' })
  @ApiHeader(idempotencyHeader)
  @ApiOkResponse({ type: OnboardingProgressDto })
  @ApiResponse({ status: 400, type: SafeErrorDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 409, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  replaceOnboarding(
    @Req() request: ClerkPrincipalRequest,
    @Body() input: OnboardingReplaceDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<OnboardingProgressDto> {
    return this.identity.replaceOnboarding(principal(request), input, idempotencyKey);
  }

  @Get('devices')
  @ApiOperation({ operationId: 'listMyDevices' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: DevicePageDto })
  @ApiResponse({ status: 400, type: SafeErrorDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  listDevices(
    @Req() request: ClerkPrincipalRequest,
    @Query() query: DeviceListQueryDto,
  ): Promise<DevicePageDto> {
    return this.identity.listDevices(principal(request), query);
  }

  @Post('devices/register')
  @ApiOperation({ operationId: 'registerMyDevice' })
  @ApiHeader(idempotencyHeader)
  @ApiResponse({ status: 200, type: DeviceRegistrationResultDto })
  @ApiResponse({ status: 201, type: DeviceRegistrationResultDto })
  @ApiResponse({ status: 400, type: SafeErrorDto })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 409, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  async registerDevice(
    @Req() request: ClerkPrincipalRequest,
    @Body() input: DeviceRegistrationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeviceRegistrationResultDto> {
    const result = await this.identity.registerDevice(principal(request), input, idempotencyKey);
    response.status(result.created ? 201 : 200);
    return result.body;
  }

  @Delete('devices/:deviceId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'revokeMyDevice' })
  @ApiHeader(idempotencyHeader)
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, type: SafeErrorDto })
  @ApiResponse({ status: 403, type: SafeErrorDto })
  @ApiResponse({ status: 404, type: SafeErrorDto })
  @ApiResponse({ status: 503, type: SafeErrorDto })
  async revokeDevice(
    @Req() request: ClerkPrincipalRequest,
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<void> {
    await this.identity.revokeDevice(principal(request), deviceId, idempotencyKey);
  }
}
