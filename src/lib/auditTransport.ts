import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate';
import type { Change } from './diff';

export interface AuditRecord {
  id: string;
  at: string;
  user_email: string | null;
  version_from: number;
  version_to: number;
  summary: string;
  changes: unknown;
}

export interface AuditPayload { encoding: 'gzip-base64'; payload: string }

// A single replacement audit can exceed Start's 32 MiB serialization limit.
// Compress the complete projection, not snapshots or truncated change lists.
export function encodeAudit(records: readonly AuditRecord[]): AuditPayload {
  const bytes = gzipSync(strToU8(JSON.stringify(records)), { level: 1 });
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  const payload = btoa(chunks.join(''));
  if (payload.length > 24 * 1024 * 1024) {
    throw new Error('Histórico excedeu o limite de leitura. Nenhum registro foi removido.');
  }
  return { encoding: 'gzip-base64', payload };
}

export function decodeAudit(response: AuditPayload): (Omit<AuditRecord, 'changes'> & { changes: Change[] })[] {
  if (response.encoding !== 'gzip-base64') throw new Error('Formato de histórico inválido.');
  const binary = atob(response.payload);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const records: unknown = JSON.parse(strFromU8(gunzipSync(bytes)));
  if (!Array.isArray(records) || records.some(record => !record || !Array.isArray(record.changes))) {
    throw new Error('Histórico inválido. Tente novamente.');
  }
  return records;
}