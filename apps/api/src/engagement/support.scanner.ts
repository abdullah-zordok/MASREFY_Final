import { createConnection } from 'node:net';

export type ScanResult = { status: 'clean' } | { status: 'rejected' | 'retryable'; code: string };

export interface AttachmentScanner {
  scan(content: Buffer): Promise<ScanResult>;
}

export function frameClamAvStream(chunks: readonly Buffer[], maximumBytes: number): Buffer {
  let bytes = 0;
  const frames: Buffer[] = [Buffer.from('zINSTREAM\0')];
  for (const chunk of chunks) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new Error('ATTACHMENT_SCAN_SIZE_EXCEEDED');
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(chunk.length);
    frames.push(length, chunk);
  }
  frames.push(Buffer.alloc(4));
  return Buffer.concat(frames);
}

export function parseClamAvResponse(response: string): ScanResult {
  const value = response.replaceAll('\0', '').trim();
  if (/^stream: OK$/.test(value)) return { status: 'clean' };
  if (/^stream: .{1,200} FOUND$/.test(value))
    return { status: 'rejected', code: 'MALWARE_DETECTED' };
  return { status: 'retryable', code: 'SCANNER_RESPONSE_INVALID' };
}

export class DeterministicAttachmentScanner implements AttachmentScanner {
  constructor(private readonly mode: 'clean' | 'malware' | 'timeout') {}
  scan(content: Buffer): Promise<ScanResult> {
    if (content.length === 0)
      return Promise.resolve({ status: 'rejected', code: 'ATTACHMENT_EMPTY' });
    if (this.mode === 'clean') return Promise.resolve({ status: 'clean' });
    if (this.mode === 'malware')
      return Promise.resolve({ status: 'rejected', code: 'MALWARE_DETECTED' });
    return Promise.resolve({ status: 'retryable', code: 'SCANNER_TIMEOUT' });
  }
}

export class ClamAvAttachmentScanner implements AttachmentScanner {
  constructor(
    private readonly host: string,
    private readonly port = 3310,
    private readonly timeoutMs = 5_000,
    private readonly maximumBytes = 10_485_760,
  ) {}

  scan(content: Buffer): Promise<ScanResult> {
    let framed: Buffer;
    try {
      framed = frameClamAvStream([content], this.maximumBytes);
    } catch {
      return Promise.resolve({ status: 'rejected', code: 'ATTACHMENT_TOO_LARGE' });
    }
    return new Promise((resolve) => {
      const socket = createConnection({ host: this.host, port: this.port });
      let response = '',
        settled = false;
      const done = (result: ScanResult) => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(result);
        }
      };
      socket.setTimeout(this.timeoutMs);
      socket.once('connect', () => {
        socket.end(framed);
      });
      socket.on('data', (chunk: Buffer) => {
        if (response.length + chunk.length > 1024)
          done({ status: 'retryable', code: 'SCANNER_RESPONSE_INVALID' });
        else response += chunk.toString('utf8');
      });
      socket.once('end', () => {
        done(parseClamAvResponse(response));
      });
      socket.once('timeout', () => {
        done({ status: 'retryable', code: 'SCANNER_TIMEOUT' });
      });
      socket.once('error', () => {
        done({ status: 'retryable', code: 'SCANNER_UNAVAILABLE' });
      });
    });
  }
}
