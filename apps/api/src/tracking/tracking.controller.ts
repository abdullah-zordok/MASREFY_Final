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
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import {
  ClerkAuthGuard,
  type ClerkPrincipal,
  type ClerkPrincipalRequest,
} from '../identity/clerk-auth.guard';
import { hashIdempotencyKey } from '../ledger/idempotency';
import { TrackingService } from './tracking.service';

type Request = ClerkPrincipalRequest & { requestId?: string; body?: unknown };
type Input = {
  principal: ClerkPrincipal;
  body: unknown;
  idempotencyKey: string;
  requestId: string;
};

@Controller()
@ApiBearerAuth('ClerkBearer')
@UseGuards(ClerkAuthGuard)
export class TrackingController {
  constructor(readonly tracking: TrackingService) {}

  @Get('api/v1/tracking/preferences')
  @ApiOperation({ operationId: 'getTrackingPreferences' })
  preferences(@Req() request: Request): Promise<unknown> {
    return this.tracking.preferences(this.principal(request));
  }

  @Put('api/v1/tracking/preferences')
  @ApiOperation({ operationId: 'updateTrackingPreferences' })
  updatePreferences(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.updatePreferences(this.input(request, body, key));
  }

  @Get('api/v1/tracking/status')
  @ApiOperation({ operationId: 'getTrackingStatus' })
  status(@Req() request: Request): Promise<unknown> {
    return this.tracking.status(this.principal(request));
  }

  @Get('api/v1/tracking/keyword-rules')
  @ApiOperation({ operationId: 'listKeywordRules' })
  keywords(@Req() request: Request, @Query() query: Record<string, unknown>): Promise<unknown> {
    return this.tracking.list(this.principal(request), 'keywords', query);
  }

  @Post('api/v1/tracking/keyword-rules')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createKeywordRule' })
  createKeyword(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.keyword(this.input(request, body, key));
  }

  @Patch('api/v1/tracking/keyword-rules/:ruleId')
  @ApiOperation({ operationId: 'updateKeywordRule' })
  updateKeyword(
    @Req() request: Request,
    @Param('ruleId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.keyword(this.input(request, body, key), id);
  }

  @Delete('api/v1/tracking/keyword-rules/:ruleId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteKeywordRule' })
  removeKeyword(
    @Req() request: Request,
    @Param('ruleId') id: string,
    @Query() query: Record<string, unknown>,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.removeRule('keyword', id, query, this.input(request, query, key));
  }

  @Post('api/v1/tracking/keyword-rules/restore-defaults')
  @ApiOperation({ operationId: 'restoreDefaultKeywordRules' })
  restoreKeywords(
    @Req() request: Request,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.restoreKeywords(this.input(request, {}, key));
  }

  @Get('api/v1/tracking/sender-rules')
  @ApiOperation({ operationId: 'listSenderRules' })
  senders(@Req() request: Request, @Query() query: Record<string, unknown>): Promise<unknown> {
    return this.tracking.list(this.principal(request), 'senders', query);
  }

  @Post('api/v1/tracking/sender-rules')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createSenderRule' })
  createSender(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.sender(this.input(request, body, key));
  }

  @Patch('api/v1/tracking/sender-rules/:ruleId')
  @ApiOperation({ operationId: 'updateSenderRule' })
  updateSender(
    @Req() request: Request,
    @Param('ruleId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.sender(this.input(request, body, key), id);
  }

  @Delete('api/v1/tracking/sender-rules/:ruleId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteSenderRule' })
  removeSender(
    @Req() request: Request,
    @Param('ruleId') id: string,
    @Query() query: Record<string, unknown>,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.removeRule('sender', id, query, this.input(request, query, key));
  }

  @Get('api/v1/imports')
  @ApiOperation({ operationId: 'listImportSessions' })
  imports(@Req() request: Request, @Query() query: Record<string, unknown>): Promise<unknown> {
    return this.tracking.list(this.principal(request), 'sessions', query);
  }

  @Post('api/v1/imports')
  @HttpCode(202)
  @ApiOperation({ operationId: 'createImport' })
  createImport(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
    @Headers('content-type') contentType = 'application/json',
    @Headers('x-source-name') sourceName?: string,
  ): Promise<unknown> {
    const type = contentType.split(';')[0]?.trim() ?? '';
    return this.tracking.createImport(
      this.input(request, body, key),
      type,
      Buffer.isBuffer(body) ? body : undefined,
      sourceName,
    );
  }

  @Get('api/v1/imports/:sessionId')
  @ApiOperation({ operationId: 'getImportSession' })
  import(@Req() request: Request, @Param('sessionId') id: string): Promise<unknown> {
    return this.tracking.detail(this.principal(request), 'sessions', id);
  }

  @Get('api/v1/imports/:sessionId/items')
  @ApiOperation({ operationId: 'listImportItems' })
  items(
    @Req() request: Request,
    @Param('sessionId') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<unknown> {
    return this.tracking.sessionItems(this.principal(request), id, null, query);
  }

  @Get('api/v1/imports/:sessionId/items/:itemId')
  @ApiOperation({ operationId: 'getImportItem' })
  item(
    @Req() request: Request,
    @Param('sessionId') sessionId: string,
    @Param('itemId') itemId: string,
  ): Promise<unknown> {
    return this.tracking.sessionItems(this.principal(request), sessionId, itemId, {});
  }

  @Get('api/v1/reviews')
  @ApiOperation({ operationId: 'listTrackingReviews' })
  reviews(@Req() request: Request, @Query() query: Record<string, unknown>): Promise<unknown> {
    return this.tracking.list(this.principal(request), 'reviews', query);
  }

  @Get('api/v1/reviews/:reviewId')
  @ApiOperation({ operationId: 'getTrackingReview' })
  review(@Req() request: Request, @Param('reviewId') id: string): Promise<unknown> {
    return this.tracking.detail(this.principal(request), 'reviews', id);
  }

  @Post('api/v1/reviews/:reviewId/decision')
  @ApiOperation({ operationId: 'decideTrackingReview' })
  decideReview(
    @Req() request: Request,
    @Param('reviewId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.decideReview(id, this.input(request, body, key));
  }

  @Get('api/v1/duplicates')
  @ApiOperation({ operationId: 'listDuplicateCandidates' })
  duplicates(@Req() request: Request, @Query() query: Record<string, unknown>): Promise<unknown> {
    return this.tracking.list(this.principal(request), 'duplicates', query);
  }

  @Get('api/v1/duplicates/:candidateId')
  @ApiOperation({ operationId: 'getDuplicateCandidate' })
  duplicate(@Req() request: Request, @Param('candidateId') id: string): Promise<unknown> {
    return this.tracking.detail(this.principal(request), 'duplicates', id);
  }

  @Post('api/v1/duplicates/:candidateId/decision')
  @ApiOperation({ operationId: 'decideDuplicateCandidate' })
  decideDuplicate(
    @Req() request: Request,
    @Param('candidateId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.decideDuplicate(id, this.input(request, body, key));
  }

  @Get('api/v1/tracking/history')
  @ApiOperation({ operationId: 'listTrackingHistory' })
  history(@Req() request: Request, @Query() query: Record<string, unknown>): Promise<unknown> {
    return this.tracking.list(this.principal(request), 'history', query);
  }

  @Delete('api/v1/tracking/history')
  @HttpCode(204)
  @ApiOperation({ operationId: 'clearTrackingHistory' })
  clearHistory(
    @Req() request: Request,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.repository.clearHistory(
      this.principal(request),
      this.key(key),
      request.requestId ?? 'missing-request-id',
    );
  }

  @Post('api/v1/tracking/feedback')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createTrackingFeedback' })
  feedback(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ): Promise<unknown> {
    return this.tracking.feedback(this.input(request, body, key));
  }

  private principal(request: Request): ClerkPrincipal {
    if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
    return request.clerkPrincipal;
  }
  private key(value?: string): string {
    try {
      hashIdempotencyKey(value ?? '');
      return value as string;
    } catch {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    }
  }
  private input(request: Request, body: unknown, key?: string): Input {
    return {
      principal: this.principal(request),
      body,
      idempotencyKey: this.key(key),
      requestId: request.requestId ?? 'missing-request-id',
    };
  }
}
