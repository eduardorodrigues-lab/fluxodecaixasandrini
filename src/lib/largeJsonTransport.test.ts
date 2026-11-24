import { describe, expect, it } from 'vitest';
import { encodeLargeJson, decodeLargeJson, decodeOfficial, decodeConfirmation, decodeCommit } from './largeJsonTransport';
import { patchDigest } from './commitReceipt';

describe('large RPC responses', () => {
  const json = JSON.stringify([{ id: '0001', amount: 0, before: 'Descrição 🚚 '.repeat(2100000), after: null }]);
  it('roundtrips official data larger than 32 MiB without altering values or metadata', () => {
    expect(new TextEncoder().encode(json).length).toBeGreaterThan(32 * 1024 * 1024);
    const response = { version: 189, orgId: 'org', dataJson: encodeLargeJson(json) };
    expect(response.dataJson.length).toBeLessThan(32 * 1024 * 1024);
    expect(decodeOfficial(response)).toEqual({ ...response, dataJson: json });
  });
  it('restores all confirmation changes with exact version and null absence', () => {
    expect(decodeConfirmation({ version: 189, opsJson: encodeLargeJson(json) })).toEqual({ version: 189, opsJson: json });
    expect(decodeConfirmation(null)).toBeNull();
  });
  it('restores complete conflicts and receipts before canonical digest verification', async () => {
    const digest = await patchDigest(json);
    const result = decodeCommit({ status: 'ok', version: 190, conflictsJson: encodeLargeJson(json),
      receipt: { changesJson: encodeLargeJson(json), digest, requestId: 'same-request' } });
    expect(result.conflictsJson).toBe(json);
    expect(result.receipt.changesJson).toBe(json);
    expect(await patchDigest(result.receipt.changesJson)).toBe(digest);
    expect(result.receipt.requestId).toBe('same-request');
  });
  it('preserves small/legacy JSON and rejects corrupt compressed responses', () => {
    expect(encodeLargeJson('[]')).toBe('[]');
    expect(decodeLargeJson('{"amount":0}')).toBe('{"amount":0}');
    expect(decodeCommit({ conflictsJson: '[]' })).toEqual({ conflictsJson: '[]' });
    expect(() => decodeLargeJson('sandrini:gzip-base64:broken')).toThrow();
  });
});