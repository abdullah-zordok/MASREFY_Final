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
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';

import {
  ClerkAuthGuard,
  type ClerkPrincipal,
  type ClerkPrincipalRequest,
} from '../identity/clerk-auth.guard';
import { AiService } from './ai.service';
import { AiNoStoreInterceptor } from './ai-no-store.interceptor';

type AiRequest = ClerkPrincipalRequest & { requestId?: string };

function principal(request: AiRequest): ClerkPrincipal {
  if (!request.clerkPrincipal) throw new HttpException({ code: 'AUTH_TOKEN_INVALID' }, 401);
  return request.clerkPrincipal;
}

@Controller('api/v1')
@ApiBearerAuth('ClerkBearer')
@UseGuards(ClerkAuthGuard)
@UseInterceptors(AiNoStoreInterceptor)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('voice/sessions')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createVoiceSession' })
  createVoiceSession(
    @Req() request: AiRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.createVoiceSession(principal(request), body, key);
  }

  @Get('voice/sessions/:sessionId')
  @ApiOperation({ operationId: 'getVoiceSession' })
  getVoiceSession(@Req() request: AiRequest, @Param('sessionId') id: string) {
    return this.ai.getVoiceSession(principal(request), id);
  }

  @Post('voice/sessions/:sessionId/process')
  @HttpCode(202)
  @ApiOperation({ operationId: 'processVoiceSession' })
  processVoiceSession(
    @Req() request: AiRequest,
    @Param('sessionId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.processVoiceSession(principal(request), id, body, key);
  }

  @Get('voice/sessions/:sessionId/proposal')
  @ApiOperation({ operationId: 'getVoiceProposal' })
  getVoiceProposal(@Req() request: AiRequest, @Param('sessionId') id: string) {
    return this.ai.getVoiceProposal(principal(request), id);
  }

  @Post('voice/proposals/:proposalId/confirm')
  @HttpCode(200)
  @ApiOperation({ operationId: 'confirmVoiceProposal' })
  confirmVoice(
    @Req() request: AiRequest,
    @Param('proposalId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.confirmVoice(principal(request), id, body, key);
  }

  @Post('voice/proposals/:proposalId/reject')
  @HttpCode(200)
  @ApiOperation({ operationId: 'rejectVoiceProposal' })
  rejectVoice(
    @Req() request: AiRequest,
    @Param('proposalId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.reject(principal(request), id, body, key);
  }

  @Get('voice/category-preferences')
  @ApiOperation({ operationId: 'listVoiceCategoryPreferences' })
  listVoicePreferences(@Req() request: AiRequest) {
    return this.ai.listVoicePreferences(principal(request));
  }

  @Post('voice/category-preferences')
  @HttpCode(200)
  @ApiOperation({ operationId: 'upsertVoiceCategoryPreference' })
  upsertVoicePreference(
    @Req() request: AiRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.upsertVoicePreference(principal(request), body, key);
  }

  @Delete('voice/category-preferences/:preferenceId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteVoiceCategoryPreference' })
  async deleteVoicePreference(
    @Req() request: AiRequest,
    @Param('preferenceId') id: string,
    @Query('expectedVersion') version: string,
    @Headers('idempotency-key') key?: string,
  ) {
    await this.ai.deleteVoicePreference(principal(request), id, version, key);
  }

  @Get('assistant/consent')
  @ApiOperation({ operationId: 'getAssistantConsent' })
  getConsent(@Req() request: AiRequest) {
    return this.ai.getConsent(principal(request));
  }

  @Put('assistant/consent')
  @ApiOperation({ operationId: 'grantAssistantConsent' })
  grantConsent(
    @Req() request: AiRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.grantConsent(principal(request), body, key);
  }

  @Delete('assistant/consent')
  @HttpCode(200)
  @ApiOperation({ operationId: 'revokeAssistantConsent' })
  revokeConsent(
    @Req() request: AiRequest,
    @Query('expectedVersion') version: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.revokeConsent(principal(request), version, key);
  }

  @Get('assistant/availability')
  @ApiOperation({ operationId: 'getAssistantAvailability' })
  getAssistantAvailability(@Req() request: AiRequest) {
    return this.ai.getAssistantAvailability(principal(request));
  }

  @Get('assistant/conversations')
  @ApiOperation({ operationId: 'listAssistantConversations' })
  listConversations(@Req() request: AiRequest, @Query() query: unknown) {
    return this.ai.listConversations(principal(request), query);
  }

  @Post('assistant/conversations')
  @HttpCode(201)
  @ApiOperation({ operationId: 'createAssistantConversation' })
  createConversation(
    @Req() request: AiRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.createConversation(principal(request), body, key);
  }

  @Get('assistant/conversations/:conversationId')
  @ApiOperation({ operationId: 'getAssistantConversation' })
  getConversation(@Req() request: AiRequest, @Param('conversationId') id: string) {
    return this.ai.getConversation(principal(request), id);
  }

  @Patch('assistant/conversations/:conversationId')
  @ApiOperation({ operationId: 'updateAssistantConversation' })
  updateConversation(
    @Req() request: AiRequest,
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.updateConversation(principal(request), id, body, key);
  }

  @Delete('assistant/conversations/:conversationId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteAssistantConversation' })
  async deleteConversation(
    @Req() request: AiRequest,
    @Param('conversationId') id: string,
    @Query('expectedVersion') version: string,
    @Headers('idempotency-key') key?: string,
  ) {
    await this.ai.deleteConversation(principal(request), id, version, key);
  }

  @Get('assistant/conversations/:conversationId/messages')
  @ApiOperation({ operationId: 'listAssistantMessages' })
  listMessages(
    @Req() request: AiRequest,
    @Param('conversationId') id: string,
    @Query() query: unknown,
  ) {
    return this.ai.listMessages(principal(request), id, query);
  }

  @Post('assistant/conversations/:conversationId/messages')
  @HttpCode(202)
  @ApiOperation({ operationId: 'createAssistantMessage' })
  async createMessage(
    @Req() request: AiRequest,
    @Res({ passthrough: true }) response: Response,
    @Param('conversationId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    const accepted = await this.ai.createMessage(principal(request), id, body, key);
    const { replayed, ...publicAccepted } = accepted;
    if (
      replayed ||
      !body ||
      typeof body !== 'object' ||
      Reflect.get(body, 'responseMode') !== 'stream'
    )
      return publicAccepted;
    response.set({
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.flushHeaders();
    const controller = new AbortController();
    response.once('close', () => {
      controller.abort();
    });
    for await (const item of this.ai.streamMessage(
      principal(request),
      String(publicAccepted.id),
      controller.signal,
    ))
      response.write(`event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`);
    response.end();
    return undefined;
  }

  @Post('assistant/previews/:previewId/confirm')
  @HttpCode(200)
  @ApiOperation({ operationId: 'confirmAssistantPreview' })
  confirmPreview(
    @Req() request: AiRequest,
    @Param('previewId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.confirmPreview(principal(request), id, body, key);
  }

  @Post('assistant/previews/:previewId/reject')
  @HttpCode(200)
  @ApiOperation({ operationId: 'rejectAssistantPreview' })
  rejectPreview(
    @Req() request: AiRequest,
    @Param('previewId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.reject(principal(request), id, body, key);
  }

  @Put('assistant/messages/:messageId/feedback')
  @ApiOperation({ operationId: 'putAssistantFeedback' })
  putFeedback(
    @Req() request: AiRequest,
    @Param('messageId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.putFeedback(principal(request), id, body, key);
  }

  @Post('assistant/messages/:messageId/report')
  @HttpCode(201)
  @ApiOperation({ operationId: 'reportAssistantResponse' })
  reportResponse(
    @Req() request: AiRequest,
    @Param('messageId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.ai.reportResponse(principal(request), id, body, key);
  }
}
