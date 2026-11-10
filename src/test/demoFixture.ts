import { normalizeData } from "../lib/engine/actions";
import type { ScenarioData } from "../lib/engine/types";

// DADOS DEMONSTRATIVOS — fictícios, não importados dos arquivos reais.
export function demoData(): ScenarioData {
  return normalizeData({
    params: {
      profile: "legado", legacyReducer: 0.25, webR1: 0.25, webR2: 0.18,
      divisorLegado: "30", divisorWeb: "dias", lagDays: 10,
      startDate: "2026-10-01", saldoInicial: 18000000,
    },
    platforms: ["Plataforma A", "Plataforma B", "Plataforma C"],
    suppliers: [
      { id: "s1", name: "DEMO Têxtil Alfa", group: "Tecidos", terms: [30, 60, 90, null, null, null, null, null, null, null] },
      { id: "s2", name: "DEMO Aviamentos Beta", group: "Aviamentos", terms: [28, 56, null, null, null, null, null, null, null, null] },
      { id: "s3", name: "DEMO Confecção Gama", group: "Confecção", terms: [0, 30, 60, null, null, null, null, null, null, null] },
      { id: "s4", name: "DEMO Serviços Delta", group: "Serviços", terms: [15, null, null, null, null, null, null, null, null, null] },
    ],
    categories: [
      { id: "c1", name: "Mercadorias para revenda", kind: "compra", group: "Compras" },
      { id: "c2", name: "Mercadorias para revenda", kind: "compra", group: "Compras" }, // mesmo nome: subgrupos mesclam por nome
      { id: "c3", name: "Aluguel", kind: "despesa", group: "Ocupação" },
      { id: "c4", name: "Fretes", kind: "despesa", group: "Logística" },
      { id: "c5", name: "Serviços terceiros", kind: "despesa", group: "Serviços" },
    ],
    targets: { "2026-09": 25000000, "2026-10": 27300000, "2026-11": 31000000, "2026-12": 42000000, "2027-01": 22000000 },
    planned: [
      { id: "p1", supplierId: "s1", purchaseCode: "DEMO-C100", document: "OC-100", value: 9000000, baseDate: "2026-10-05", categoryId: "c1", notes: "Demonstrativo", status: "ativo" },
      { id: "p2", supplierId: "s2", purchaseCode: "DEMO-C200", document: "OC-200", value: 1000000, baseDate: "2026-10-10", categoryId: "c1", notes: "Exemplo 3 parcelas", status: "ativo" },
      { id: "p3", supplierId: "s3", purchaseCode: "DEMO-C300", document: "OC-300", value: 4500000, baseDate: "2026-10-20", categoryId: "c1", notes: "Vínculo com M ausente", status: "ativo" },
    ],
    committed: [
      { id: "e1", supplierId: "s1", purchaseCode: "DEMO-C100", document: "NF-5001", value: 3000000, dueDate: "2026-11-04", extensionDate: null, extensionInfo: "", legacyAbatement: 3000000, categoryId: "c2", notes: "", status: "ativo" },
      { id: "e2", supplierId: "s3", purchaseCode: "DEMO-C300", document: "NF-7001", value: 1500000, dueDate: "2026-10-25", extensionDate: "2026-11-05", extensionInfo: "informativo K", legacyAbatement: null, categoryId: "c2", notes: "Sem M importado", status: "ativo" },
    ],
    expenses: [
      { id: "d1", supplierId: "s4", document: "ALUGUEL-10", value: 1200000, baseDate: "2026-10-01", termDays: 9, extensionDate: null, categoryId: "c3", notes: "", status: "ativo" },
      { id: "d2", supplierId: "s4", document: "FRETE-77", value: 230000, baseDate: "2026-10-12", termDays: 0, extensionDate: "2026-10-20", categoryId: "c4", notes: "G=0 → data base", status: "ativo" },
      { id: "d3", supplierId: "s4", document: "SERV-31", value: 480000, baseDate: "2026-10-15", termDays: null, extensionDate: null, categoryId: "c5", notes: "Prazo vazio: não distribui", status: "ativo" },
    ],
    receipts: [
      { id: "r1", date: "2026-10-02", platforms: { "Plataforma A": 250000, "Plataforma B": 180000 }, general: null, notes: "" },
      { id: "r2", date: "2026-10-03", platforms: {}, general: 600000, notes: "" },
      { id: "r3", date: "2026-10-05", platforms: { "Plataforma A": 120000 }, general: 300000, notes: "Exemplo dupla contagem" },
      { id: "r4", date: "2026-10-06", platforms: {}, general: 0, notes: "Zero CONFIRMADO → não usa estimativa" },
    ],
    adjustments: [{ date: "2026-10-15", value: 15000000, note: "Conferência bancária (demo)" }],
    payments: [{ id: "pg1", titleKind: "committed", titleId: "e1", date: "2026-10-20", amount: 1000000, note: "baixa parcial (demo)", reversedAt: null, reversalNote: "" }],
  });
}
