import { randomUUID } from 'expo-crypto';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import { assessment, type VoiceField, type VoiceProposalGroup, type VoiceScenario, type VoiceTranscript, type VoiceTransactionProposal } from '@/domain/voice-capture';
import type { CapabilityProviderHandle } from '@/services/contracts/capability-contract';
import { VoiceCaptureError, voiceAnalyzerServiceCapability, type VoiceAnalyzerService } from '@/services/contracts/voice-capture-service';

type Json = Record<string, unknown>;
type TokenProvider = () => Promise<string>;
let tokenProvider: TokenProvider = () => Promise.reject(new VoiceCaptureError('analysis_unavailable'));
let tokenProviderConfigured = false;

export function configureVoiceApiTokenProvider(provider: TokenProvider): void { tokenProvider = provider; tokenProviderConfigured = true; }

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VoiceCaptureError('analysis_failed');
  return value as Json;
}

function epoch(value: unknown): number | null {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function mapField(value: unknown): ReturnType<typeof assessment> {
  const row = object(value);
  const names: Record<string, VoiceField> = { amountMinor: 'amount', currency: 'currency', categoryId: 'category', accountId: 'account', date: 'date', merchant: 'merchant', note: 'notes' };
  const field = names[String(row.name)] ?? 'notes';
  const confidence = Math.round(Number(row.confidence ?? 0) * 100);
  return assessment(field, confidence, `voice.confidence.${field}`, row.value == null);
}

function mapProposal(value: Json): VoiceTransactionProposal {
  const payload = object(value.payload);
  const amount = Number(payload.amountMinor);
  const merchant = typeof payload.merchant === 'string' ? payload.merchant : null;
  const accountId = typeof payload.accountId === 'string' ? payload.accountId : null;
  const categoryId = typeof payload.categoryId === 'string' ? payload.categoryId : null;
  const occurredAt = epoch(`${String(payload.date)}T12:00:00.000Z`);
  const assessments = Array.isArray(value.fields) ? value.fields.map(mapField) : [];
  return {
    id: String(value.id), type: amount < 0 ? 'income' : 'expense', amountMinor: Number.isSafeInteger(amount) ? Math.abs(amount) : null,
    currencyCode: typeof payload.currency === 'string' ? payload.currency : null, merchant, title: merchant ?? 'Voice transaction', categoryId,
    paymentMethod: null, accountId, destinationAccountId: null, occurredAt, beneficiary: null, obligationId: null,
    duplicateOfTransactionId: null, notes: typeof payload.note === 'string' ? payload.note : null, assessments, recurringSuggestion: null,
    selected: true, status: accountId && (categoryId || amount < 0) && occurredAt ? 'ready' : 'proposed', categoryPreference: 'not_now'
  };
}

export function createLiveVoiceApiService(options: { baseUrl?: string; token?: TokenProvider; request?: typeof fetch; sleep?: (milliseconds: number) => Promise<void>; now?: () => number } = {}): CapabilityProviderHandle<VoiceAnalyzerService> {
  const baseUrl = options.baseUrl ?? process.env.EXPO_PUBLIC_API_URL ?? '', token = options.token ?? (() => tokenProvider()), request = options.request ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))), now = options.now ?? Date.now;
  const analyzed = new Map<string, Json>(), serverProposals = new Map<string, Json>();
  const send = async (method: string, path: string, body?: unknown, key?: string): Promise<Json> => {
    const response = await request(`${baseUrl.replace(/\/$/u, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const value = response.status === 204 ? {} : object(await response.json());
    if (!response.ok) throw new VoiceCaptureError(response.status === 503 ? 'analysis_unavailable' : response.status === 422 ? 'invalid_proposal' : 'analysis_failed');
    return value;
  };
  return {
    metadata: { id: 'phase09-voice-http', capability: voiceAnalyzerServiceCapability.capability, majorVersion: voiceAnalyzerServiceCapability.majorVersion, kind: 'live', availability: baseUrl && (Boolean(options.token) || tokenProviderConfigured) ? 'available' : 'unavailable' },
    async transcribe(audioReference: string, scenario: VoiceScenario) {
      if (!baseUrl) throw new VoiceCaptureError('analysis_unavailable');
      let audio: Response;
      try { audio = await request(audioReference); } catch { throw new VoiceCaptureError('offline'); }
      if (!audio.ok) throw new VoiceCaptureError('recording_interrupted');
      const bytes = await audio.arrayBuffer();
      const contentType = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'].includes(audio.headers.get('content-type') ?? '') ? String(audio.headers.get('content-type')) : 'audio/m4a';
      const created = await send('POST', '/api/v1/voice/sessions', { locale: scenario === 'clear_ar' ? 'ar' : 'en', durationMs: 60_000, contentType, sizeBytes: bytes.byteLength }, randomUUID());
      const session = object(created.session), upload = object(created.upload);
      const uploadUrl = new URL(String(upload.url));
      if (!uploadUrl.searchParams.has('token')) uploadUrl.searchParams.set('token', String(upload.token));
      const uploaded = await request(uploadUrl.toString(), { method: 'PUT', headers: object(upload.headers) as Record<string, string>, body: bytes });
      if (!uploaded.ok) throw new VoiceCaptureError('analysis_failed');
      await send('POST', `/api/v1/voice/sessions/${encodeURIComponent(String(session.id))}/process`, { uploadCompleted: true, expectedVersion: session.version, contentHash: bytesToHex(sha256(new Uint8Array(bytes))) }, randomUUID());
      let proposal: Json | null = null;
      for (let attempt = 0; attempt < 650 && !proposal; attempt += 1) {
        const response = await request(`${baseUrl.replace(/\/$/u, '')}/api/v1/voice/sessions/${encodeURIComponent(String(session.id))}/proposal`, { headers: { Authorization: `Bearer ${await token()}` } });
        if (response.ok) proposal = object(await response.json());
        else if (response.status !== 404) throw new VoiceCaptureError(response.status === 503 ? 'analysis_unavailable' : 'analysis_failed');
        if (!proposal) await sleep(100);
      }
      if (!proposal) throw new VoiceCaptureError('analysis_unavailable');
      const transcript: VoiceTranscript = { text: String(proposal.redactedTranscript ?? ''), language: scenario === 'clear_ar' ? 'ar' : 'en', confidence: Math.round(Number(object(proposal.payload).confidence ?? 0) * 100), capturedAt: now(), editedByUser: false };
      analyzed.set(`${transcript.capturedAt}:${transcript.text}`, proposal);
      return transcript;
    },
    async analyze(input) {
      const proposal = analyzed.get(`${input.transcript.capturedAt}:${input.transcript.text}`);
      if (!proposal) throw new VoiceCaptureError('analysis_failed');
      analyzed.delete(`${input.transcript.capturedAt}:${input.transcript.text}`);
      const mapped = mapProposal(proposal);
      serverProposals.set(mapped.id, proposal);
      return { id: `group-${String(proposal.id)}`, sessionId: input.sessionId, proposals: [mapped], status: 'reviewing', saveErrorCode: null } satisfies VoiceProposalGroup;
    },
    async confirm(input) {
      const proposal = input.proposals[0], server = proposal ? serverProposals.get(proposal.id) : undefined;
      if (!proposal || input.proposals.length !== 1 || !server || !proposal.accountId || !proposal.currencyCode || !proposal.occurredAt || !proposal.amountMinor) throw new VoiceCaptureError('invalid_proposal');
      const result = await send('POST', `/api/v1/voice/proposals/${encodeURIComponent(proposal.id)}/confirm`, {
        expectedVersion: Number(server.version ?? 1),
        editedFields: {
          amountMinor: String(proposal.type === 'income' ? -proposal.amountMinor : proposal.amountMinor), currency: proposal.currencyCode,
          categoryId: proposal.categoryId, accountId: proposal.accountId, date: new Date(proposal.occurredAt).toISOString().slice(0, 10),
          merchant: proposal.merchant, note: proposal.notes
        },
        reason: null
      }, input.operationId);
      serverProposals.delete(proposal.id);
      return { transactionIds: [String(result.resourceId)], affectedScopes: ['home.summary', 'accounts.list', 'transactions.list', `transactions.detail.${String(result.resourceId)}`, 'reports.live', 'assistant.context'] };
    }
  };
}
