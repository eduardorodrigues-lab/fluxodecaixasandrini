import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/DateField";
import { finishDecision, subscribeDecisions, type DecisionRequest } from "@/lib/decisions";

export function DecisionWindow({ title, description, children, footer, wide }: { title: string; description?: string | undefined; children?: ReactNode; footer: ReactNode; wide?: boolean | undefined }) {
  return <Dialog.Root open><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[100] bg-foreground/30" />
    <Dialog.Content onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} className={`fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-md border border-border bg-background shadow-xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
      <div className="border-b border-border px-5 py-4"><Dialog.Title className="text-base font-semibold">{title}</Dialog.Title></div>
      <div className="min-h-0 overflow-y-auto px-5 py-4 text-sm"><Dialog.Description className="whitespace-pre-line break-words leading-relaxed text-muted-foreground">{description}</Dialog.Description><div className="mt-2 min-w-0 space-y-3 break-words text-xs [&_td]:whitespace-normal [&_th]:whitespace-normal">{children}</div></div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 [&_button]:h-auto [&_button]:min-h-9 [&_button]:max-w-full [&_button]:whitespace-normal">{footer}</div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export function DecisionDialog() {
  const [request, setRequest] = useState<DecisionRequest | null>(null);
  const [value, setValue] = useState("");
  const [dateValid, setDateValid] = useState(true);
  useEffect(() => subscribeDecisions((next) => { setRequest(next); setValue(next.input?.initial ?? ""); }), []);
  const finish = (answer: string | null) => { setRequest(null); finishDecision(answer); };
  if (!request) return null;
  return <DecisionWindow title={request.title} description={request.message} footer={<>
    {!request.notice && <Button variant="outline" onClick={() => finish(null)}>{request.cancelLabel ?? "Cancelar"}</Button>}
    {request.secondary && <Button variant="outline" onClick={() => finish("secondary")}>{request.secondary}</Button>}
    <Button variant={request.destructive ? "destructive" : "default"} disabled={!!request.input && (!value.trim() || request.input.type === "date" && !dateValid)} onClick={() => finish(request.input ? value.trim() : "confirmed")}>{request.action}</Button>
  </>}>
    {request.input && <label className="mt-2 flex flex-col gap-2 text-xs font-medium">{request.input.label}{request.input.type === "date" ? <DateInput value={value || null} onChange={(next) => setValue(next ?? "")} onValidityChange={setDateValid} /> : <textarea className="inp min-h-24 w-full" value={value} onChange={(e) => setValue(e.target.value)} />}</label>}
  </DecisionWindow>;
}