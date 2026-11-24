import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';

const PREFIX = 'sandrini:gzip-base64:';
// Small JSON stays compatible with existing callers and local recovery files.
export function encodeLargeJson(json: string): string {
  if (json.length < 1024 * 1024) return json;
  const bytes = gzipSync(strToU8(json), { level: 1 });
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return PREFIX + btoa(chunks.join(''));
}

export function decodeLargeJson(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const binary = atob(value.slice(PREFIX.length));
  return strFromU8(gunzipSync(Uint8Array.from(binary, character => character.charCodeAt(0))));
}

export function decodeOfficial<T extends { dataJson: string }>(response: T): T {
  return { ...response, dataJson: decodeLargeJson(response.dataJson) };
}

export function decodeConfirmation<T extends { opsJson: string }>(response: T | null): T | null {
  return response ? { ...response, opsJson: decodeLargeJson(response.opsJson) } : null;
}

export function decodeCommit<T extends { conflictsJson: string; receipt?: { changesJson: string } | undefined }>(response: T): T {
  return { ...response, conflictsJson: decodeLargeJson(response.conflictsJson),
    ...(response.receipt ? { receipt: { ...response.receipt, changesJson: decodeLargeJson(response.receipt.changesJson) } } : {}),
  };
}