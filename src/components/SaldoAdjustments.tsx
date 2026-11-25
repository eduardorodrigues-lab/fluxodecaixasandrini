import { splitOrigin } from "@/lib/originText";
import { useState } from "react";
import { Button } from "./ui/button";
import { DateInput, MoneyInput } from "./kit";
import { Field, guardClose, SidePanel } from "./NotaPanel";
import { askConfirm } from "@/lib/decisions";
import { saveBalanceAdjustment } from "@/lib/financeConfig";
import { useApp } from "@/lib/store";
import { fmtDate } from "@/lib/dates";
import { fmtBRL } from "@/lib/money";

export function SaldoAdjustments({ onClose }: { onClose: () => void }) {
  const { active, canEdit, update } = useApp();
  const [editing, setEditing] = useState(false); const [old, setOld] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null); const [value, setValue] = useState<number | null>(null); const [note, setNote] = useState(""); const [error, setError] = useState("");
  const save = async () => {
    try {
      if (!date || value === null) throw new Error("Informe a data, o valor e a justificativa.");
      saveBalanceAdjustment(structuredClone(active.data), old, date, value, note);
      const e = update((x) => saveBalanceAdjustment(x, old, date, value, note)); if (e) setError(e); else setEditing(false);
    } catch (e) { setError((e as Error).message); }
  };
  return <SidePanel title="Ajustes manuais de saldo" onClose={onClose} dirty={editing} footer={editing ? <><Button variant="outline" onClick={guardClose(true, () => setEditing(false))}>Cancelar preenchimento</Button><Button disabled={!canEdit} onClick={save}>Salvar ajuste</Button></> : <Button variant="outline" onClick={onClose}>Fechar</Button>}>
    {editing ? <div className="space-y-3"><Field l="Data"><DateInput value={date} onChange={setDate} /></Field><Field l="Saldo inicial do dia"><MoneyInput value={value} onChange={setValue} /></Field><Field l="Justificativa"><textarea className="inp w-full" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div> : <>
      <Button disabled={!canEdit} onClick={() => { setOld(null); setDate(null); setValue(null); setNote(""); setError(""); setEditing(true); }}>Adicionar ajuste</Button>
      <div className="overflow-auto"><table className="tbl [&_td]:whitespace-normal"><thead><tr><th>Data</th><th className="num">Valor</th><th>Justificativa</th><th>Ações</th></tr></thead><tbody>{[...active.data.adjustments].sort((a, b) => a.date.localeCompare(b.date)).map((a) => <tr key={a.date}><td>{fmtDate(a.date)}</td><td className="num">{fmtBRL(a.value ?? 0)}</td><td>{splitOrigin(a.note).text || "—"}</td><td><Button size="sm" variant="outline" disabled={!canEdit} onClick={() => { setOld(a.date); setDate(a.date); setValue(a.value); setNote(a.note); setError(""); setEditing(true); }}>Editar</Button><Button size="sm" variant="destructive" disabled={!canEdit} onClick={async () => { if (await askConfirm(`Excluir o ajuste de ${fmtDate(a.date)}? Os saldos seguintes poderão mudar.`, { title: "Excluir ajuste?", action: "Excluir ajuste", destructive: true })) { const e = update((x) => { x.adjustments = x.adjustments.filter((i) => i.date !== a.date); }); if (e) setError(e); } }}>Excluir</Button></td></tr>)}</tbody></table></div>
    </>}{error && <p role="alert" className="text-destructive">{error}</p>}
  </SidePanel>;
}