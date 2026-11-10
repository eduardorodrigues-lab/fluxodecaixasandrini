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

async def go():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={"width":1280,"height":1800}); page=await ctx.new_page()
    await ctx.route("**/_serverFn/**", handler)
    errs=[]; page.on("pageerror", lambda e: errs.append(str(e)))
    k=os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]; s=os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    await page.goto("http://localhost:8080"); await page.evaluate("([k,v])=>{localStorage.clear();localStorage.setItem(k,v)}",[k,s])
    await page.goto("http://localhost:8080/lancamentos"); await page.wait_for_timeout(4000)
    await page.get_by_role("button", name="+ Novo lançamento").click()
    await page.get_by_role("button", name="Efetivado").last.click()
    dl=page.get_by_role("dialog").last
    await dl.locator("select").nth(2).select_option(label="Material")
    await dl.locator("[data-supplier-combobox] input").click(); await page.locator("ul[role=listbox] button").first.click()
    await dl.get_by_role("textbox").nth(1).fill("NF-77"); bd=dl.locator("input[placeholder=\"dd/mm/aaaa\"]").first; await bd.fill("10/11/2026"); await bd.blur()
    m=dl.locator("input.num").first; await m.fill("1.000,00"); await m.blur()
    await page.screenshot(path=f"{SHOTS}/nn_0.png")
    await dl.get_by_text("Preencher manualmente").click()
    await dl.locator("input[type=number]").fill("3")
    await dl.get_by_role("button", name="Gerar linhas").click(); await page.wait_for_timeout(300)
    for i,dt in enumerate(["10/12/2026","10/01/2027","10/02/2027"]):
      inp=dl.get_by_role("row", name=re.compile(rf"^{i+1}.3")).locator("input").nth(1); await inp.fill(dt); await inp.blur()
    await page.screenshot(path=f"{SHOTS}/nn_1.png")
    await dl.get_by_role("button", name="Revisar e confirmar").click(); await page.wait_for_timeout(400)
    btn=page.get_by_role("button", name="Confirmar lançamento")
    print("desabilitado sem conferência:", await btn.is_disabled())
    await page.get_by_text("Conferi os valores").click(); await page.screenshot(path=f"{SHOTS}/nn_2.png")
    await btn.click(); await page.wait_for_timeout(2500)
    print("gravados:", [(c["value"],c["dueDate"]) for c in D()["committed"]], "pagamentos:", len(D().get("payments",[])), errs)
asyncio.run(go())
