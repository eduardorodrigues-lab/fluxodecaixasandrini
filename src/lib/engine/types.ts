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
  // Saldo inicial do fluxo: "legado" = saldoInicial acima (regra Excel); "contas" = soma dos saldos realizados das contas
  // na data inicial. Só muda por transição revisada/confirmada (bankTransition). Nunca soma os dois.
  openingMode?: "legado" | "contas";
  bankTransition?: { at: string; by: string; legacyValue: number; accountsValue: number; note: string } | null;
}

export interface ConditionPeriod { from: string | null; at: string; by: string; cancelled?: { at: string; by: string; reason: string } }
export interface SupplierCondition { id: string; name: string; terms: (number | null)[]; from: string | null; at: string; by: string; note?: string; periods?: ConditionPeriod[]; cancelled?: { at: string; by: string; reason: string }; history?: { at: string; by: string; action: string; name: string; terms: (number | null)[]; note: string; reason: string }[] } // versões anteriores e cancelamentos preservados
export interface Supplier { id: string; name: string; group: string; terms: (number | null)[]; termsHistory?: { at: string; terms: (number | null)[] }[]; conditions?: SupplierCondition[]; note?: string; aliases?: string[]; activity?: { active: boolean; from: string; at: string; by: string }[] } // terms = condição vigente (usada pelo motor)
// Categoria = etapa NÃO: é a natureza do lançamento (Compra ou Despesa). Cada Category é um SUBGRUPO
// (ex.: "Energia elétrica"); planejada/efetuada são etapas do lançamento, não categorias.
export type CategoryKind = "compra" | "despesa";
export interface Category { id: string; name: string; kind: CategoryKind; group: string }
export type Status = "ativo" | "cancelado";
export interface Origin { file: string; sheet: string; row: number }
export interface ExtensionEvent { from: string | null; to: string | null; at: string; note: string }

// PLANEJADO = previsão. Não é compra nem pagamento.
export interface Planned {
  id: string; supplierId: string; purchaseCode: string; document: string; value: number;
  baseDate: string; categoryId: string; notes: string;
  condition?: { name: string; terms: (number | null)[] } | null; // condição usada na previsão (histórico)
  status: Status | "encerrado"; // encerrado = efetivação concluída encerrou o saldo previsto
  remainingOverride: { value: number; dates: string[] } | null; // restante confirmado após efetivação parcial
  terms?: (number | null)[] | null; // prazos F:O da própria linha (importados); null = usa os do fornecedor
  origin?: Origin | null;
  installments?: PlannedInstallment[] | null; // parcelas próprias (painel Nova nota); null = prazos
}
export interface PlannedInstallment { amount: number; date: string; extensionDate: string | null; extensionHistory: ExtensionEvent[] }
export interface NoteRef { noteId?: string; parcelNo?: number; parcelCount?: number }
// EFETIVADO/REALIZADO = compra real ou pedido. NÃO é pagamento (ver payments).
export type CommittedOrigin = "legado" | "efetivacao" | "manual";
export interface Committed {
  id: string; supplierId: string; purchaseCode: string; document: string; value: number;
  dueDate: string; // vencimento original (preservado)
  condition?: { name: string; terms: (number | null)[] } | null; // condição real confirmada na efetivação/criação
  extensionDate: string | null; // prorrogação CONFIRMADA (altera programação oficial)
  extensionHistory: ExtensionEvent[];
  extensionInfo: string; // campo K — apenas informativo
  legacyAbatement: number | null; // coluna M legado — importada, nunca inferida; só usada quando origin="legado"
  origin: CommittedOrigin; plannedId: string | null; effectivationId: string | null;
  categoryId: string; notes: string; status: Status; importOrigin?: Origin | null;
  paymentUnconfirmed?: boolean; // importado sem informação de pagamento: "situação a confirmar" (não é aberto validado nem pago)
  noteId?: string; parcelNo?: number; parcelCount?: number;
}
export interface Expense {
  id: string; supplierId: string; document: string; value: number; baseDate: string;
  termDays: number | null; // G: vazio = não distribui; 0 = data base
  extensionDate: string | null; extensionHistory: ExtensionEvent[];
  categoryId: string; notes: string; status: Status; importOrigin?: Origin | null;
  paymentUnconfirmed?: boolean;
  cardOpId?: string | null; // operação no cartão que gerou esta parcela
  cardId?: string | null; // compra no cartão: detalhe da fatura; não debita banco nem entra no fluxo (a fatura entra)
  invoiceId?: string | null; // fatura à qual a compra no cartão foi vinculada
  invoiceOf?: { cardId: string; month: string } | null; // esta despesa É a fatura do cartão (saída bancária na baixa)
}
export interface Effectivation {
  id: string; plannedId: string; at: string; kind: "parcial" | "concluida"; value: number;
  substituted?: number; // parte da previsão substituída (pode diferir de value); ausente em registros antigos = value
  committedIds: string[];
  linkedLegacy?: boolean; // efetivação que reclassificou um título legado existente (sem criar novo)
  prev: { status: Planned["status"]; remainingOverride: Planned["remainingOverride"] };
  reversedAt: string | null; reversalNote: string;
}
// Baixa = registro de pagamento realizado (NÃO é transferência bancária).
export interface Payment {
  id: string; titleKind: "committed" | "expense"; titleId: string; date: string; amount: number;
  note: string; reversedAt: string | null; reversalNote: string;
  accountId?: string | null; // conta de origem; baixas antigas sem conta = "Conta não informada" (nunca inferida)
  batchId?: string | null; // baixas multicontas confirmadas juntas
  method?: "banco" | "cartao"; // "cartao" = liquidação do fornecedor pelo cartão (NÃO é débito bancário)
  cardOpId?: string | null;
  form?: PaymentForm | null; // forma de pagamento: Pix, TED, DOC ou Boleto
}
export type PaymentForm = "pix" | "ted" | "doc" | "boleto";
// Operação no cartão: cobertura de título existente OU nova compra. Gera parcelas (Expense.cardId) que entram nas faturas.
export interface CardOperation {
  id: string; cardId: string; kind: "cobertura" | "compra"; date: string; amount: number; installments: number;
  titleKind: "committed" | "expense" | null; titleId: string | null; paymentId: string | null; expenseIds: string[];
  at: string; by: string; reversedAt: string | null; reversalNote: string;
  fee?: number; // tarifas da operação no cartão (entram na fatura, não quitam o boleto)
  form?: PaymentForm | null;
}
// Contas bancárias e cartões. Saldo inicial = saldo ao FIM do dia openingDate; entram só movimentos com data > openingDate.
export interface BankAccount {
  id: string; bank: string; label: string; holder: string; agency: string; account: string; active: boolean;
  openingBalance: number | null; openingDate: string | null;
  history: { at: string; field: string; from: unknown; to: unknown; note: string }[];
}
export interface Card { id: string; accountId: string; name: string; last4: string; closingDay: number; dueDay: number; active: boolean }
// Transferência: UM registro com as duas pernas (saída da origem e entrada no destino) — atômica por construção; neutra no consolidado.
export interface Transfer { id: string; fromAccountId: string; toAccountId: string; amount: number; date: string; note: string; at: string; by: string; reversedAt: string | null; reversalNote: string }
// Plataforma: ID estável; nome editável; vigência [start, end]. Nunca excluída fisicamente se referenciada.
export interface PlatformAccountPeriod { from: string; accountId: string; at: string; note: string }
export interface Platform { id: string; name: string; start: string; end: string | null; importedCode: string | null; defaultAccounts?: PlatformAccountPeriod[]; history: { at: string; field: string; from: unknown; to: unknown; note: string }[] }
// Recebimento: valores por ID de plataforma. residual[id] = repasse APÓS inativação, exceção explícita com nota.
export interface Receipt { id: string; date: string; platforms: Record<string, number | null>; general: number | null; notes: string; residual?: Record<string, { note: string; at: string }>;
  accountByPlatform?: Record<string, { accountId: string; override: boolean }>; // conta gravada no registro (nunca recalculada pelo padrão)
  generalAccountId?: string | null; // conta do valor geral (sem plataforma)
  realized?: boolean; // explicitamente confirmado como creditado em conta; informado ≠ realizado
}
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
  bankAccounts: BankAccount[];
  cards: Card[];
  transfers: Transfer[];
  cardOps: CardOperation[];
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
