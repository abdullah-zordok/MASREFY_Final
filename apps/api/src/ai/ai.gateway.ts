export interface EffectiveAiRoute {
  workload: string;
  primary: { modelId: string; provider: string };
  fallbacks: Array<{ modelId: string; provider: string }>;
  providerAllowlist: string[];
  zdrRequired: boolean;
  maxPrice: { prompt: string; completion: string };
  limits: { inputTokens: number; outputTokens: number; timeoutMs: number };
  prompt: { template: string; schemaVersion: number };
  safetyRules: Array<{
    key: string;
    type: 'input_block' | 'output_block' | 'field_limit' | 'action_allowlist' | 'evidence_limit';
    configuration: Record<string, unknown>;
  }>;
}

export interface AiCompletion<T> {
  value: T;
  model: string;
  provider: string;
  fallbackUsed: boolean;
  generationId: string;
  usage: { inputTokens: number; outputTokens: number; cost: number };
  latencyMs: number;
}

export class AiGatewayError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable = false,
  ) {
    super(code);
    this.name = 'AiGatewayError';
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Candidate = EffectiveAiRoute['primary'];
interface CompletionInput<T> {
  route: EffectiveAiRoute;
  userContent: unknown;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  requestId: string;
  signal?: AbortSignal;
}

export class AiGateway {
  private static readonly MAX_REQUEST_BYTES = 18 * 1024 * 1024;
  private readonly fetcher: Fetcher;
  private readonly now: () => number;
  private failures: number[] = [];
  private openUntil = 0;
  private probing = false;

  constructor(
    private readonly options: { apiKey?: string; fetcher?: Fetcher; now?: () => number },
  ) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async complete<T>(input: CompletionInput<T>): Promise<AiCompletion<T>> {
    if (!this.options.apiKey) throw new AiGatewayError('AI_UNAVAILABLE');
    this.assertRoute(input.route);
    this.enterCircuit();
    const startedAt = this.now();
    const deadline = startedAt + input.route.limits.timeoutMs;
    const candidates = [input.route.primary, ...input.route.fallbacks].slice(0, 2);
    let last: AiGatewayError | undefined;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      if (!candidate) break;
      try {
        const result = await this.attempt(input, candidate, deadline, index > 0, startedAt);
        this.onSuccess();
        return result;
      } catch (error) {
        last =
          error instanceof AiGatewayError
            ? error
            : new AiGatewayError('AI_TEMPORARILY_UNAVAILABLE', true);
        this.onFailure(last.retryable);
        if (!last.retryable || index === candidates.length - 1) break;
      }
    }
    throw last ?? new AiGatewayError('AI_TEMPORARILY_UNAVAILABLE', true);
  }

  private async attempt<T>(
    input: CompletionInput<T>,
    candidate: Candidate,
    deadline: number,
    fallbackUsed: boolean,
    startedAt: number,
  ): Promise<AiCompletion<T>> {
    const remaining = deadline - this.now();
    if (remaining <= 0) throw new AiGatewayError('AI_TEMPORARILY_UNAVAILABLE', true);
    const apiKey = this.options.apiKey;
    if (!apiKey) throw new AiGatewayError('AI_UNAVAILABLE');
    const controller = new AbortController();
    const onAbort = () => {
      controller.abort();
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });
    const fullTimer = setTimeout(() => {
      controller.abort();
    }, remaining);
    const connectionTimer = setTimeout(
      () => {
        controller.abort();
      },
      Math.min(remaining, 3_000),
    );
    try {
      const body = JSON.stringify({
        model: candidate.modelId,
        messages: [
          { role: 'system', content: input.route.prompt.template },
          { role: 'user', content: input.userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: `${input.route.workload}_v${input.route.prompt.schemaVersion.toString()}`,
            strict: true,
            schema: input.schema,
          },
        },
        max_tokens: input.route.limits.outputTokens,
        temperature: 0,
        stream: false,
        provider: {
          only: [candidate.provider],
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: 'deny',
          zdr: true,
          max_price: input.route.maxPrice,
        },
      });
      if (new TextEncoder().encode(body).length > AiGateway.MAX_REQUEST_BYTES)
        throw new AiGatewayError('AI_SCHEMA_INVALID');
      const response = await this.fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'x-title': 'Masarifi',
          'x-request-id': input.requestId,
        },
        body,
      });
      clearTimeout(connectionTimer);
      if (!response.ok) {
        throw new AiGatewayError(
          response.status === 429 || response.status >= 500
            ? 'AI_TEMPORARILY_UNAVAILABLE'
            : 'AI_UNAVAILABLE',
          response.status === 429 || response.status >= 500,
        );
      }
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
        throw new AiGatewayError('AI_SCHEMA_INVALID');
      const text = await boundedText(response, 262_144);
      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new AiGatewayError('AI_SCHEMA_INVALID', true);
      }
      const choices = Array.isArray(envelope.choices) ? (envelope.choices as unknown[]) : [];
      const choice = choices[0];
      const content =
        choice && typeof choice === 'object' && 'message' in choice
          ? (choice as { message?: { content?: unknown } }).message?.content
          : undefined;
      if (typeof content !== 'string' || content.length > 65_536) {
        throw new AiGatewayError('AI_SCHEMA_INVALID', true);
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(content);
      } catch {
        throw new AiGatewayError('AI_SCHEMA_INVALID', true);
      }
      let value: T;
      try {
        value = input.parse(decoded);
      } catch {
        throw new AiGatewayError('AI_SCHEMA_INVALID', true);
      }
      const usage = this.usage(envelope.usage);
      const maximumCost =
        usage.inputTokens * Number(input.route.maxPrice.prompt) +
        usage.outputTokens * Number(input.route.maxPrice.completion);
      if (
        usage.inputTokens > input.route.limits.inputTokens ||
        usage.outputTokens > input.route.limits.outputTokens ||
        usage.cost > maximumCost + 0.00000001 ||
        (typeof envelope.model === 'string' && envelope.model !== candidate.modelId)
      ) {
        throw new AiGatewayError('AI_SCHEMA_INVALID');
      }
      return {
        value,
        model: typeof envelope.model === 'string' ? envelope.model : candidate.modelId,
        provider: candidate.provider,
        fallbackUsed,
        generationId: typeof envelope.id === 'string' ? envelope.id : input.requestId,
        usage,
        latencyMs: Math.max(0, this.now() - startedAt),
      };
    } catch (error) {
      if (error instanceof AiGatewayError) throw error;
      throw new AiGatewayError('AI_TEMPORARILY_UNAVAILABLE', true);
    } finally {
      clearTimeout(connectionTimer);
      clearTimeout(fullTimer);
      input.signal?.removeEventListener('abort', onAbort);
    }
  }

  private usage(value: unknown): AiCompletion<unknown>['usage'] {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new AiGatewayError('AI_USAGE_ACCOUNTING_INCOMPLETE');
    const usage = value as Record<string, unknown>;
    const inputTokens = accountingInteger(usage.prompt_tokens);
    const outputTokens = accountingInteger(usage.completion_tokens);
    const cost = accountingNumber(usage.cost);
    return { inputTokens, outputTokens, cost };
  }

  private assertRoute(route: EffectiveAiRoute): void {
    const candidates = [route.primary, ...route.fallbacks];
    const inputRule = route.safetyRules.find(({ type }) => type === 'input_block')?.configuration;
    const outputRule = route.safetyRules.find(({ type }) => type === 'output_block')?.configuration;
    const forbidden = outputRule?.forbiddenKeys;
    if (
      !route.zdrRequired ||
      candidates.length === 0 ||
      candidates.length > 5 ||
      new Set(candidates.map((item) => item.modelId)).size !== candidates.length ||
      candidates.some((item) => !route.providerAllowlist.includes(item.provider)) ||
      route.limits.outputTokens < 1 ||
      route.limits.inputTokens < 1 ||
      route.limits.timeoutMs < 100 ||
      !decimal(route.maxPrice.prompt) ||
      !decimal(route.maxPrice.completion) ||
      inputRule?.denyControl !== true ||
      inputRule.denyBidiControls !== true ||
      !Number.isInteger(inputRule.maxUtf8Bytes) ||
      Number(inputRule.maxUtf8Bytes) < 1 ||
      Number(inputRule.maxUtf8Bytes) > 8192 ||
      !Array.isArray(forbidden) ||
      !['tool', 'tools', 'sql', 'url', 'callback', 'authorization', 'secret'].every((key) =>
        forbidden.includes(key),
      ) ||
      (route.workload === 'financial_assistant' &&
        (!route.safetyRules.some(({ type }) => type === 'action_allowlist') ||
          !route.safetyRules.some(({ type }) => type === 'evidence_limit')))
    ) {
      throw new AiGatewayError('AI_ROUTE_POLICY_INVALID');
    }
  }

  private enterCircuit(): void {
    if (this.openUntil === 0) return;
    if (this.now() < this.openUntil || this.probing) {
      throw new AiGatewayError('AI_TEMPORARILY_UNAVAILABLE', true);
    }
    this.probing = true;
  }

  private onSuccess(): void {
    this.failures = [];
    this.openUntil = 0;
    this.probing = false;
  }

  private onFailure(retryable: boolean): void {
    this.probing = false;
    if (!retryable) return;
    const cutoff = this.now() - 60_000;
    this.failures = [...this.failures.filter((time) => time >= cutoff), this.now()];
    if (this.failures.length >= 5) this.openUntil = this.now() + 30_000;
  }
}

async function boundedText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new AiGatewayError('AI_SCHEMA_INVALID');
    }
    result += decoder.decode(value, { stream: true });
  }
}

function decimal(value: string): boolean {
  return /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/.test(value);
}

function accountingInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new AiGatewayError('AI_USAGE_ACCOUNTING_INCOMPLETE');
  return value;
}

function accountingNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new AiGatewayError('AI_USAGE_ACCOUNTING_INCOMPLETE');
  return value;
}
