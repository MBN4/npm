import { describe, expect, it } from 'vitest';
import { safeJsonParse } from '../utils/json.js';

describe('safeJsonParse', () => {
  it('returns parsed data when the payload is valid JSON', () => {
    expect(safeJsonParse('{"ok":true}', { ok: false })).toEqual({ ok: true });
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('falls back when the payload is empty or malformed', () => {
    expect(safeJsonParse('', [])).toEqual([]);
    expect(safeJsonParse('{oops', [])).toEqual([]);
    expect(safeJsonParse('null', [])).toBeNull();
  });
});
