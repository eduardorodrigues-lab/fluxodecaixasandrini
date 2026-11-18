export type OperationPhase = 'reviewing' | 'sending' | 'checking' | 'confirmed' | 'conflict' | 'failed' | 'unknown';
export const operationPhaseLabel: Record<OperationPhase, string> = {
  reviewing: 'Revisando', sending: 'Enviando', checking: 'Aguardando confirmação',
  confirmed: 'Confirmado — atualizando a tela', conflict: 'Conflito',
  failed: 'Falha recuperável — envio recusado', unknown: 'Resultado desconhecido — preenchimento preservado',
};
export function confirmationAction(saving: boolean, phase: OperationPhase | undefined, submitted: boolean, initial = 'Confirmar e salvar') {
  if (saving) return phase === 'checking' ? 'Consultando confirmação…' : phase === 'confirmed' ? 'Confirmado — atualizando…' : 'Enviando…';
  return submitted ? 'Consultar resultado' : initial;
}
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
export async function pollConfirmation<T>(read: () => Promise<T | null>, delays = [0, 1000, 3000], active = () => true): Promise<T | null> {
  for (const delay of delays) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (!active()) return null;
    try { const result = await bounded(read(), 5000); if (result) return result; }
    catch { /* network/timeout: preserve uncertainty and check within the bounded budget */ }
  }
  return null;
}

/** Keep the original response alive after timeout; recovery never submits another write. */
export async function confirmSubmission<T>(submission: Promise<T>, read: () => Promise<T | null>, ms = 20_000, waiting = async () => {}): Promise<T | null> {
  try { return await bounded(submission, ms); }
  catch {
    await waiting();
    let active = true;
    try {
      return await Promise.race([
        submission.catch(() => new Promise<never>(() => {})),
        pollConfirmation(read, [0, 1000, 3000], () => active),
      ]);
    } finally { active = false; }
  }
}