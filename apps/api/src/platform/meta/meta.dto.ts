import { ApiProperty, ApiPropertyOptional, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'PlatformCapabilities' })
export class PlatformCapabilitiesDto {
  @ApiProperty({ enum: [true] }) coreFinanceAvailable!: true;
  @ApiProperty({ enum: [false] }) billingAvailable!: false;
  @ApiProperty({ enum: [false] }) paidEntitlement!: false;
  @ApiProperty({ enum: [false] }) checkoutAvailable!: false;
  @ApiProperty({ enum: [false] }) subscriptionManagementAvailable!: false;
  @ApiProperty({ enum: [false] }) promotionsAvailable!: false;
  @ApiProperty() aiAvailable!: boolean;
  @ApiProperty({ enum: [5] }) aiAllowancePerRolling24Hours!: 5;
}

@ApiSchema({ name: 'SafeMaintenance' })
export class SafeMaintenanceDto {
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: [String], maxItems: 10 }) scopes!: string[];
  @ApiProperty({ nullable: true, type: Object })
  message!: { ar: string; en: string } | null;
}

@ApiSchema({ name: 'PlatformMetadata' })
export class MetaResponseDto {
  @ApiProperty({ enum: ['v1'] })
  apiVersion!: 'v1';

  @ApiProperty({ format: 'date-time' })
  serverTime!: string;

  @ApiProperty({ nullable: true, maxLength: 32 })
  minMobileVersion!: string | null;

  @ApiProperty({ nullable: true, maxLength: 32 })
  minAdminVersion!: string | null;

  @ApiProperty({ type: PlatformCapabilitiesDto })
  capabilities!: PlatformCapabilitiesDto;

  @ApiProperty({ type: SafeMaintenanceDto })
  maintenance!: SafeMaintenanceDto;

  @ApiProperty({ type: Object, additionalProperties: { type: 'boolean' } })
  featureFlags!: Record<string, boolean>;

  @ApiPropertyOptional({ minimum: 1 })
  configurationVersion!: number;
}
