export interface DecisionOptions {
  title: string; message: string; action: string; destructive?: boolean;
  input?: { label: string; initial?: string; type?: "text" | "date" };
  notice?: boolean;
}
export interface DecisionRequest extends DecisionOptions { resolve: (value: string | null) => void }
const queue: DecisionRequest[] = [];
let listener: ((request: DecisionRequest) => void) | undefined;
export function subscribeDecisions(fn: (request: DecisionRequest) => void) {
  listener = fn;
  if (queue[0]) fn(queue[0]);
  return () => { listener = undefined; };
}
export function finishDecision(value: string | null) {
  const request = queue.shift();
  request?.resolve(value);
  if (queue[0]) listener?.(queue[0]);
}
export function requestDecision(options: DecisionOptions): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ ...options, resolve });
    const first = queue[0];
    if (queue.length === 1 && first) listener?.(first);
  });
}
// Shared vocabulary for migrated requests; callers can override with record-specific copy.
function wording(message: string) {
  const text = message.toLocaleLowerCase("pt-BR");
  const actions: [string, string][] = [["excluir simulação", "Excluir simulação"], ["excluir", "Excluir"], ["remover a meta", "Remover meta"], ["estorno", "Estornar"], ["reversão", "Reverter"], ["reabr", "Reabrir"], ["encerramento", "Encerrar restante"], ["inativação", "Inativar"], ["repasse residual", "Registrar repasse residual"], ["descartar", "Descartar"], ["sair", "Sair"], ["trocar de organização", "Trocar organização"], ["revogar", "Revogar acesso"], ["saldo inicial", "Confirmar transição"], ["salvar", "Salvar"], ["observação", "Salvar observação"], ["vínculo", "Trocar tipo"]];
  const action = actions.find(([key]) => text.includes(key))?.[1] ?? "Confirmar alteração";
  return { title: `${action}?`, action, destructive: /excluir|remover|estornar|reverter|inativar|descartar|revogar|encerrar/.test(action.toLowerCase()) };
}
export async function askConfirm(message: string, options?: Partial<DecisionOptions>) {
  return (await requestDecision({ ...wording(message), message, ...options })) !== null;
}
export function askText(message: string, initial = "", options?: Partial<DecisionOptions>) {
  return requestDecision({ ...wording(message), message, input: { label: "Justificativa", initial }, ...options });
}
export function showMessage(message: string) {
  return requestDecision({ title: "Resultado da operação", message, action: "Fechar", notice: true });
}