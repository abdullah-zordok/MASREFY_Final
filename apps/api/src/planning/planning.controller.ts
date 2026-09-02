import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import {
  AdminAuthGuard,
  adminPermission,
  type AdminPrincipalRequest,
} from '../security/admin-auth.guard';
import { normalizeIdempotencyKey } from './planning.dto';
import { PlanningService } from './planning.service';

@Controller()
export class PlanningController {
  constructor(readonly planning: PlanningService) {}

  @Get('api/v1/planning/summary')
  @ApiOperation({ operationId: 'getPlanningSummary' })
  @ApiQuery({
    name: 'period',
    required: true,
    schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: [
        'period',
        'dataState',
        'ledgerVersion',
        'salary',
        'budgets',
        'obligations',
        'savings',
      ],
      properties: {
        period: { type: 'string' },
        dataState: { type: 'string', enum: ['ready', 'empty', 'partial', 'stale'] },
        ledgerVersion: { type: 'integer', minimum: 0 },
        salary: { type: 'object', nullable: true },
        budgets: { type: 'array', maxItems: 100, items: { type: 'object' } },
        obligations: { type: 'object' },
        savings: { type: 'array', maxItems: 100, items: { type: 'object' } },
      },
    },
  })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getPlanningSummary(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.getPlanningSummary(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('api/v1/admin/planning/summary')
  @ApiOperation({ operationId: 'getAdminPlanningSummary' })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({
    name: 'period',
    required: true,
    schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: [
        'period',
        'dataState',
        'ledgerVersion',
        'salary',
        'budgets',
        'obligations',
        'savings',
      ],
    },
  })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(AdminAuthGuard)
  @adminPermission('planning.read')
  getAdminPlanningSummary(
    @Req() request: AdminPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.getAdminPlanningSummary(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('api/v1/salary-profiles')
  @ApiOperation({ operationId: 'listSalaryProfiles' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listSalaryProfiles(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listSalaryProfiles(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/salary-profiles')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createSalaryProfile' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  createSalaryProfile(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.createSalaryProfile({
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/salary-profiles/:profileId')
  @ApiOperation({ operationId: 'getSalaryProfile' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getSalaryProfile(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('profileId') profileId: string,
  ): Promise<unknown> {
    return this.planning.getSalaryProfile(
      this.principal(request),
      profileId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Patch('api/v1/salary-profiles/:profileId')
  @ApiOperation({ operationId: 'updateSalaryProfile' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  updateSalaryProfile(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('profileId') profileId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.updateSalaryProfile(profileId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Delete('api/v1/salary-profiles/:profileId')
  @ApiOperation({ operationId: 'archiveSalaryProfile' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  archiveSalaryProfile(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('profileId') profileId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.archiveSalaryProfile(profileId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/salary-profiles/:profileId/receipts')
  @ApiOperation({ operationId: 'listSalaryReceipts' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listSalaryReceipts(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('profileId') profileId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listSalaryReceipts(
      this.principal(request),
      profileId,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/salary-profiles/:profileId/receipts')
  @HttpCode(201)
  @ApiOperation({ operationId: 'linkSalaryReceipt' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  linkSalaryReceipt(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('profileId') profileId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.linkSalaryReceipt(profileId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Delete('api/v1/salary-profiles/:profileId/receipts/:receiptId')
  @ApiOperation({ operationId: 'unlinkSalaryReceipt' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  unlinkSalaryReceipt(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('profileId') profileId: string,
    @Param('receiptId') receiptId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.unlinkSalaryReceipt(profileId, receiptId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/budgets')
  @ApiOperation({ operationId: 'listBudgets' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listBudgets(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listBudgets(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/budgets')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createBudget' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  createBudget(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.createBudget({
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/budgets/:budgetId')
  @ApiOperation({ operationId: 'getBudget' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getBudget(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('budgetId') budgetId: string,
  ): Promise<unknown> {
    return this.planning.getBudget(
      this.principal(request),
      budgetId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Patch('api/v1/budgets/:budgetId')
  @ApiOperation({ operationId: 'updateBudget' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  updateBudget(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('budgetId') budgetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.updateBudget(budgetId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Delete('api/v1/budgets/:budgetId')
  @ApiOperation({ operationId: 'deleteBudget' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  deleteBudget(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('budgetId') budgetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.deleteBudget(budgetId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Put('api/v1/budgets/:budgetId/categories')
  @ApiOperation({ operationId: 'replaceBudgetCategories' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  replaceBudgetCategories(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('budgetId') budgetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.replaceBudgetCategories(budgetId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/budgets/:budgetId/summary')
  @ApiOperation({ operationId: 'getBudgetSummary' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getBudgetSummary(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('budgetId') budgetId: string,
  ): Promise<unknown> {
    return this.planning.getBudgetSummary(
      this.principal(request),
      budgetId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('api/v1/obligations')
  @ApiOperation({ operationId: 'listObligations' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listObligations(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listObligations(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/obligations')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createObligation' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  createObligation(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.createObligation({
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/obligations/:obligationId')
  @ApiOperation({ operationId: 'getObligation' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getObligation(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('obligationId') obligationId: string,
  ): Promise<unknown> {
    return this.planning.getObligation(
      this.principal(request),
      obligationId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Patch('api/v1/obligations/:obligationId')
  @ApiOperation({ operationId: 'updateObligation' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  updateObligation(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('obligationId') obligationId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.updateObligation(obligationId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Delete('api/v1/obligations/:obligationId')
  @ApiOperation({ operationId: 'archiveObligation' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  archiveObligation(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('obligationId') obligationId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.archiveObligation(obligationId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/obligations/:obligationId/schedule')
  @ApiOperation({ operationId: 'listObligationSchedule' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listObligationSchedule(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('obligationId') obligationId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listObligationSchedule(
      this.principal(request),
      obligationId,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/obligations/:obligationId/payments')
  @HttpCode(201)
  @ApiOperation({ operationId: 'allocateObligationPayment' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  allocateObligationPayment(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('obligationId') obligationId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.allocateObligationPayment(obligationId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/obligations/:obligationId/payments/:paymentId/reverse')
  @ApiOperation({ operationId: 'reverseObligationPayment' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  reverseObligationPayment(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('obligationId') obligationId: string,
    @Param('paymentId') paymentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.reverseObligationPayment(obligationId, paymentId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/payment-matches')
  @ApiOperation({ operationId: 'listPaymentMatches' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listPaymentMatches(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listPaymentMatches(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('api/v1/payment-matches/:matchId')
  @ApiOperation({ operationId: 'getPaymentMatch' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getPaymentMatch(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('matchId') matchId: string,
  ): Promise<unknown> {
    return this.planning.getPaymentMatch(
      this.principal(request),
      matchId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Patch('api/v1/payment-matches/:matchId')
  @ApiOperation({ operationId: 'decidePaymentMatch' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  decidePaymentMatch(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('matchId') matchId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.decidePaymentMatch(matchId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/savings-goals')
  @ApiOperation({ operationId: 'listSavingsGoals' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  listSavingsGoals(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.planning.listSavingsGoals(
      this.principal(request),
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/savings-goals')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createSavingsGoal' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  createSavingsGoal(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.createSavingsGoal({
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Get('api/v1/savings-goals/:goalId')
  @ApiOperation({ operationId: 'getSavingsGoal' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  getSavingsGoal(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('goalId') goalId: string,
  ): Promise<unknown> {
    return this.planning.getSavingsGoal(
      this.principal(request),
      goalId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Patch('api/v1/savings-goals/:goalId')
  @ApiOperation({ operationId: 'updateSavingsGoal' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  updateSavingsGoal(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('goalId') goalId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.updateSavingsGoal(goalId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Delete('api/v1/savings-goals/:goalId')
  @ApiOperation({ operationId: 'deleteSavingsGoal' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  deleteSavingsGoal(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('goalId') goalId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.deleteSavingsGoal(goalId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/savings-goals/:goalId/movements')
  @HttpCode(201)
  @ApiOperation({ operationId: 'recordSavingsMovement' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  recordSavingsMovement(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('goalId') goalId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.recordSavingsMovement(goalId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/savings-goals/:goalId/movements/:movementId/reverse')
  @ApiOperation({ operationId: 'reverseSavingsMovement' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  reverseSavingsMovement(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('goalId') goalId: string,
    @Param('movementId') movementId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.planning.reverseSavingsMovement(goalId, movementId, {
      principal: this.principal(request),
      body,
      idempotencyKey: this.idempotency(key),
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  private principal(request: ClerkPrincipalRequest) {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    return request.clerkPrincipal;
  }

  private idempotency(value: unknown): string {
    if (value === undefined) throw new HttpException({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    try {
      return normalizeIdempotencyKey(value);
    } catch {
      throw new HttpException({ code: 'VALIDATION_FAILED' }, 400);
    }
  }
}
