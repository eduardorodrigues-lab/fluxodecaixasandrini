import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formDraftKey, readForm, writeForm, type FormScope } from "@/lib/formDraft";

/** Form-only protection: never sends data, and never restores a reviewed authorization. */
export function useFormDraft<T>(scope:FormScope,value:T,restore:(value:T)=>void) {
  const key = formDraftKey(scope);
  const state = useRef({key,ready:false,revision:null as string|null,last:"",stopped:false,backup:""});
  const [recovered,setRecovered] = useState(false);
  const [warning,setWarning] = useState("");
  const latest = useRef(value); latest.current=value;
  useLayoutEffect(()=>{
    if (!scope.user || !scope.org) return;
    const s=state.current;
    if(s.key!==key){s.stopped=true;setWarning("O contexto mudou. Volte à conta, organização e modo deste preenchimento.");return;}
    if(!s.ready){
      try {let tab=sessionStorage.getItem("fluxo:form-tab");if(!tab){tab=crypto.randomUUID();sessionStorage.setItem("fluxo:form-tab",tab);}s.backup=`${key}:tab:${tab}`;
        const main=readForm<T>(localStorage,key), own=readForm<T>(localStorage,s.backup);const old=own ?? main;s.ready=true;s.revision=main?.revision??null;
        if(own && main && own.revision!==main.revision){s.stopped=true;setWarning("Outra aba alterou este preenchimento. Recuperada a cópia local desta aba; confira a base atual antes de salvar.");}
        if(old){s.last=JSON.stringify(old.value);restore(old.value);setRecovered(true);return;}
      } catch(e){s.ready=true;s.stopped=true;setWarning(`Proteção local indisponível: ${(e as Error).message} Não recarregue sem guardar o preenchimento.`);return;}
    }
    const text=JSON.stringify(value);
    if(text===s.last)return;
    try {if(s.stopped){localStorage.setItem(s.backup,JSON.stringify({v:1,revision:crypto.randomUUID(),at:new Date().toISOString(),value}));s.last=text;return;}const next=writeForm(localStorage,key,s.revision,value);s.revision=next.revision;s.last=text;localStorage.setItem(s.backup,JSON.stringify(next));}
    catch(e){s.stopped=true;setWarning((e as Error).message);}
  });
  useEffect(()=>{
    const onStorage=(e:StorageEvent)=>{if(e.key===key){state.current.stopped=true;setWarning("Outra aba alterou este rascunho local. A cópia desta aba está protegida separadamente; confira antes de continuar.");}};
    window.addEventListener("storage",onStorage);return()=>window.removeEventListener("storage",onStorage);
  },[key]);
  const clear=()=>{
    const s=state.current;
    try {const old=readForm<T>(localStorage,key);if((old?.revision??null)===s.revision)localStorage.removeItem(key);if(s.backup)localStorage.removeItem(s.backup);s.stopped=true;return true;}
    catch(e){setWarning((e as Error).message);return false;}
  };
  return {recovered,warning,clear};
}