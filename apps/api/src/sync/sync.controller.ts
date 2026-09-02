import {
  Body,
  Controller,
  Get,
  Header,
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

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import { normalizeDeviceId } from './sync.dto';
import { SyncService } from './sync.service';

@Controller('api/v1')
@ApiBearerAuth('ClerkBearer')
@UseGuards(ClerkAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('sync/bootstrap')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'bootstrapSync' })
  bootstrap(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Query() query: unknown,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.bootstrap(
      request.clerkPrincipal,
      normalizedDevice,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('sync/delta')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'getSyncDelta' })
  delta(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Query() query: unknown,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.delta(
      request.clerkPrincipal,
      normalizedDevice,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('sync/ack')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @ApiOperation({ operationId: 'acknowledgeSync' })
  acknowledge(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Body() body: unknown,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.acknowledge(
      request.clerkPrincipal,
      normalizedDevice,
      body,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('conflicts')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'listSyncConflicts' })
  listConflicts(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Query() query: unknown,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.listConflicts(
      request.clerkPrincipal,
      normalizedDevice,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('conflicts/:conflictId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'getSyncConflict' })
  getConflict(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('conflictId') conflictId: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.getConflict(
      request.clerkPrincipal,
      normalizedDevice,
      conflictId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Patch('conflicts/:conflictId')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @ApiOperation({ operationId: 'resolveSyncConflict' })
  resolveConflict(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('conflictId') conflictId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.resolveConflict(
      request.clerkPrincipal,
      normalizedDevice,
      conflictId,
      idempotencyKey ?? '',
      body,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('sync/mutations')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @ApiOperation({ operationId: 'submitSyncMutations' })
  submitMutations(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Headers('x-device-id') deviceId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    let normalizedDevice: string;
    try {
      normalizedDevice = normalizeDeviceId(deviceId);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
    return this.sync.submitMutations(
      request.clerkPrincipal,
      normalizedDevice,
      idempotencyKey ?? '',
      body,
      request.requestId ?? 'missing-request-id',
    );
  }
}
