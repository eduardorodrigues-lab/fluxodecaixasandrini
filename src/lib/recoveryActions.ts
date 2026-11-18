import type { ReviewedOperation } from './operationSave';

export function definitiveRejection(op: ReviewedOperation) {
  return op.rejected === true && (op.phase === 'conflict' || op.phase === 'failed') && !op.confirmation;
}
export function confirmationBlockReason(op: ReviewedOperation, access: { authenticated: boolean; authorized: boolean; busy: boolean; online: boolean }) {
  if (!access.authenticated) return 'Entre novamente para consultar. O pacote permanece neste navegador.';
  if (!access.authorized) return 'Aguarde a conferência do acesso à organização original. Nenhuma consulta ou gravação foi feita.';
  if (!access.online) return 'Sem conexão. Reconecte para consultar; o pacote e o preenchimento permanecem preservados.';
  if (access.busy) return 'Consulta ou confirmação em andamento. Aguarde seu resultado antes de consultar novamente.';
  if (!/^[0-9a-f-]{36}$/i.test(op.requestId ?? '')) return 'Pacote legado sem requestId válido. Exporte a revisão para recuperação; não é possível identificar o envio no servidor.';
  return '';
}