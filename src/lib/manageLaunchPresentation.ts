import type { ScenarioData } from "./engine/types";
import { managedDocument, type LaunchRef, type ManagedParcel } from "./manageLaunch";

/** Read-only presentation; never changes financial scopes or parcel identities. */
export function eligiblePlanned(ref: LaunchRef, parcels: ManagedParcel[]) {
  return ref.kind === "planned" ? parcels.filter((p) => p.status === "ativo" && p.paid === 0) : [];
}
export function selectedPlanned(ref: LaunchRef, parcels: ManagedParcel[], keys: string[]) {
  return eligiblePlanned(ref, parcels).filter((p) => keys.includes(p.key));
}
export function parcelSituation(p: ManagedParcel, planned: boolean) {
  if (p.status === "cancelado") return "Cancelado";
  if (planned) return p.status === "ativo" ? "Planejado" : "Encerrado";
  if (p.paid > 0 && p.paid >= (p.amount ?? 0)) return "Pago";
  return p.paid > 0 ? "Parcialmente pago" : "Efetivado";
}
export function launchSummary(d: ScenarioData, ref: LaunchRef, parcels: ManagedParcel[]) {
  const planned = ref.kind === "planned";
  const titles = planned ? d.committed.filter((c) => c.plannedId === ref.id).flatMap((c) => managedDocument(d, { kind: "committed", id: c.id }).parcels.filter((p) => p.id === c.id)) : parcels;
  const effective = titles.reduce((s, p) => s + (p.status === "cancelado" ? 0 : p.amount ?? 0), 0);
  const paid = titles.reduce((s, p) => s + p.paid, 0);
  const open = titles.reduce((s, p) => s + (p.status === "cancelado" ? 0 : Math.max(0, (p.amount ?? 0) - p.paid)), 0);
  const remaining = planned ? parcels.reduce((s, p) => s + (p.status === "ativo" ? p.amount ?? 0 : 0), 0) : null;
  return { effective, paid, open, remaining, linkedTitles: planned ? titles.length : 0 };
}