const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_ROW_BYTES = 64 * 1024;
const MAX_CELL_BYTES = 8 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 256;

type JsonObject = Record<string, unknown>;
type MatchField = 'sender' | 'body' | 'language' | 'source';
type CaptureField = 'amount' | 'merchant' | 'category' | 'currency' | 'date' | 'direction' | 'type';
type Normalization =
  | 'minor_units'
  | 'localized_digits'
  | 'trim'
  | 'lowercase'
  | 'uppercase'
  | 'alias_map'
  | 'iso_date';

export interface ParserDefinition {
  matches: Array<{
    field: MatchField;
    operator: 'equals' | 'contains' | 'starts_with' | 'safe_pattern';
    value: string;
  }>;
  captures: Array<{ field: CaptureField; sourceGroup: string }>;
  normalizations: Array<{ field: CaptureField; operation: Normalization }>;
  mappings: Array<{ sourceField: CaptureField; targetField: CaptureField }>;
}

type Segment = { kind: 'literal'; value: string } | { kind: 'token'; value: string };
type Pattern = { start: boolean; end: boolean; segments: Segment[]; tokens: string[] };

function unsafeImport(): never {
  throw new Error('UNSAFE_IMPORT');
}

function unsafeDefinition(): never {
  throw new Error('UNSAFE_PARSER_DEFINITION');
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: JsonObject, fields: readonly string[]): void {
  if (Object.keys(value).some((key) => !fields.includes(key))) unsafeDefinition();
}

function bounded(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value, 'utf8') > max)
    unsafeDefinition();
  const normalized = value.normalize('NFKC');
  if (disallowedText(normalized)) unsafeDefinition();
  return normalized;
}

export function decodeTrackingUtf8(bytes: Buffer): string {
  if (bytes.length < 1 || bytes.length > MAX_FILE_BYTES) unsafeImport();
  if (
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff) ||
    bytes.subarray(0, 4).toString('binary') === 'PK\u0003\u0004' ||
    bytes.subarray(0, 5).toString('ascii') === '%PDF-' ||
    bytes.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) ||
    bytes.subarray(0, 6).toString('binary') === 'Rar!\u001a\u0007' ||
    bytes.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) ||
    bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
    bytes.subarray(0, 2).equals(Buffer.from([0x4d, 0x5a])) ||
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
  )
    unsafeImport();
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    unsafeImport();
  }
  decoded = decoded.replace(/^\uFEFF/u, '');
  if (!decoded || disallowedText(decoded) || decoded.trimStart().startsWith('<')) unsafeImport();
  return decoded;
}

export function parseTrackingCsv(bytes: Buffer): Array<Record<string, string>> {
  const input = decodeTrackingUtf8(bytes);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let rowBytes = 0;
  for (let index = 0; index <= input.length; index += 1) {
    const char = index === input.length ? '\n' : (input[index] ?? '');
    const next = input[index + 1];
    rowBytes += Buffer.byteLength(char, 'utf8');
    if (rowBytes > MAX_ROW_BYTES) unsafeImport();
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ',') {
      if (Buffer.byteLength(cell, 'utf8') > MAX_CELL_BYTES || formulaCell(cell)) unsafeImport();
      row.push(cell);
      cell = '';
    } else if (char === '\r' && next === '\n') continue;
    else if (char === '\n') {
      if (Buffer.byteLength(cell, 'utf8') > MAX_CELL_BYTES || formulaCell(cell)) unsafeImport();
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      if (rows.length > MAX_ROWS + 1) unsafeImport();
      row = [];
      cell = '';
      rowBytes = 0;
    } else cell += char;
  }
  if (quoted || rows.length < 2) unsafeImport();
  const headers = rows[0]?.map((header) => header.normalize('NFKC').trim()) ?? [];
  if (
    headers.length < 1 ||
    headers.length > MAX_COLUMNS ||
    headers.some((header) => !header || Buffer.byteLength(header, 'utf8') > 80) ||
    new Set(headers).size !== headers.length
  )
    unsafeImport();
  return rows.slice(1).map((values) => {
    if (values.length !== headers.length) unsafeImport();
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function formulaCell(value: string): boolean {
  const first = value.trimStart();
  return /^[=+@]/.test(first) || (/^-/.test(first) && !/^-\d+(?:\.\d+)?$/.test(first));
}

function depth(value: unknown, level = 0): number {
  if (level > 4) unsafeDefinition();
  if (Array.isArray(value))
    return value.reduce<number>((max, item) => Math.max(max, depth(item, level + 1)), level);
  if (isObject(value))
    return Object.values(value).reduce<number>(
      (max, item) => Math.max(max, depth(item, level + 1)),
      level,
    );
  return level;
}

function safePattern(source: unknown): Pattern {
  let value = bounded(source, 256);
  const start = value.startsWith('^');
  const end = value.endsWith('$') && !value.endsWith('\\$');
  if (start) value = value.slice(1);
  if (end) value = value.slice(0, -1);
  const segments: Segment[] = [];
  const tokens: string[] = [];
  let literal = '';
  const pushLiteral = () => {
    if (literal) segments.push({ kind: 'literal', value: literal });
    literal = '';
  };
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    if (character === '\\') {
      const escaped = value[index + 1];
      if (!escaped || !['{', '}', '^', '$', '\\'].includes(escaped)) unsafeDefinition();
      literal += escaped;
      index += 1;
    } else if (character === '{') {
      const close = value.indexOf('}', index + 1);
      if (close < 0) unsafeDefinition();
      const token = value.slice(index + 1, close);
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(token) || tokens.includes(token)) unsafeDefinition();
      pushLiteral();
      if (segments.at(-1)?.kind === 'token') unsafeDefinition();
      segments.push({ kind: 'token', value: token });
      tokens.push(token);
      if (tokens.length > 8) unsafeDefinition();
      index = close;
    } else {
      if (
        character === '}' ||
        character === '^' ||
        character === '$' ||
        /[()[\]|*+?]/.test(character)
      )
        unsafeDefinition();
      literal += character;
    }
  }
  pushLiteral();
  if (!segments.length) unsafeDefinition();
  return { start, end, segments, tokens };
}

export function validateParserDefinition(value: unknown): ParserDefinition {
  if (
    !isObject(value) ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > 8192 ||
    depth(value) > 4
  )
    unsafeDefinition();
  exact(value, ['matches', 'captures', 'normalizations', 'mappings']);
  if (
    !Array.isArray(value.matches) ||
    value.matches.length < 1 ||
    value.matches.length > 12 ||
    !Array.isArray(value.captures) ||
    value.captures.length > 12 ||
    !Array.isArray(value.normalizations) ||
    value.normalizations.length > 12 ||
    !Array.isArray(value.mappings) ||
    value.mappings.length < 1 ||
    value.mappings.length > 12
  )
    unsafeDefinition();
  const groups = new Set<string>();
  for (const entry of value.matches) {
    if (!isObject(entry)) unsafeDefinition();
    exact(entry, ['field', 'operator', 'value']);
    if (
      !['sender', 'body', 'language', 'source'].includes(String(entry.field)) ||
      !['equals', 'contains', 'starts_with', 'safe_pattern'].includes(String(entry.operator))
    )
      unsafeDefinition();
    if (entry.operator === 'safe_pattern') {
      for (const group of safePattern(entry.value).tokens) {
        if (groups.has(group)) unsafeDefinition();
        groups.add(group);
      }
    } else bounded(entry.value, 256);
  }
  const captureFields = new Set<string>();
  for (const entry of value.captures) {
    if (!isObject(entry)) unsafeDefinition();
    exact(entry, ['field', 'sourceGroup']);
    if (
      !['amount', 'merchant', 'category', 'currency', 'date', 'direction', 'type'].includes(
        String(entry.field),
      ) ||
      typeof entry.sourceGroup !== 'string' ||
      !groups.has(entry.sourceGroup) ||
      captureFields.has(String(entry.field))
    )
      unsafeDefinition();
    captureFields.add(String(entry.field));
  }
  const operations: Record<CaptureField, readonly Normalization[]> = {
    amount: ['minor_units', 'localized_digits'],
    merchant: ['trim', 'lowercase', 'alias_map'],
    category: ['trim', 'lowercase', 'alias_map'],
    currency: ['trim', 'uppercase', 'alias_map'],
    date: ['trim', 'iso_date', 'localized_digits'],
    direction: ['trim', 'lowercase', 'alias_map'],
    type: ['trim', 'lowercase', 'alias_map'],
  };
  for (const entry of value.normalizations) {
    if (!isObject(entry)) unsafeDefinition();
    exact(entry, ['field', 'operation']);
    if (
      !captureFields.has(String(entry.field)) ||
      !operations[entry.field as CaptureField].includes(entry.operation as Normalization)
    )
      unsafeDefinition();
  }
  const targets = new Set<string>();
  for (const entry of value.mappings) {
    if (!isObject(entry)) unsafeDefinition();
    exact(entry, ['sourceField', 'targetField']);
    if (
      !captureFields.has(String(entry.sourceField)) ||
      !['amount', 'merchant', 'category', 'currency', 'date', 'direction', 'type'].includes(
        String(entry.targetField),
      ) ||
      targets.has(String(entry.targetField))
    )
      unsafeDefinition();
    targets.add(String(entry.targetField));
  }
  if (
    /https?:\/\/|\beval\b|\bfunction\b|\bprocess\b|\brequire\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b/i.test(
      JSON.stringify(value),
    )
  )
    unsafeDefinition();
  return value as unknown as ParserDefinition;
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function patternMatch(pattern: Pattern, source: string): Record<string, string> | null {
  const original = normalized(source);
  const actual = original.toLocaleLowerCase('en');
  const groups: Record<string, string> = {};
  let cursor = 0;
  let pending: string | null = null;
  for (const segment of pattern.segments) {
    if (segment.kind === 'token') {
      pending = segment.value;
      continue;
    }
    const literal = segment.value.normalize('NFKC').replace(/\s+/gu, ' ').toLocaleLowerCase('en');
    const found = actual.indexOf(literal, cursor);
    if (found < 0 || (pattern.start && cursor === 0 && pending === null && found !== 0))
      return null;
    if (pending) {
      const captured = original.slice(cursor, found).trim();
      if (!captured || Buffer.byteLength(captured, 'utf8') > 512) return null;
      groups[pending] = captured;
      pending = null;
    }
    cursor = found + literal.length;
  }
  if (pending) {
    const captured = original.slice(cursor).trim();
    if (!captured || Buffer.byteLength(captured, 'utf8') > 512) return null;
    groups[pending] = captured;
    cursor = actual.length;
  }
  return pattern.end && cursor !== actual.length ? null : groups;
}

function digits(value: string): string {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return Array.from(value)
    .map((character) => {
      const left = arabic.indexOf(character);
      if (left >= 0) return String(left);
      const right = persian.indexOf(character);
      return right >= 0 ? String(right) : character;
    })
    .join('');
}

function normalizeCaptured(
  value: string | number,
  operation: Normalization,
  fields: ReadonlyMap<CaptureField, string | number>,
): string | number {
  if (operation === 'localized_digits') return digits(String(value));
  if (operation === 'trim') return normalized(String(value));
  if (operation === 'lowercase') return String(value).toLocaleLowerCase('en');
  if (operation === 'uppercase') return String(value).toLocaleUpperCase('en');
  if (operation === 'alias_map') return value;
  if (operation === 'iso_date') {
    const candidate = digits(String(value));
    if (!/(?:Z|[+-]\d\d:\d\d)$/i.test(candidate)) unsafeDefinition();
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.valueOf())) unsafeDefinition();
    return parsed.toISOString();
  }
  const candidate = digits(String(value));
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(candidate)) unsafeDefinition();
  const [whole, fraction = ''] = candidate.split('.');
  const currency = String(fields.get('currency') ?? '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) unsafeDefinition();
  const minorDigits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  if (minorDigits > 3 || fraction.length > minorDigits) unsafeDefinition();
  const sign = whole?.startsWith('-') ? -1 : 1;
  const factor = 10 ** minorDigits;
  const minor = Number(whole) * factor + sign * Number(fraction.padEnd(minorDigits, '0'));
  if (!Number.isSafeInteger(minor) || minor === 0) unsafeDefinition();
  return minor;
}

export function executeParserDefinition(
  value: unknown,
  source: Record<string, string>,
): Record<string, unknown> {
  const startedAt = performance.now();
  const definition = validateParserDefinition(value);
  const groups: Record<string, string> = {};
  for (const clause of definition.matches) {
    const actual = normalized(source[clause.field] ?? '');
    const expected = normalized(clause.value);
    if (
      clause.operator === 'equals' &&
      actual.toLocaleLowerCase('en') !== expected.toLocaleLowerCase('en')
    )
      return {};
    if (
      clause.operator === 'contains' &&
      !actual.toLocaleLowerCase('en').includes(expected.toLocaleLowerCase('en'))
    )
      return {};
    if (
      clause.operator === 'starts_with' &&
      !actual.toLocaleLowerCase('en').startsWith(expected.toLocaleLowerCase('en'))
    )
      return {};
    if (clause.operator === 'safe_pattern') {
      const captured = patternMatch(safePattern(clause.value), actual);
      if (!captured) return {};
      Object.assign(groups, captured);
    }
  }
  const fields = new Map<CaptureField, string | number>();
  for (const capture of definition.captures) {
    const captured = groups[capture.sourceGroup];
    if (captured == null) unsafeDefinition();
    fields.set(capture.field, captured);
  }
  for (const item of definition.normalizations) {
    const current = fields.get(item.field);
    if (current == null) unsafeDefinition();
    fields.set(item.field, normalizeCaptured(current, item.operation, fields));
  }
  const names: Record<CaptureField, string> = {
    amount: 'amountMinor',
    merchant: 'merchant',
    category: 'category',
    currency: 'currency',
    date: 'occurredAt',
    direction: 'direction',
    type: 'kind',
  };
  const result: Record<string, unknown> = {};
  for (const mapping of definition.mappings) {
    const output = fields.get(mapping.sourceField);
    if (output == null) unsafeDefinition();
    result[names[mapping.targetField]] = output;
  }
  if (performance.now() - startedAt > 25) throw new Error('PARSER_BUDGET_EXCEEDED');
  return result;
}

function disallowedText(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      return true;
  }
  return false;
}
