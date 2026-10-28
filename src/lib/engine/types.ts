export type Profile = "legado" | "web";
export type Divisor = "30" | "dias";

export interface Params {
  profile: Profile;
  legacyReducer: number; // Excel antigo B2 (ex.: 0.25) — redutor global
  webR1: number;
  webR2: number;
  divisorLegado: Divisor; // fórmulas conferidas: /30
  divisorWeb: Divisor; // web: dias reais do mês
  lagDays: number; // defasagem (dias corridos)
  startDate: string;
  saldoInicial: number; // centavos
}

export interface Supplier { id: string; name: string; group: string; terms: (number | null)[] } // até 10; null = vazio
export type CategoryKind = "planejada" | "comprometida" | "despesa";
export interface Category { id: string; name: string; kind: CategoryKind; group: string }
export type Status = "ativo" | "cancelado";
export interface Origin { file: string; sheet: string; row: number }
export interface ExtensionEvent { from: string | null; to: string | null; at: string; note: string }

// PLANEJADO = previsão. Não é compra nem pagamento.
export interface Planned {
  id: string; supplierId: string; purchaseCode: string; document: string; value: number;
  baseDate: string; categoryId: string; notes: string;
  status: Status | "encerrado"; // encerrado = efetivação concluída encerrou o saldo previsto
  remainingOverride: { value: number; dates: string[] } | null; // restante confirmado após efetivação parcial
  terms?: (number | null)[] | null; // prazos F:O da própria linha (importados); null = usa os do fornecedor
  origin?: Origin | null;
}
// EFETIVADO/REALIZADO = compra real ou pedido. NÃO é pagamento (ver payments).
export type CommittedOrigin = "legado" | "efetivacao" | "manual";
export interface Committed {
  id: string; supplierId: string; purchaseCode: string; document: string; value: number;
  dueDate: string; // vencimento original (preservado)
  extensionDate: string | null; // prorrogação CONFIRMADA (altera programação oficial)
  extensionHistory: ExtensionEvent[];
  extensionInfo: string; // campo K — apenas informativo
  legacyAbatement: number | null; // coluna M legado — importada, nunca inferida; só usada quando origin="legado"
  origin: CommittedOrigin; plannedId: string | null; effectivationId: string | null;
  categoryId: string; notes: string; status: Status; importOrigin?: Origin | null;
}
export interface Expense {
  id: string; supplierId: string; document: string; value: number; baseDate: string;
  termDays: number | null; // G: vazio = não distribui; 0 = data base
  extensionDate: string | null; extensionHistory: ExtensionEvent[];
  categoryId: string; notes: string; status: Status; importOrigin?: Origin | null;
}
export interface Effectivation {
  id: string; plannedId: string; at: string; kind: "parcial" | "concluida"; value: number;
  committedIds: string[];
  linkedLegacy?: boolean; // efetivação que reclassificou um título legado existente (sem criar novo)
  prev: { status: Planned["status"]; remainingOverride: Planned["remainingOverride"] };
  reversedAt: string | null; reversalNote: string;
}
// Baixa = registro de pagamento realizado (NÃO é transferência bancária).
export interface Payment {
  id: string; titleKind: "committed" | "expense"; titleId: string; date: string; amount: number;
  note: string; reversedAt: string | null; reversalNote: string;
}
// Plataforma: ID estável; nome editável; vigência [start, end]. Nunca excluída fisicamente se referenciada.
export interface Platform { id: string; name: string; start: string; end: string | null; importedCode: string | null; history: { at: string; field: string; from: unknown; to: unknown; note: string }[] }
// Recebimento: valores por ID de plataforma. residual[id] = repasse APÓS inativação, exceção explícita com nota.
export interface Receipt { id: string; date: string; platforms: Record<string, number | null>; general: number | null; notes: string; residual?: Record<string, { note: string; at: string }> }
// Meta mensal versionada: valores próprios do mês; parâmetros gerais são só default na criação.
export type R2Base = "apos_r1" | "bruto";
export interface MonthTarget {
  gross: number; // faturamento bruto (centavos)
  legacyReducer: number; divisorLegado: Divisor; // perfil Excel legado: redutor único sobre o bruto
  webR1: number; webR2: number; r2Base: R2Base; divisorWeb: Divisor; // perfil Web
  lagDays: number; // defasagem aplicada aos dias de fluxo DESTE mês civil
  version: number; history: { at: string; version: number; before: Omit<MonthTarget, "history"> | null; note: string }[];
}
export interface Adjustment { date: string; value: number | null; note: string } // value 0 é válido
export interface ImportLogEntry { entity: string; key: string; hash: string; refId: string; at: string; origin?: Origin | null }

export interface ScenarioData {
  params: Params;
  platforms: Platform[];
  suppliers: Supplier[];
  categories: Category[];
  targets: Record<string, number>; // espelho do bruto (compatibilidade/importação)
  targetConfigs: Record<string, MonthTarget>; // fonte do cálculo por mês
  planned: Planned[];
  committed: Committed[];
  expenses: Expense[];
  effectivations: Effectivation[];
  payments: Payment[];
  receipts: Receipt[];
  adjustments: Adjustment[];
  importLog: ImportLogEntry[];
}

export type Severity = "info" | "alerta" | "erro";
export interface Warning { code: string; severity: Severity; message: string; refId?: string; date?: string }

export type ItemSource = "planejada" | "comprometida" | "despesa" | "recebimento" | "estimativa" | "ajuste";
export interface Item { source: ItemSource; refId?: string; label: string; amount: number; categoryId?: string; note?: string; paid?: boolean }

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
