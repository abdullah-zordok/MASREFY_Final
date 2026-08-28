import { HttpException, Injectable, Optional } from '@nestjs/common';

import { PlatformConfigService } from '../platform/config/platform-config.service';
import type { ClerkPrincipal } from './clerk-auth.guard';
import { ClerkClientService } from './clerk-client.service';
import {
  assertIdempotencyKey,
  assertProfileUpdateFields,
  assertPushPair,
  decodeDeviceCursor,
  encodeDeviceCursor,
  type DeviceDto,
  type DeviceListQueryDto,
  type DevicePageDto,
  type DeviceRegistrationDto,
  type DeviceRegistrationResultDto,
  normalizeOnboarding,
  type OnboardingProgressDto,
  type OnboardingReplaceDto,
  type PreferencesDto,
  type PreferencesReplaceDto,
  type ProfileDto,
  type ProfileUpdateDto,
} from './identity.dto';
import { IdentityRepository, type DeviceRecord, type ProfileRecord } from './identity.repository';

function domainError(code: string, status: number): HttpException {
  return new HttpException({ code }, status);
}

function providerFailure(error: unknown): never {
  if (error instanceof HttpException) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('AUTH_TOKEN_INVALID')) throw domainError('AUTH_TOKEN_INVALID', 401);
  if (message.includes('PROFILE_INACTIVE')) throw domainError('PROFILE_INACTIVE', 403);
  if (message.includes('RECENT_AUTH_REQUIRED')) throw domainError('RECENT_AUTH_REQUIRED', 403);
  if (message.includes('DEVICE_NOT_FOUND')) throw domainError('DEVICE_NOT_FOUND', 404);
  if (message.includes('PUSH_TOKEN_CONFLICT')) throw domainError('PUSH_TOKEN_CONFLICT', 409);
  if (message.includes('CLERK_PROVIDER_UNAVAILABLE')) {
    throw domainError('PROVIDER_UNAVAILABLE', 503);
  }
  throw domainError('PROFILE_SYNC_UNAVAILABLE', 503);
}

export function maskEmail(value: string | null): string | null {
  if (value === null) return null;
  const at = value.indexOf('@');
  return at > 0 ? `${value.charAt(0)}***${value.slice(at)}` : '***';
}

export function maskPhone(value: string | null): string | null {
  return value === null ? null : `+***${value.slice(-2)}`;
}

function projectProfile(row: ProfileRecord): ProfileDto {
  return {
    id: row.id,
    displayName: row.displayName,
    primaryEmailMasked: maskEmail(row.primaryEmail),
    phoneMasked: maskPhone(row.phoneE164),
    locale: row.locale,
    timezone: row.timezone,
    status: row.status,
    version: row.version,
  };
}

function projectDevice(row: DeviceRecord, sessionId: string): DeviceDto {
  return {
    id: row.id,
    platform: row.platform,
    appVersion: row.appVersion,
    deviceName: row.deviceName,
    trusted: row.trustedAt !== null && row.revokedAt === null,
    lastSeenAt: row.lastSeenAt.toISOString(),
    current: row.clerkSessionId === sessionId,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    version: row.version,
  };
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly repository: IdentityRepository,
    @Optional() private readonly clerk?: ClerkClientService,
    @Optional() private readonly config?: PlatformConfigService,
  ) {}

  async getProfile(principal: ClerkPrincipal): Promise<ProfileDto> {
    try {
      const row = await this.repository.getProfile(principal);
      if (!row) throw domainError('PROFILE_SYNC_UNAVAILABLE', 503);
      return projectProfile(row);
    } catch (error) {
      return providerFailure(error);
    }
  }

  async updateProfile(
    principal: ClerkPrincipal,
    input: ProfileUpdateDto,
    idempotencyKey: string | undefined,
  ): Promise<ProfileDto> {
    assertIdempotencyKey(idempotencyKey);
    assertProfileUpdateFields(input);
    try {
      const row = await this.repository.updateProfile(principal, input);
      if (!row) throw domainError('VERSION_CONFLICT', 409);
      return projectProfile(row);
    } catch (error) {
      return providerFailure(error);
    }
  }

  async getPreferences(principal: ClerkPrincipal): Promise<PreferencesDto> {
    try {
      return await this.repository.getPreferences(principal);
    } catch (error) {
      return providerFailure(error);
    }
  }

  async replacePreferences(
    principal: ClerkPrincipal,
    input: PreferencesReplaceDto,
    idempotencyKey: string | undefined,
  ): Promise<PreferencesDto> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const row = await this.repository.replacePreferences(principal, input);
      if (!row) throw domainError('VERSION_CONFLICT', 409);
      return row;
    } catch (error) {
      return providerFailure(error);
    }
  }

  async getOnboarding(principal: ClerkPrincipal): Promise<OnboardingProgressDto> {
    try {
      const row = await this.repository.getOnboarding(principal);
      return {
        ...row,
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    } catch (error) {
      return providerFailure(error);
    }
  }

  async replaceOnboarding(
    principal: ClerkPrincipal,
    input: OnboardingReplaceDto,
    idempotencyKey: string | undefined,
  ): Promise<OnboardingProgressDto> {
    assertIdempotencyKey(idempotencyKey);
    const normalized = normalizeOnboarding(input);
    try {
      const row = await this.repository.replaceOnboarding(principal, normalized);
      if (!row) throw domainError('VERSION_CONFLICT', 409);
      return {
        ...row,
        completedAt: row.completedAt?.toISOString() ?? null,
      };
    } catch (error) {
      return providerFailure(error);
    }
  }

  async listDevices(
    principal: ClerkPrincipal,
    query: DeviceListQueryDto,
  ): Promise<DevicePageDto> {
    const cursor = decodeDeviceCursor(query.cursor);
    try {
      const rows = await this.repository.listDevices(principal, cursor, query.limit);
      const hasMore = rows.length > query.limit;
      const page = rows.slice(0, query.limit);
      const last = hasMore ? page.at(-1) : undefined;
      return {
        items: page.map((row) => projectDevice(row, principal.sessionId)),
        nextCursor: last ? encodeDeviceCursor(last.lastSeenAt, last.id) : null,
      };
    } catch (error) {
      return providerFailure(error);
    }
  }

  async registerDevice(
    principal: ClerkPrincipal,
    input: DeviceRegistrationDto,
    idempotencyKey: string | undefined,
  ): Promise<{ body: DeviceRegistrationResultDto; created: boolean }> {
    assertIdempotencyKey(idempotencyKey);
    assertPushPair(input);
    try {
      const result = await this.repository.registerDevice(principal, input);
      return {
        created: result.created,
        body: {
          deviceId: result.device.id,
          registeredAt: result.device.createdAt.toISOString(),
          version: result.device.version,
        },
      };
    } catch (error) {
      return providerFailure(error);
    }
  }

  async revokeDevice(
    principal: ClerkPrincipal,
    deviceId: string,
    idempotencyKey: string | undefined,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const maxAge = this.config?.get('MASARIFI_RECENT_AUTH_MAX_AGE_SECONDS') ?? 600;
    const recentAuth = principal.factorAgeSeconds !== null && principal.factorAgeSeconds <= maxAge;
    try {
      const result = await this.repository.revokeDevice(principal, deviceId, recentAuth);
      if (result.status === 'not_found') throw domainError('DEVICE_NOT_FOUND', 404);
      if (!result.sessionId) return;
      if (!this.clerk) throw domainError('PROVIDER_UNAVAILABLE', 503);
      await this.clerk.revokeSession(result.sessionId);
      await this.repository.completeSessionRevoke(principal, deviceId, result.sessionId);
    } catch (error) {
      return providerFailure(error);
    }
  }
}
