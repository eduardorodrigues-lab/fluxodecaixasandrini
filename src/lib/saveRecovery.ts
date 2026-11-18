export type OperationPhase = 'reviewing' | 'sending' | 'checking' | 'confirmed' | 'conflict' | 'failed' | 'unknown';
export const operationPhaseLabel: Record<OperationPhase, string> = {
  reviewing: 'Revisando', sending: 'Enviando', checking: 'Aguardando confirmação',
  confirmed: 'Confirmado — atualizando a tela', conflict: 'Conflito',
  failed: 'Falha recuperável — envio recusado', unknown: 'Resultado desconhecido — preenchimento preservado',
};
/** Timeouts never cancel/authorize another write: the original packet stays protected. */
export async function bounded<T>(work: Promise<T>, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tempo de resposta excedido. O resultado será conferido sem reenviar.')), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
/** Only reads are retried. A missing audit row is NOT proof that a write failed. */
export async function pollConfirmation<T>(read: () => Promise<T | null>, delays = [0, 1000, 3000]): Promise<T | null> {
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try { const result = await bounded(read(), 5000); if (result) return result; }
    catch { /* network/timeout: preserve uncertainty and check within the bounded budget */ }
  }
  return null;
}