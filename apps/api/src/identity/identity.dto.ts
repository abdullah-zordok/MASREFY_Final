import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export type Locale = 'ar' | 'en';
export type Theme = 'light' | 'dark' | 'system';
export type Calendar = 'gregorian' | 'hijri';
export type PrivacySettings = Partial<{
  hideBalances: boolean;
  reducedMotion: boolean;
  trackingPersonalization: boolean;
  assistantPersonalization: boolean;
  analyticsEnabled: boolean;
}>;

export const ONBOARDING_STEPS = [
  'welcome',
  'tracking_intro',
  'permission_education',
  'permission_request',
  'keywords',
  'preference',
  'demo',
  'platform_explanation',
  'capture_options',
  'optional_automation',
  'manual_voice_demo',
  'complete',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type DevicePlatform = 'ios' | 'android' | 'web';
export type DevicePushProvider = 'expo' | 'apns' | 'fcm';

@ApiSchema({ name: 'ProfileUpdate' })
export class ProfileUpdateDto {
  @ApiPropertyOptional({ nullable: true, minLength: 1, maxLength: 100 })
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string | null;

  @ApiPropertyOptional({ enum: ['ar', 'en'] })
  @IsOptional()
  @IsIn(['ar', 'en'])
  locale?: Locale;

  @ApiPropertyOptional({ minLength: 1, maxLength: 64 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @IsTimeZone()
  timezone?: string;

  @ApiProperty({ minimum: 1, type: Number })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

@ApiSchema({ name: 'PrivacySettings' })
export class PrivacySettingsDto implements PrivacySettings {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideBalances?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trackingPersonalization?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  assistantPersonalization?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  analyticsEnabled?: boolean;
}

@ApiSchema({ name: 'PreferencesReplace' })
export class PreferencesReplaceDto {
  @ApiProperty({ pattern: '^[A-Z]{3}$' })
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency!: string;

  @ApiProperty({ enum: ['ar', 'en'] })
  @IsIn(['ar', 'en'])
  language!: Locale;

  @ApiProperty({ enum: ['light', 'dark', 'system'] })
  @IsIn(['light', 'dark', 'system'])
  theme!: Theme;

  @ApiProperty({ enum: ['gregorian', 'hijri'] })
  @IsIn(['gregorian', 'hijri'])
  calendar!: Calendar;

  @ApiProperty({ minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @IsIn([0, 1, 2, 3, 4, 5, 6])
  weekStart!: number;

  @ApiProperty({ type: PrivacySettingsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PrivacySettingsDto)
  privacySettings!: PrivacySettingsDto;

  @ApiProperty({ minimum: 1, type: Number })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

@ApiSchema({ name: 'Profile' })
export class ProfileDto {
  @ApiProperty({ minLength: 1, maxLength: 128 }) id!: string;
  @ApiProperty({ nullable: true, minLength: 1, maxLength: 100 }) displayName!: string | null;
  @ApiProperty({ nullable: true }) primaryEmailMasked!: string | null;
  @ApiProperty({ nullable: true }) phoneMasked!: string | null;
  @ApiProperty({ enum: ['ar', 'en'] }) locale!: Locale;
  @ApiProperty({ minLength: 1, maxLength: 64 }) timezone!: string;
  @ApiProperty({ enum: ['active'] }) status!: 'active';
  @ApiProperty({ minimum: 1, type: Number }) version!: number;
}

@ApiSchema({ name: 'Preferences' })
export class PreferencesDto {
  @ApiProperty({ pattern: '^[A-Z]{3}$' }) defaultCurrency!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) language!: Locale;
  @ApiProperty({ enum: ['light', 'dark', 'system'] }) theme!: Theme;
  @ApiProperty({ enum: ['gregorian', 'hijri'] }) calendar!: Calendar;
  @ApiProperty({ minimum: 0, maximum: 6 }) weekStart!: number;
  @ApiProperty({ type: PrivacySettingsDto }) privacySettings!: PrivacySettings;
  @ApiProperty({ minimum: 1, type: Number }) version!: number;
}

@ApiSchema({ name: 'OnboardingReplace' })
export class OnboardingReplaceDto {
  @ApiProperty({ enum: ONBOARDING_STEPS })
  @IsIn(ONBOARDING_STEPS)
  step!: OnboardingStep;

  @ApiProperty({ enum: ONBOARDING_STEPS, isArray: true, maxItems: 12 })
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsIn(ONBOARDING_STEPS, { each: true })
  completedSteps!: OnboardingStep[];

  @ApiProperty()
  @IsBoolean()
  complete!: boolean;

  @ApiProperty({ minimum: 1, type: Number })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

@ApiSchema({ name: 'OnboardingProgress' })
export class OnboardingProgressDto {
  @ApiProperty({ enum: ONBOARDING_STEPS }) step!: OnboardingStep;
  @ApiProperty({ enum: ONBOARDING_STEPS, isArray: true, maxItems: 12 }) completedSteps!: OnboardingStep[];
  @ApiProperty({ nullable: true, format: 'date-time' }) completedAt!: string | null;
  @ApiProperty({ minimum: 1, type: Number }) version!: number;
}

@ApiSchema({ name: 'DeviceRegistration' })
export class DeviceRegistrationDto {
  @ApiProperty({ minLength: 16, maxLength: 512 })
  @Transform(trim)
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  deviceFingerprint!: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  platform!: DevicePlatform;

  @ApiProperty({ minLength: 1, maxLength: 32, pattern: '^[A-Za-z0-9._+-]+$' })
  @Transform(trim)
  @Matches(/^[A-Za-z0-9._+-]{1,32}$/)
  appVersion!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  deviceName?: string;

  @ApiPropertyOptional({ minLength: 16, maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(4096)
  pushToken?: string;

  @ApiPropertyOptional({ enum: ['expo', 'apns', 'fcm'] })
  @IsOptional()
  @IsIn(['expo', 'apns', 'fcm'])
  pushProvider?: DevicePushProvider;
}

export class DeviceListQueryDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 512, pattern: '^[A-Za-z0-9_-]+$' })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,512}$/)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

@ApiSchema({ name: 'Device' })
export class DeviceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['ios', 'android', 'web'] }) platform!: DevicePlatform;
  @ApiProperty({ minLength: 1, maxLength: 32 }) appVersion!: string;
  @ApiProperty({ nullable: true, minLength: 1, maxLength: 80 }) deviceName!: string | null;
  @ApiProperty() trusted!: boolean;
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;
  @ApiProperty() current!: boolean;
  @ApiProperty({ nullable: true, format: 'date-time' }) revokedAt!: string | null;
  @ApiProperty({ minimum: 1, type: Number }) version!: number;
}

@ApiSchema({ name: 'DevicePage' })
export class DevicePageDto {
  @ApiProperty({ type: [DeviceDto], maxItems: 100 }) items!: DeviceDto[];
  @ApiProperty({ nullable: true, minLength: 1, maxLength: 512 }) nextCursor!: string | null;
}

@ApiSchema({ name: 'DeviceRegistrationResult' })
export class DeviceRegistrationResultDto {
  @ApiProperty({ format: 'uuid' }) deviceId!: string;
  @ApiProperty({ format: 'date-time' }) registeredAt!: string;
  @ApiProperty({ minimum: 1, type: Number }) version!: number;
}

export function assertProfileUpdateFields(dto: ProfileUpdateDto): void {
  if (dto.displayName === undefined && dto.locale === undefined && dto.timezone === undefined) {
    throw new BadRequestException('PROFILE_UPDATE_EMPTY');
  }
}

export function assertIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new BadRequestException('IDEMPOTENCY_KEY_INVALID');
  }
  return value;
}

export function normalizeOnboarding(dto: OnboardingReplaceDto): OnboardingReplaceDto {
  const completed = new Set(dto.completedSteps);
  if (
    completed.size !== dto.completedSteps.length ||
    dto.complete !== (dto.step === 'complete') ||
    dto.complete !== completed.has('complete') ||
    (!dto.complete && completed.has(dto.step))
  ) {
    throw new BadRequestException('ONBOARDING_STATE_INVALID');
  }
  return {
    step: dto.step,
    completedSteps: ONBOARDING_STEPS.filter((step) => completed.has(step)),
    complete: dto.complete,
    expectedVersion: dto.expectedVersion,
  };
}

export function assertPushPair(dto: DeviceRegistrationDto): void {
  if ((dto.pushToken === undefined) !== (dto.pushProvider === undefined)) {
    throw new BadRequestException('PUSH_PAIR_INVALID');
  }
}

export function decodeDeviceCursor(value: string | undefined): { lastSeenAt: Date; id: string } | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) throw new Error();
    const keys = Object.keys(decoded).sort();
    const record = decoded as Record<string, unknown>;
    const lastSeenAt = record.lastSeenAt;
    const id = record.id;
    const date = typeof lastSeenAt === 'string' ? new Date(lastSeenAt) : new Date(Number.NaN);
    if (
      keys.join(',') !== 'id,lastSeenAt' ||
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString() !== lastSeenAt
    ) {
      throw new Error();
    }
    return { lastSeenAt: date, id };
  } catch {
    throw new BadRequestException({ code: 'INVALID_CURSOR' });
  }
}

export function encodeDeviceCursor(lastSeenAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ lastSeenAt: lastSeenAt.toISOString(), id })).toString('base64url');
}
