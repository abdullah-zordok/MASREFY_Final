import { isFixtureModeEnabled } from '@/config/demo-mode';
import type { FinancialPlanningService } from './contracts/financial-planning-service';
import type { CapabilityProviderHandle } from './contracts/capability-contract';
import { createLiveFinancialPlanningService } from './live/financial-planning-service';
import {
  financialPlanningService as fixtureFinancialPlanningService,
  createSeededFinancialPlanningService
} from './mocks/financial-planning-service';

export const financialPlanningService: CapabilityProviderHandle<FinancialPlanningService> =
  isFixtureModeEnabled()
    ? fixtureFinancialPlanningService
    : createLiveFinancialPlanningService();

export {
  createLiveFinancialPlanningService,
  createSeededFinancialPlanningService
};
