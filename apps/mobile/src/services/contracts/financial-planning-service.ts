import type {
  Budget,
  BudgetProgress,
  BudgetLifecycle,
  CategoryBudget,
  GoalMovement,
  Obligation,
  ObligationLifecycle,
  ObligationPayment,
  ObligationScheduleItem,
  ObligationStatus,
  PaymentAllocation,
  PaymentMatch,
  PlanningConflict,
  PlanningDraft,
  PlanningOverview,
  SalaryCycle,
  SalaryProfile,
  SalaryReceiptLink,
  SavingsGoal,
  SavingsLifecycle,
  SavingsProgress,
  LocalDate,
  PaymentTransaction
} from '@/domain/financial-planning';
import type { PlanningReportingSnapshot, ReportPeriod } from '@/domain/reports';
import type { MutationResult } from './core-finance-service';
import type { CapabilityContractMetadata } from './capability-contract';

export const financialPlanningServiceCapability: CapabilityContractMetadata = {
  capability: 'financial-planning.records',
  majorVersion: 1,
  owner: 'financial-planning',
  providerKinds: ['mock', 'live'],
  unavailableOutcome: 'planning.state.error'
};

export interface SalaryProfileInput {
  expectedAmountMinor: number;
  currencyCode: string;
  salaryDay: number;
  sourceName: string;
  receivingAccountId: string;
  automaticDetectionEnabled?: boolean;
}

export interface SalaryReceiptConfirmation {
  salaryProfileId: string;
  transactionId: string;
  expectedOccurrenceDate: LocalDate;
  receivedDate: LocalDate;
  timeZone?: string;
  replacesReceiptId?: string | null;
}

export interface SalaryReceiptOutcome {
  profile: SalaryProfile;
  receipt: SalaryReceiptLink;
  cycle: SalaryCycle;
}

export interface BudgetInput {
  id?: string;
  expectedVersion?: number;
  name: string;
  periodKey: string;
  currencyCode: string;
  configuredExpenseLimitMinor: number;
  incomeTargetMinor: number;
  savingsTargetMinor: number;
  rolloverEnabled?: boolean;
  rolloverCreditMinor?: number;
  categories?: CategoryBudget[];
  copiedFromBudgetId?: string | null;
}

export interface BudgetDetail {
  budget: Budget;
  categories: CategoryBudget[];
  progress: BudgetProgress;
}

export interface BudgetMoveInput {
  budgetId: string;
  fromCategoryId: string;
  toCategoryId: string;
  amountMinor: number;
}

export interface BudgetMovePreview {
  previewId: string;
  budgetId: string;
  categories: CategoryBudget[];
}

export interface ObligationInput {
  direction: Obligation['direction'];
  type: Obligation['type'];
  scheduleKind: Obligation['scheduleKind'];
  title: string;
  provider?: string | null;
  currencyCode: string;
  contractedTotalMinor?: number | null;
  openingPaidMinor?: number;
  installmentAmountMinor?: number | null;
  installmentCount?: number | null;
  dueDay?: number | null;
  startDate?: LocalDate | null;
  endDate?: LocalDate | null;
  fundingAccountId?: string | null;
  automaticMatchingEnabled?: boolean;
  providerKeywords?: string[];
  reminderTiming?: string | null;
  notes?: string | null;
}

export interface ObligationDetail {
  obligation: Obligation;
  schedule: ObligationScheduleItem[];
  payments: ObligationPayment[];
  paymentHistoryState: 'available' | 'unavailable';
  status: ObligationStatus;
}

export interface ObligationQuery {
  status?: ObligationLifecycle;
}

export interface ObligationPage {
  items: Obligation[];
  nextCursor: string | null;
  total: number;
}

export interface ObligationsOverview {
  payablesByCurrency: Record<string, number | null>;
  receivablesByCurrency: Record<string, number | null>;
  remainingByObligationId: Record<string, number | null>;
  nextDueDate: LocalDate | null;
  items: Obligation[];
}

export interface ObligationPaymentInput {
  obligationId: string;
  amountMinor: number;
  currencyCode: string;
  paidDate: LocalDate;
  source: ObligationPayment['source'];
  transaction: PaymentTransaction;
}

export interface ObligationPaymentPreview {
  previewId: string;
  obligationId: string;
  amountMinor: number;
  allocations: PaymentAllocation[];
  case: ObligationPayment['case'];
  expectedVersion: number;
}

export interface PaymentAllocationChoice {
  allocations: PaymentAllocation[];
  intent: ObligationPayment['allocationIntent'];
}

export interface EarlySettlementPreview {
  previewId: string;
  obligationId: string;
  settlementMinor: number;
  adjustmentMinor: number;
}

export interface ObligationPaymentOutcome {
  obligation: Obligation;
  payment: ObligationPayment;
}

export interface PaymentMatchQuery {
  status?: PaymentMatch['status'];
}

export interface PaymentMatchPage {
  items: PaymentMatch[];
  nextCursor: string | null;
  total: number;
}

export interface PaymentMatchResolution {
  matchId: string;
  obligationId: string | null;
  action: 'confirm' | 'ignore';
}

export interface PaymentMatchOutcome {
  match: PaymentMatch;
}

export interface GoalQuery {
  status?: SavingsLifecycle;
}

export interface SavingsGoalInput {
  title: string;
  targetMinor: number;
  openingTrackedMinor?: number;
  currencyCode: string;
  targetDate: LocalDate;
  linkedAccountId?: string | null;
  iconKey?: string | null;
  emergencyFund?: boolean;
}

export interface SavingsGoalDetail {
  goal: SavingsGoal;
  movements: GoalMovement[];
  progress: SavingsProgress;
}

export interface GoalMovementInput {
  goalId: string;
  kind: GoalMovement['kind'];
  amountMinor: number;
  movementDate: LocalDate;
  linkedTransactionId?: string | null;
}

export interface GoalMovementPreview {
  previewId: string;
  goalId: string;
  kind: GoalMovement['kind'];
  amountMinor: number;
}

export interface GoalMovementOutcome {
  goal: SavingsGoal;
  movement: GoalMovement;
}

export interface FinancialPlanningService {
  getReportingSnapshot(
    period: ReportPeriod
  ): Promise<PlanningReportingSnapshot>;
  getPlanningOverview(input: {
    currencyCode: string;
    today: LocalDate;
    timeZone?: string;
  }): Promise<PlanningOverview>;
  getSalaryOverview(input: {
    today: LocalDate;
    timeZone?: string;
  }): Promise<SalaryCycle>;
  getSalaryReceiptReview(
    transactionId: string
  ): Promise<SalaryReceiptLink | null>;
  saveSalaryProfile(
    input: SalaryProfileInput,
    operationId: string
  ): Promise<MutationResult<SalaryProfile>>;
  confirmSalaryReceipt(
    input: SalaryReceiptConfirmation,
    operationId: string
  ): Promise<MutationResult<SalaryReceiptOutcome>>;
  undoSalaryReceipt(
    receiptId: string,
    operationId: string,
    timeZone?: string
  ): Promise<MutationResult<SalaryReceiptOutcome>>;
  getBudget(periodKey: string): Promise<BudgetDetail | null>;
  listBudgets(periodKey: string): Promise<BudgetDetail[]>;
  getBudgetById(id: string): Promise<BudgetDetail>;
  createBudgetDraftFromPrevious(periodKey: string): Promise<PlanningDraft>;
  saveBudget(
    input: BudgetInput,
    operationId: string
  ): Promise<MutationResult<Budget>>;
  previewBudgetMove(input: BudgetMoveInput): Promise<BudgetMovePreview>;
  confirmBudgetMove(
    previewId: string,
    operationId: string
  ): Promise<MutationResult<BudgetDetail>>;
  setBudgetStatus(
    id: string,
    expectedVersion: number,
    status: Exclude<BudgetLifecycle, 'draft' | 'deleted'>,
    operationId: string
  ): Promise<MutationResult<Budget>>;
  deleteBudget(
    id: string,
    expectedVersion: number,
    operationId: string
  ): Promise<MutationResult<Budget>>;
  getObligationsOverview(input: ObligationQuery): Promise<ObligationsOverview>;
  listObligations(input: ObligationQuery): Promise<ObligationPage>;
  getObligation(id: string): Promise<ObligationDetail>;
  createObligation(
    input: ObligationInput,
    operationId: string
  ): Promise<MutationResult<Obligation>>;
  updateObligation(
    id: string,
    expectedVersion: number,
    input: ObligationInput,
    operationId: string
  ): Promise<MutationResult<Obligation>>;
  setObligationStatus(
    id: string,
    expectedVersion: number,
    status: ObligationLifecycle,
    operationId: string
  ): Promise<MutationResult<Obligation>>;
  previewObligationPayment(
    input: ObligationPaymentInput
  ): Promise<ObligationPaymentPreview>;
  confirmObligationPayment(
    previewId: string,
    allocation: PaymentAllocationChoice,
    operationId: string
  ): Promise<MutationResult<ObligationPaymentOutcome>>;
  reverseObligationPayment(
    paymentId: string,
    operationId: string
  ): Promise<MutationResult<ObligationPaymentOutcome>>;
  previewEarlySettlement(obligationId: string): Promise<EarlySettlementPreview>;
  confirmEarlySettlement(
    previewId: string,
    operationId: string
  ): Promise<MutationResult<ObligationPaymentOutcome>>;
  listPaymentMatches(input: PaymentMatchQuery): Promise<PaymentMatchPage>;
  getPaymentMatch(id: string): Promise<PaymentMatch>;
  resolvePaymentMatch(
    input: PaymentMatchResolution,
    operationId: string
  ): Promise<MutationResult<PaymentMatchOutcome>>;
  listGoals(input: GoalQuery): Promise<SavingsGoal[]>;
  getGoal(id: string): Promise<SavingsGoalDetail>;
  createGoal(
    input: SavingsGoalInput,
    operationId: string
  ): Promise<MutationResult<SavingsGoal>>;
  updateGoal(
    id: string,
    expectedVersion: number,
    input: SavingsGoalInput,
    operationId: string
  ): Promise<MutationResult<SavingsGoal>>;
  setGoalStatus(
    id: string,
    expectedVersion: number,
    status: SavingsLifecycle,
    operationId: string
  ): Promise<MutationResult<SavingsGoal>>;
  previewGoalMovement(input: GoalMovementInput): Promise<GoalMovementPreview>;
  confirmGoalMovement(
    previewId: string,
    operationId: string
  ): Promise<MutationResult<GoalMovementOutcome>>;
  reverseGoalMovement(
    movementId: string,
    operationId: string
  ): Promise<MutationResult<GoalMovementOutcome>>;
  saveDraft(draft: PlanningDraft): Promise<PlanningDraft>;
  loadDraft(id: string): Promise<PlanningDraft | null>;
  discardDraft(id: string): Promise<void>;
  getConflict(id: string): Promise<PlanningConflict>;
  resolveConflict(
    id: string,
    resolution: 'keep_local' | 'keep_later'
  ): Promise<MutationResult<unknown>>;
}
