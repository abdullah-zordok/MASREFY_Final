import {
  DeterministicAttachmentScanner,
  frameClamAvStream,
  parseClamAvResponse,
} from '../../../src/engagement/support.scanner';

describe('support attachment scanner', () => {
  it('frames bounded INSTREAM chunks and terminates with a zero frame', () => {
    const framed = frameClamAvStream([Buffer.from('abc'), Buffer.from('de')], 5);
    expect(framed.subarray(0, 10).toString()).toBe('zINSTREAM\0');
    expect(framed.readUInt32BE(10)).toBe(3);
    expect(framed.subarray(-4)).toEqual(Buffer.alloc(4));
    expect(() => frameClamAvStream([Buffer.alloc(6)], 5)).toThrow('ATTACHMENT_SCAN_SIZE_EXCEEDED');
  });

  it('maps clean, malware, and malformed daemon outcomes safely', () => {
    expect(parseClamAvResponse('stream: OK\0')).toEqual({ status: 'clean' });
    expect(parseClamAvResponse('stream: Eicar-Signature FOUND\0')).toEqual({
      status: 'rejected',
      code: 'MALWARE_DETECTED',
    });
    expect(parseClamAvResponse('daemon unavailable')).toEqual({
      status: 'retryable',
      code: 'SCANNER_RESPONSE_INVALID',
    });
  });

  it('provides deterministic success, rejection, timeout, and recovery modes', async () => {
    await expect(
      new DeterministicAttachmentScanner('clean').scan(Buffer.from('safe')),
    ).resolves.toEqual({ status: 'clean' });
    await expect(
      new DeterministicAttachmentScanner('malware').scan(Buffer.from('fixture')),
    ).resolves.toEqual({ status: 'rejected', code: 'MALWARE_DETECTED' });
    await expect(
      new DeterministicAttachmentScanner('timeout').scan(Buffer.from('fixture')),
    ).resolves.toEqual({ status: 'retryable', code: 'SCANNER_TIMEOUT' });
  });
});
