import asyncio, json, os, re
src=open("/dev-server/scripts/e2e/bancos-isolado.py").read().split("async def main")[0].replace('SHOTS="/tmp/browser/banco/e2e"','SHOTS="/tmp/browser/efm/shots"')
import base64
def dec(seg):
  try: return base64.urlsafe_b64decode(seg+"="*(-len(seg)%4)).decode()
  except Exception: return seg
def norm(u):
  m=re.search(r"\"export\":\"(\w+?)_createServerFn_handler",u)
  return "#"+m.group(1) if m else u
src=src.replace("u=base64.b64decode(seg+\"=\"*(-len(seg)%4)).decode()","u=norm(dec(seg))")
exec(src)
inst=[{"amount":100000,"date":f"2026-{11+i if i<2 else 0:02d}-15" if i<2 else f"2027-{i-1:02d}-15","extensionDate":None,"extensionHistory":[]} for i in range(10)]
doc["committed"]=[]; doc["planned"]=[{"id":"pl1","supplierId":"s1","purchaseCode":"PED-1","document":"NF-PLAN","value":1000000,"baseDate":"2026-10-15","categoryId":"k1","notes":"","status":"ativo","remainingOverride":None,"installments":inst}]
state["data"]=json.dumps(doc)
async def run(w,h,tag):
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={"width":w,"height":h}); page=await ctx.new_page()
    await ctx.route("**/_serverFn/**", handler)
    await ctx.route(re.compile(r".*supabase\.co/rest/.*"), lambda r: asyncio.ensure_future(r.abort()))
    errs=[]; page.on("pageerror", lambda e: errs.append(str(e)))
    k=os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]; s=os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    await page.goto("http://localhost:8080"); await page.evaluate("([k,v])=>{localStorage.clear();localStorage.setItem(k,v)}",[k,s])
    await page.goto("http://localhost:8080/lancamentos"); await page.wait_for_timeout(4000)
    await page.get_by_role("button", name="Ações da linha").first.click()
    await page.get_by_role("menuitem", name="Efetivar esta parcela").click(); await page.wait_for_timeout(500)
    dlg=page.get_by_role("dialog").last
    m=dlg.locator("input.num").first; await m.fill("900,00"); await m.blur()
    await dlg.get_by_role("combobox").last.select_option("total")
    await page.screenshot(path=f"{SHOTS}/{tag}_1_form.png")
    await dlg.get_by_role("button", name="Aplicar sugestão").click(); await page.wait_for_timeout(300)
    txt=await dlg.inner_text(); print(tag,"totais:", re.findall(r"(Efetivado|Planejado restante|Total após alteração)\s*\n?\s*(R\$\s?[\d\.,]+)", txt, re.I))
    # edição manual -> rótulo + sobrescrita exige confirmação
    await page.screenshot(path=f"{SHOTS}/{tag}_1b.png")
    r=dlg.get_by_role("row", name=re.compile(r"^2.10")).locator("input").first; await r.fill("1.500,00"); await r.blur()
    print(tag,"rótulo personalizado:", await dlg.get_by_text("Valores personalizados").count()>0)
    await dlg.get_by_role("button", name="Aplicar sugestão").click(); await page.wait_for_timeout(300)
    await page.screenshot(path=f"{SHOTS}/{tag}_2_confirm.png")
    await page.get_by_role("button", name="Substituir valores").click(); await page.wait_for_timeout(300)
    await dlg.get_by_role("button", name="Revisar alterações").click(); await page.wait_for_timeout(400)
    await page.screenshot(path=f"{SHOTS}/{tag}_3_review.png")
    await page.get_by_role("button", name="Voltar").click(); await page.wait_for_timeout(300)
    print(tag,"rascunho mantido após Voltar:", await page.get_by_role("dialog").last.locator("input.num").first.input_value())
    await page.get_by_role("dialog").last.get_by_role("button", name="Revisar alterações").click(); await page.wait_for_timeout(300)
    await page.get_by_role("button", name="Confirmar efetivação").click(); await page.wait_for_timeout(2500)
    d=D(); pl=d["planned"][0]
    print(tag,"commits:",state["commits"],"efetivados:",[c["value"] for c in d["committed"]],"restante:",pl["remainingOverride"]["value"], len(pl["remainingOverride"]["items"]), "pagamentos:", len(d.get("payments",[])), "erros:", errs)
    await page.screenshot(path=f"{SHOTS}/{tag}_4_after.png")
    await b.close()
asyncio.run(run(1280,1800,"desk"))
state["data"]=json.dumps(doc); state["commits"]=0
asyncio.run(run(390,844,"mob"))
