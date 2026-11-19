import { describe, expect, it } from "vitest";
import { prepareCommit, settleAfterRecheck } from "./commitCore";
import { emptyData } from "./engine/actions";
import { diffData } from "./diff";

describe("commitCore (etapa pura do servidor)", () => {
  it("conflito/sem mudança/corrida de versão viram 'duplicate' quando a auditoria já tem o mesmo requestId", () => {
    for (const status of ["conflict", "noop", "retry"]) expect(settleAfterRecheck({ status, version: 3, conflictsJson: "x" }, { version_to: 7 })).toEqual({ status: "duplicate", version: 7, conflictsJson: "[]" });
  });
  it("sem registro na auditoria o resultado não é convertido em sucesso", () => {
    expect(settleAfterRecheck({ status: "retry", version: 3 }, null)).toEqual({ status: "retry", version: 3 });
    expect(settleAfterRecheck({ status: "ok", version: 4 }, { version_to: 4 })).toEqual({ status: "ok", version: 4 });
  });
  it("prepara transição canônica e a mesma inclusão reaplicada não cria segundo fornecedor", async () => {
    const base = emptyData();
    const after = { ...base, suppliers: [{ id: "s-new", name: "FORNECEDOR INLINE", group: "", terms: [], aliases: [], note: "" }] };
    const ops = diffData(base, after);
    const ready = await prepareCommit(base, "org", "req", ops);
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") return;
    expect(ready.next.suppliers.map((s) => s.id)).toEqual(["s-new"]);
    expect(ready.digest).toMatch(/\w+/);
    const again = await prepareCommit(ready.next, "org", "req", ops);
    expect(again.status).toBe("noop");
  });
});
