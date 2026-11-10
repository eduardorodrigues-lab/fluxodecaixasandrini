# E2E isolado: TODAS as funções do servidor são interceptadas e respondidas com uma organização FICTÍCIA em memória.
import asyncio, json, os, re
from urllib.parse import unquote
from playwright.async_api import async_playwright
SHOTS="/tmp/browser/banco/e2e"; os.makedirs(SHOTS, exist_ok=True)
ORG="00000000-0000-4000-8000-0000000000aa"
doc={"params":{"profile":"legado","startDate":"2026-11-01","saldoInicial":0},
 "suppliers":[{"id":"s1","name":"Fornecedor Ficticio","group":"","terms":[]}],
 "categories":[{"id":"k1","name":"Material","kind":"compra","group":""},{"id":"k2","name":"Software","kind":"despesa","group":""}],
 "committed":[{"id":"c1","supplierId":"s1","purchaseCode":"P1","document":"NF-TESTE","value":1000000,"dueDate":"2026-11-15","extensionDate":None,"extensionHistory":[],"extensionInfo":"","legacyAbatement":None,"origin":"manual","plannedId":None,"effectivationId":None,"categoryId":"k1","notes":"","status":"ativo"}],
 "platforms":[{"id":"ml","name":"ML Ficticio","start":"2026-01-01","end":None,"importedCode":None,"history":[],"defaultAccounts":[{"from":"2026-01-01","accountId":"A","at":"","note":""}]}],
 "bankAccounts":[{"id":"A","bank":"Banco A","label":"Ficticia A","holder":"","agency":"","account":"","active":True,"openingBalance":5000000,"openingDate":"2026-10-31","history":[]},
                 {"id":"B","bank":"Banco B","label":"Ficticia B","holder":"","agency":"","account":"","active":True,"openingBalance":2000000,"openingDate":"2026-10-31","history":[]}]}
state={"v":1,"data":json.dumps(doc),"commits":0}
def sv(s): return {"t":1,"s":s.replace("\\","\\\\").replace('"','\\"')}
def wrap(v): return json.dumps({"t":10,"i":0,"p":{"k":["result","error","context"],"v":[v,{"t":2,"s":1},{"t":11,"i":99,"p":{"k":[],"v":[]},"o":0}]},"o":0})
import itertools
_ids=itertools.count(10)
def obj(k,v): return {"t":10,"i":next(_ids),"p":{"k":k,"v":v},"o":0}
def find_json(body):
  m=re.search(r'dataJson\\?"?.*?', body)
  j=json.loads(body)
  def walk(x):
    if isinstance(x,dict):
      p=x.get("p")
      if isinstance(p,dict) and "dataJson" in p.get("k",[]): return p["v"][p["k"].index("dataJson")]["s"]
      for y in x.values():
        r=walk(y)
        if r: return r
    if isinstance(x,list):
      for y in x:
        r=walk(y)
        if r: return r
  s=walk(j); return s.replace('\\"','"').replace("\\\\","\\")
async def handler(route):
  import base64
  seg=route.request.url.split("/_serverFn/")[1].split("?")[0]
  u=base64.b64decode(seg+"="*(-len(seg)%4)).decode()
  if u.endswith("#listMyOrgs"): body=wrap({"t":9,"i":next(_ids),"a":[obj(["orgId","role","name","own"],[sv(ORG),sv("owner"),sv("Org Ficticia (teste)"),{"t":2,"s":2}])],"o":0})
  elif u.endswith("#getOfficial"): body=wrap(obj(["orgId","orgName","role","version","updatedAt","dataJson"],[sv(ORG),sv("Org Ficticia (teste)"),sv("owner"),{"t":0,"s":state["v"]},sv(""),sv(state["data"])]))
  elif u.endswith("#listAudit"): body=wrap({"t":9,"i":next(_ids),"a":[],"o":0})
  elif u.endswith("#commitOfficial"):
    state["data"]=find_json(route.request.post_data); state["v"]+=1; state["commits"]+=1
    body=wrap(obj(["status","version","summary"],[sv("ok"),{"t":0,"s":state["v"]},sv("")]))
  else:
    print("ABORT", u[:120]); return await route.abort()  # qualquer outra função do servidor é bloqueada
  await route.fulfill(status=200, headers={"content-type":"application/json","x-tss-serialized":"true"}, body=body)
def D(): return json.loads(state["data"])
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True)
    ctx=await b.new_context(viewport={"width":1280,"height":1800}); page=await ctx.new_page()
    await ctx.route("**/_serverFn/**", handler)
    await ctx.route(re.compile(r".*supabase\.co/rest/.*"), lambda r: (print("ABORT REST", r.request.url[:100]), asyncio.ensure_future(r.abort()))[1])  # nenhum acesso direto à base
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept("teste estorno")))
    errs=[]; page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: m.type=="error" and print("CONSOLE", m.text[:300]))
    k=os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]; s=os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    await page.goto("http://localhost:8080"); await page.evaluate("([k,v])=>{localStorage.clear();localStorage.setItem(k,v)}",[k,s])
    # 1) pagamento 6.000 A + 4.000 B
    await page.goto("http://localhost:8080/lancamentos"); await page.wait_for_timeout(4000); await page.screenshot(path=f"{SHOTS}/0.png"); pass
    await page.get_by_role("button", name=re.compile(r"^Efetivado")).click()
    await page.get_by_role("button", name="Ações da linha").first.click()
    await page.get_by_role("menuitem", name="Registrar pagamento").click()
    dlg=page.get_by_role("dialog", name="Registrar pagamento")
    async def fill_line(i, acc, val):
      a=dlg.get_by_label(f"Conta origem {i}"); await a.fill(acc)
      m=dlg.locator("input.num").nth(i-1); await m.fill(val); await m.blur()
    await fill_line(1,"Banco A · Ficticia A","6.000,00")
    await dlg.get_by_role("button", name="+ Adicionar outra conta").click()
    await fill_line(2,"Banco B · Ficticia B","4.000,00")
    await page.screenshot(path=f"{SHOTS}/1_pagamento.png")
    await dlg.get_by_role("button", name="Revisar e confirmar").click()
    await page.screenshot(path=f"{SHOTS}/2_revisao.png")
    await page.get_by_role("button", name="Confirmar pagamento").click(); await page.wait_for_timeout(2500)
    pays=D().get("payments",[]); print("1 pagamentos gravados:", [(x["accountId"],x["amount"],x["batchId"] is not None) for x in pays])
    # 2) estorno da baixa da conta B
    await page.get_by_role("button", name=re.compile(r"^Pagamentos \(baixas\)")).click(); await page.wait_for_timeout(300)
    await page.get_by_role("row", name=re.compile("Ficticia B")).get_by_role("button", name="Estornar").click(); await page.wait_for_timeout(2500)
    print("2 estornos:", [(x["accountId"], bool(x["reversedAt"]), x["reversalNote"]) for x in D()["payments"]])
    await page.screenshot(path=f"{SHOTS}/3_estorno.png")
    # 3) recebimento com conta padrão e override
    await page.goto("http://localhost:8080/recebimentos"); await page.wait_for_timeout(3000)
    await page.get_by_role("button", name="+ Recebimento").click(); await page.wait_for_timeout(300)
    row=page.locator("tbody tr").first
    dt=row.locator("input[placeholder='dd/mm/aaaa']").first; await dt.fill("05/11/2026"); await dt.blur(); await page.wait_for_timeout(300)
    mv=row.locator("input.num").first; await mv.fill("1.500,00"); await mv.blur(); await page.wait_for_timeout(2500)
    r=[x for x in D()["receipts"] if x.get("date")=="2026-11-05"][0]; print("3a conta gravada:", r.get("accountByPlatform"))
    await page.locator("tbody tr").first.get_by_role("button", name="Banco A").click()
    await page.get_by_label("Alterar somente neste recebimento ML Ficticio").fill("Banco B · Ficticia B"); await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{SHOTS}/4_override.png")
    r=[x for x in D()["receipts"] if x.get("date")=="2026-11-05"][0]; print("3b override:", r.get("accountByPlatform"))
    await page.get_by_role("dialog").get_by_role("button", name="Fechar").first.click()
    # 4) transferência SIMULADA
    before=state["commits"]
    await page.goto("http://localhost:8080/simulacoes"); await page.wait_for_timeout(2500)
    await page.get_by_placeholder("Nome da simulação").fill("TESTE TRANSFERENCIA")
    await page.get_by_role("button", name="Criar a partir da base e ativar").click(); await page.wait_for_timeout(800)
    await page.get_by_role("link", name="Bancos").click(); await page.wait_for_timeout(1500)
    await page.get_by_role("button", name="Transferências").click()
    await page.get_by_role("button", name="+ Transferência simulada").click()
    dlg=page.get_by_role("dialog")
    await dlg.get_by_label("Conta de origem").fill("Banco A · Ficticia A"); await dlg.get_by_label("Conta de destino").fill("Banco B · Ficticia B")
    m=dlg.locator("input.num").first; await m.fill("700,00"); await m.blur()
    await page.screenshot(path=f"{SHOTS}/5_transf_sim.png")
    await dlg.get_by_role("button", name="Revisar e confirmar").click(); await page.get_by_role("button", name="Confirmar transferência").click(); await page.wait_for_timeout(2500)
    await page.screenshot(path=f"{SHOTS}/6_transf_lista.png")
    sims=await page.evaluate("localStorage.getItem('fluxo-sandrini:v2')")
    simT=[t for sc in json.loads(sims)["sims"].values() for x in sc for t in x["data"].get("transfers",[])]
    print("4 transferência na simulação:", [(t["fromAccountId"],t["toAccountId"],t["amount"]) for t in simT], "| commits durante simulação:", state["commits"]-before, "| transfers na base fictícia:", len(D().get("transfers",[])))
    pb=page.get_by_role("button", name="Registrar pagamento")
    await page.get_by_role("link", name="Lançamentos").click(); await page.wait_for_timeout(1500)
    await page.get_by_role("button", name=re.compile(r"^Efetivado")).click(); await page.get_by_role("button", name="Ações da linha").first.click()
    await page.screenshot(path=f"{SHOTS}/7_sim_pag.png")
    print("5 pagamento em simulação desabilitado:", await page.get_by_role("menuitem", name="Registrar pagamento").evaluate("e => e.disabled || e.hasAttribute(\"data-disabled\") || e.getAttribute(\"aria-disabled\")===\"true\""))
    print("erros de página:", errs)
    await b.close()
asyncio.run(main())
