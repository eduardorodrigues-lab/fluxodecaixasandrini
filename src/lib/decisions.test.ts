import { describe, expect, it } from "vitest";
import { askConfirm, askText, finishDecision, subscribeDecisions, type DecisionRequest } from "./decisions";

describe("Decisões do usuário", () => {
  it("cancelar não autoriza a ação e confirmar a autoriza uma única vez", async () => {
    const requests: DecisionRequest[] = [];
    const stop = subscribeDecisions((r) => requests.push(r));
    const cancelled = askConfirm("Excluir simulação?");
    finishDecision(null);
    expect(await cancelled).toBe(false);
    const accepted = askConfirm("Excluir simulação?");
    finishDecision("confirmed");
    expect(await accepted).toBe(true);
    expect(requests).toHaveLength(2);
    stop();
  });
  it("justificativa pertence à operação selecionada e fila preserva a ordem", async () => {
    const requests: DecisionRequest[] = [];
    const stop = subscribeDecisions((r) => requests.push(r));
    const first = askText("Motivo do estorno desta baixa:");
    const second = askConfirm("Salvar observação?");
    expect(requests).toHaveLength(1);
    finishDecision("Baixa registrada incorretamente");
    expect(await first).toBe("Baixa registrada incorretamente");
    expect(requests).toHaveLength(2);
    finishDecision(null);
    expect(await second).toBe(false);
    stop();
  });
});