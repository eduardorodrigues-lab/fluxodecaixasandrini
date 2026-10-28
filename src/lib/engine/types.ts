export type Profile = "legado" | "web";
export type Divisor = "30" | "dias";

export interface Params {
  profile: Profile;
  legacyReducer: number; // Excel antigo B2 (ex.: 0.25)
  webR1: number;
  webR2: number;
  divisorLegado: Divisor; // fórmulas conferidas: /30
  divisorWeb: Divisor; // web: dias reais do mês
  lagDays: number; // defasagem (dias corridos)
  startDate: string;
  saldoInicial: number; // centavos
  webExpenseUseExtension: boolean; // web original usa vencimento ORIGINAL de despesas
}

export interface Supplier { id: string; name: string; group: string; terms: (number | null)[] } // até 10; null = vazio
export type CategoryKind = "planejada" | "comprometida" | "despesa";
export interface Category { id: string; name: string; kind: CategoryKind; group: string }
export type Status = "ativo" | "cancelado";

export interface Planned {
  id: string; supplierId: string; purchaseCode: string; document: string; value: number;
  baseDate: string; categoryId: string; notes: string; status: Status;
}
// Compra realizada/comprometida: NÃO significa pagamento liquidado.
export interface Committed {
  id: string; supplierId: string; purchaseCode: string; document: string; value: number;
  dueDate: string; extensionDate: string | null; extensionInfo: string;
  legacyAbatement: number | null; // coluna M legado (base de abatimento) — importada, nunca inferida
  categoryId: string; notes: string; status: Status;
}
export interface Expense {
  id: string; supplierId: string; document: string; value: number; baseDate: string;
  termDays: number | null; // G: vazio = não distribui; 0 = data base
  extensionDate: string | null; categoryId: string; notes: string; status: Status;
}
export interface Receipt { id: string; date: string; platforms: Record<string, number | null>; general: number | null; notes: string }
export interface Adjustment { date: string; value: number | null; note: string } // value 0 é válido

export interface ScenarioData {
  params: Params;
  platforms: string[];
  suppliers: Supplier[];
  categories: Category[];
  targets: Record<string, number>; // "YYYY-MM" -> meta em centavos
  planned: Planned[];
  committed: Committed[];
  expenses: Expense[];
  receipts: Receipt[];
  adjustments: Adjustment[];
}

export type Severity = "info" | "alerta" | "erro";
export interface Warning { code: string; severity: Severity; message: string; refId?: string; date?: string }

export type ItemSource = "planejada" | "comprometida" | "despesa" | "recebimento" | "estimativa" | "ajuste";
export interface Item { source: ItemSource; refId?: string; label: string; amount: number; categoryId?: string; note?: string }

export interface Day {
  date: string;
  saldoInicial: number;
  ajuste: { value: number; diff: number; note: string } | null;
  recInformado: number;
  recInformadoPresente: boolean;
  recEstimado: number;
  recEstimadoExato: number;
  usouInformado: boolean;
  recUsado: number;
  planejada: number;
  comprometida: number;
  despesa: number;
  byCat: Record<string, number>;
  saidas: number;
  entradasTotal: number;
  saldoFinal: number;
  items: Item[];
}

export interface FlowResult {
  days: Day[];
  warnings: Warning[];
  filtered: boolean;
  kpis: { saldoFinal: number; menorSaldo: number; menorSaldoData: string; entradasSemSaldo: number; saidas: number };
}
