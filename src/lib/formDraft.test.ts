import { describe, expect, it } from "vitest";
import { formDraftKey } from "./formDraft";
import { generationScope } from "./session";
describe("geração da base nos rascunhos", () => {
  const s = { user: "u", org: "o", mode: "base", form: "planned", record: "r" };
  it("sem geração mantém a chave anterior", () => { expect(formDraftKey(s)).toBe(`fluxo:form:v1:${JSON.stringify(["u","o","base","planned","r"])}`); expect(generationScope("oficial:u:o", undefined)).toBe("oficial:u:o"); });
  it("nova geração usa chave distinta e não lê rascunho antigo", () => { expect(formDraftKey({ ...s, generation: "xlsm-1" })).not.toBe(formDraftKey(s)); expect(generationScope("oficial:u:o", "xlsm-1")).toBe("oficial:u:o|gen:xlsm-1"); });
});
