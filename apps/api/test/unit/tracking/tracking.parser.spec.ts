import {
  decodeTrackingUtf8,
  executeParserDefinition,
  parseTrackingCsv,
  validateParserDefinition,
} from '../../../src/tracking/tracking.parser';

describe('tracking hostile-input and parser boundary', () => {
  it('keeps the fictional hostile and corpus fixtures executable', () => {
    expect(parseTrackingCsv(readFileSync('test/fixtures/tracking/valid.csv'))).toHaveLength(2);
    expect(() => parseTrackingCsv(readFileSync('test/fixtures/tracking/formula.csv'))).toThrow(
      'UNSAFE_IMPORT',
    );
    const corpus = JSON.parse(
      readFileSync('test/fixtures/tracking/parser-corpus.json', 'utf8'),
    ) as { definition: unknown; input: Record<string, string>; expected: unknown };
    expect(executeParserDefinition(corpus.definition, corpus.input)).toEqual(corpus.expected);
  });

  it('accepts bounded UTF-8 CSV with RFC-4180 quoting', () => {
    const rows = parseTrackingCsv(
      Buffer.from('\ufeffsourceItemKey,body\r\nmsg-1,"Paid 12, SAR"\r\n'),
    );
    expect(rows).toEqual([{ sourceItemKey: 'msg-1', body: 'Paid 12, SAR' }]);
  });

  it('executes the constrained data-only parser deterministically', () => {
    const definition = {
      matches: [{ field: 'body', operator: 'safe_pattern', value: '^paid {amount} {currency}$' }],
      captures: [
        { field: 'amount', sourceGroup: 'amount' },
        { field: 'currency', sourceGroup: 'currency' },
      ],
      normalizations: [
        { field: 'amount', operation: 'localized_digits' },
        { field: 'amount', operation: 'minor_units' },
        { field: 'currency', operation: 'uppercase' },
      ],
      mappings: [
        { sourceField: 'amount', targetField: 'amount' },
        { sourceField: 'currency', targetField: 'currency' },
      ],
    };
    expect(validateParserDefinition(definition)).toEqual(definition);
    expect(executeParserDefinition(definition, { body: 'paid ١٢٠ sar' })).toEqual({
      amountMinor: 12000,
      currency: 'SAR',
    });
  });

  it.each([
    Buffer.from([0xff, 0xfe, 0x41, 0x00]),
    Buffer.from('a\0b'),
    Buffer.from('a\u202eb'),
    Buffer.alloc(6 * 1024 * 1024 + 1, 0x61),
    Buffer.from('PK\u0003\u0004archive'),
    Buffer.from('%PDF-1.7'),
    Buffer.from([0x1f, 0x8b, 0x08]),
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from('<?xml version="1.0"?>'),
  ])('rejects invalid, active, or oversized bytes %#', (bytes) => {
    expect(() => decodeTrackingUtf8(bytes)).toThrow('UNSAFE_IMPORT');
  });

  it('rejects spreadsheet formulas while allowing negative amounts', () => {
    expect(() => parseTrackingCsv(Buffer.from('sourceItemKey,body\n1,=CMD()\n'))).toThrow(
      'UNSAFE_IMPORT',
    );
    expect(parseTrackingCsv(Buffer.from('sourceItemKey,amountMinor\n1,-120\n'))).toEqual([
      { sourceItemKey: '1', amountMinor: '-120' },
    ]);
  });

  it.each([
    { matches: [], captures: [], normalizations: [], mappings: [], url: 'https://example.test' },
    { matches: [], captures: [], normalizations: [], mappings: [], code: 'process.env' },
    {
      matches: [{ field: 'body', operator: 'safe_pattern', value: '(a+)+$' }],
      captures: [],
      normalizations: [],
      mappings: [{ sourceField: 'amount', targetField: 'amount' }],
    },
    {
      matches: Array(13).fill({ field: 'body', operator: 'contains', value: 'x' }),
      captures: [],
      normalizations: [],
      mappings: [{ sourceField: 'amount', targetField: 'amount' }],
    },
  ])('rejects executable, networked, regex, or unbounded definitions %#', (definition) => {
    expect(() => validateParserDefinition(definition)).toThrow('UNSAFE_PARSER_DEFINITION');
  });
});
import { readFileSync } from 'node:fs';
