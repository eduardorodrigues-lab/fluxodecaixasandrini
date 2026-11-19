import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { formDraftKey, readForm, writeForm, type FormScope } from "@/lib/formDraft";

const DELAY = 400;

/** Form-only protection: never sends data, and never restores a reviewed authorization.
 *  Restores once on mount; writes are debounced off the typing path and flushed on close, route change
 *  (unmount), tab hide and page unload so the last keystroke is preserved. */
/** `restore` may return false when the stored copy is already contained in the current base (e.g. confirmed earlier):
 *  the copy is then removed instead of reopening an already-saved change as unsaved. */
export function useFormDraft<T>(scope:FormScope,value:T,restore:(value:T)=>void|boolean) {
  const generation = useApp().base.data.params.baseGeneration;
  const key = formDraftKey({ ...scope, generation });
  const state = useRef({key,ready:false,revision:null as string|null,last:"",stopped:false,backup:"",cleared:false,timer:0 as ReturnType<typeof setTimeout> | 0});
  const [recovered,setRecovered] = useState(false);
  const [warning,setWarning] = useState("");
  const latest = useRef(value); latest.current=value;
  const write = () => {
    const s=state.current;
    if (s.timer) { clearTimeout(s.timer); s.timer=0; }
    if (!s.ready || s.cleared || s.key!==key) return;
    const v=latest.current, text=JSON.stringify(v);
    if(text===s.last)return;
    try {if(s.stopped){localStorage.setItem(s.backup,JSON.stringify({v:1,revision:crypto.randomUUID(),at:new Date().toISOString(),value:v}));s.last=text;return;}const next=writeForm(localStorage,key,s.revision,v);s.revision=next.revision;s.last=text;localStorage.setItem(s.backup,JSON.stringify(next));}
    catch(e){s.stopped=true;setWarning((e as Error).message);}
  };
  const writeRef = useRef(write); writeRef.current = write;
  // One synchronous read on mount (before paint) so a recovered form never flashes empty.
  useLayoutEffect(()=>{
    if (!scope.user || !scope.org) return;
    const s=state.current;
    if(s.key!==key){s.stopped=true;setWarning("O contexto mudou. Volte à conta, organização e modo deste preenchimento.");return;}
    if(s.ready)return;
    try {let tab=sessionStorage.getItem("fluxo:form-tab");if(!tab){tab=crypto.randomUUID();sessionStorage.setItem("fluxo:form-tab",tab);}s.backup=`${key}:tab:${tab}`;
      const main=readForm<T>(localStorage,key), own=readForm<T>(localStorage,s.backup);const old=own ?? main;s.ready=true;s.revision=main?.revision??null;
      if(own && main && own.revision!==main.revision){s.stopped=true;setWarning("Outra aba alterou este preenchimento. Recuperada a cópia local desta aba; confira a base atual antes de salvar.");}
      if(old){
        if(restore(old.value)===false){if((main?.revision??null)===s.revision)localStorage.removeItem(key);localStorage.removeItem(s.backup);s.revision=null;s.stopped=false;setWarning("");s.last=JSON.stringify(latest.current);return;}
        s.last=JSON.stringify(old.value);setRecovered(true);return;}
      s.last=JSON.stringify(latest.current); // pristine form is not a draft
    } catch(e){s.ready=true;s.stopped=true;setWarning(`Proteção local indisponível: ${(e as Error).message} Não recarregue sem guardar o preenchimento.`);}
  },[key,scope.user,scope.org]);
  // Debounced write: no serialization on each keystroke.
  useEffect(()=>{
    const s=state.current;
    if(!s.ready || s.cleared)return;
    if(s.timer)clearTimeout(s.timer);
    s.timer=setTimeout(()=>writeRef.current(),DELAY);
  });
  useEffect(()=>{
    const flush=()=>writeRef.current();
    const onHide=()=>{ if(document.visibilityState==="hidden")flush(); };
    const onStorage=(e:StorageEvent)=>{if(e.key===key){state.current.stopped=true;setWarning("Outra aba alterou este rascunho local. A cópia desta aba está protegida separadamente; confira antes de continuar.");}};
    window.addEventListener("pagehide",flush);document.addEventListener("visibilitychange",onHide);window.addEventListener("storage",onStorage);
    return()=>{window.removeEventListener("pagehide",flush);document.removeEventListener("visibilitychange",onHide);window.removeEventListener("storage",onStorage);flush();};
  },[key]);
  const clear=()=>{
    const s=state.current;
    if(s.timer){clearTimeout(s.timer);s.timer=0;}
    try {const old=readForm<T>(localStorage,key);if((old?.revision??null)===s.revision)localStorage.removeItem(key);if(s.backup)localStorage.removeItem(s.backup);s.stopped=true;s.cleared=true;return true;}
    catch(e){setWarning((e as Error).message);return false;}
  };
  /** Writes the latest value immediately (used by "Manter rascunho e fechar"). */
  const flush=()=>{ writeRef.current(); };
  return {recovered,warning,clear,flush};
}
