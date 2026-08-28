import type { LoggerService } from '@nestjs/common';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SafeLogFields {
  context?: string;
  requestId?: string;
  eventName?: string;
  code?: string;
  processKind?: string;
  version?: string;
  state?: string;
}

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const sensitiveKey = /authorization|cookie|credential|database.?url|password|secret|token|email|phone|session|subject|fingerprint|payload|cipher|otp|jwt/i;
const sensitiveValue = /(?:bearer\s+\S+|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+[1-9][0-9]{7,14}|(?:sk|whsec)_(?:test|live)?_?[A-Za-z0-9_-]+)/gi;

export function redactSensitive(value: unknown, key = ''): unknown {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return value.replace(sensitiveValue, '[REDACTED]');
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSensitive(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export class PlatformLogger implements LoggerService {
  constructor(
    private readonly writer: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
    private readonly minimumLevel: LogLevel = 'info',
  ) {}

  debug(message: unknown, fields?: SafeLogFields): void {
    this.write('debug', message, fields);
  }

  log(message: unknown, fields?: SafeLogFields): void {
    this.info(message, fields);
  }

  info(message: unknown, fields?: SafeLogFields): void {
    this.write('info', message, fields);
  }

  warn(message: unknown, fields?: SafeLogFields): void {
    this.write('warn', message, fields);
  }

  error(message: unknown, fields?: SafeLogFields): void {
    this.write('error', message, fields);
  }

  private write(level: LogLevel, message: unknown, fields: SafeLogFields = {}): void {
    if (levels[level] < levels[this.minimumLevel]) return;
    const record = redactSensitive({
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message.slice(0, 256) : 'non_string_message',
      ...fields,
    });
    this.writer(JSON.stringify(record));
  }
}
