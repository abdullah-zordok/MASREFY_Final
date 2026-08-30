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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { ClerkAuthGuard, type ClerkPrincipalRequest } from '../identity/clerk-auth.guard';
import { hashIdempotencyKey } from './idempotency';
import { LedgerService } from './ledger.service';

@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('api/v1/transactions')
  @ApiOperation({ operationId: 'listTransactions' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async listTransactions(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    return this.ledger.listTransactions(
      request.clerkPrincipal,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('api/v1/transactions/:transactionId')
  @ApiOperation({ operationId: 'getTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async getTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('transactionId') transactionId: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    return this.ledger.getTransaction(
      request.clerkPrincipal,
      transactionId,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Get('api/v1/accounts/:accountId/summary')
  @ApiOperation({ operationId: 'getAccountLedgerSummary' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async getAccountLedgerSummary(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('accountId') accountId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    return this.ledger.getAccountSummary(
      request.clerkPrincipal,
      accountId,
      query,
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/transactions')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async createTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.createTransaction({
      principal: request.clerkPrincipal,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/transfers')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createTransfer' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async createTransfer(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.transfer({
      principal: request.clerkPrincipal,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Patch('api/v1/transactions/:transactionId')
  @HttpCode(200)
  @ApiOperation({ operationId: 'reviseTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async reviseTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.reviseTransaction({
      principal: request.clerkPrincipal,
      transactionId,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/transactions/:transactionId/refunds')
  @HttpCode(201)
  @ApiOperation({ operationId: 'refundTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async refundTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.refundTransaction({
      principal: request.clerkPrincipal,
      transactionId,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/transactions/:transactionId/reverse')
  @HttpCode(201)
  @ApiOperation({ operationId: 'reverseTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async reverseTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.reverseTransaction({
      principal: request.clerkPrincipal,
      transactionId,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Delete('api/v1/transactions/:transactionId')
  @HttpCode(200)
  @ApiOperation({ operationId: 'deleteTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async deleteTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.deleteTransaction({
      principal: request.clerkPrincipal,
      transactionId,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  @Post('api/v1/transactions/:transactionId/restore')
  @HttpCode(200)
  @ApiOperation({ operationId: 'restoreTransaction' })
  @ApiBearerAuth('ClerkBearer')
  @UseGuards(ClerkAuthGuard)
  async restoreTransaction(
    @Req() request: ClerkPrincipalRequest & { requestId?: string },
    @Param('transactionId') transactionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<unknown> {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    const key = this.validatedIdempotencyKey(idempotencyKey);
    return this.ledger.restoreTransaction({
      principal: request.clerkPrincipal,
      transactionId,
      body,
      idempotencyKey: key,
      requestId: request.requestId ?? 'missing-request-id',
    });
  }

  private validatedIdempotencyKey(value?: string): string {
    const key = value ?? '';
    try {
      hashIdempotencyKey(key);
      return key;
    } catch {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    }
  }
}
