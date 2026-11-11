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
                 {"id":"B","bank":"Banco B","label":"Ficticia B","holder":"","agency":"","account":"","active":True,"openingBalance":2000000,"openingDate":"2026-10-31","history":[]}],
 "cards":[{"id":"K","accountId":"A","name":"Visa Ficticio","last4":"1234","closingDay":10,"dueDay":20,"active":True}]}
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
    return await route.abort()  # qualquer outra função do servidor é bloqueada
  await route.fulfill(status=200, headers={"content-type":"application/json","x-tss-serialized":"true"}, body=body)
def D(): return json.loads(state["data"])

import asyncio, os, json, re
from pathlib import Path
from playwright.async_api import async_playwright
f={"deflator1":0,"deflator2":0,"base1":"bruto","base2":"apos_r1","divisor":"30","lagDays":10}
doc={"params":{"profile":"legado","startDate":"2026-01-01","lagDays":10,"saldoInicial":0},"targets":{"2026-01":9300000,"2026-02":9300000},"targetConfigs":{m:{"gross":9300000,"legacyReducer":0,"divisorLegado":"30","webR1":0,"webR2":0,"r2Base":"apos_r1","divisorWeb":"30","lagDays":10,"version":1,"history":[],"financial":f} for m in ['2026-01','2026-02']}}
state['data']=json.dumps(doc)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={"width":1280,"height":1800})
  await ctx.route('**/_serverFn/**',handler)
  await ctx.route(re.compile(r'.*/rest/v1/.*'),lambda r:r.abort())
  page=await ctx.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>{localStorage.clear();localStorage.setItem(k,v)}',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  await page.goto('http://localhost:8080/metas');  await page.get_by_role('row').filter(has_text='01/2026').get_by_role('button').click()
  dialog=page.get_by_role('dialog'); await dialog.locator('select').nth(2).select_option('dias')
  await dialog.locator('[aria-live="polite"]').filter(has_text='Estimativa/dia').wait_for()
  assert '3.000,00' in await dialog.locator('[aria-live="polite"]').inner_text()
  assert state['commits']==0
  await page.screenshot(path='/tmp/browser/metas/draft.png')
  await dialog.get_by_role('button',name='Revisar alterações').click()
  assert '3.100,00' in await dialog.inner_text() and '3.000,00' in await dialog.inner_text()
  await dialog.get_by_role('button',name='Voltar',exact=True).click()
  assert await dialog.locator('select').nth(2).input_value()=='dias'
  await dialog.get_by_role('button',name='Revisar alterações').click()
  await dialog.get_by_role('button',name='Confirmar configuração').click()
  await page.wait_for_timeout(1700)
  assert state['commits']==1 and D()['targetConfigs']['2026-01']['financial']['divisor']=='dias'
  assert '3.000,00' in await page.get_by_role('row').filter(has_text='01/2026').inner_text()
  await page.reload(); await page.get_by_role('row').filter(has_text='01/2026').get_by_role('button').click()
  dialog=page.get_by_role('dialog'); assert await dialog.locator('select').nth(2).input_value()=='dias'
  await dialog.get_by_role('button',name='Cancelar',exact=True).click()
  await page.get_by_role('link',name='Fluxo',exact=True).click()
  inputs=page.get_by_role('textbox',name='Data (dd/mm/aaaa)')
  if await inputs.count()==0: inputs=page.locator('input[placeholder="dd/mm/aaaa"]')
  await inputs.first.fill('01/02/2026'); await inputs.first.press('Tab')
  await inputs.nth(1).fill('11/02/2026'); await inputs.nth(1).press('Tab')
  estimated=page.get_by_role('row').filter(has_text='Recebimento Estimado').last
  assert (await estimated.inner_text()).count('3.000,00')==10
  assert '3.100,00' in await estimated.inner_text()
  await page.screenshot(path='/tmp/browser/metas/flow.png')
  await page.get_by_role('button',name='Vertical (equipe)',exact=True).click()
  await page.screenshot(path='/tmp/browser/metas/vertical.png')
  assert '3.000,00' in await page.get_by_role('row').filter(has_text='10/02/2026').inner_text()
  assert '3.100,00' in await page.get_by_role('row').filter(has_text='11/02/2026').inner_text()
  await page.get_by_role('link',name='Simulações',exact=True).click()
  await page.get_by_placeholder('Nome da simulação').fill('Divisor fictício')
  await page.get_by_role('button',name='Criar a partir da base e ativar').click()
  await page.get_by_role('link',name='Meta de Faturamento',exact=True).click()
  await page.get_by_role('row').filter(has_text='01/2026').get_by_role('button').click()
  dialog=page.get_by_role('dialog'); await dialog.locator('select').nth(2).select_option('30')
  await dialog.get_by_role('button',name='Revisar alterações').click(); await dialog.get_by_role('button',name='Confirmar configuração').click()
  await page.wait_for_timeout(1000)
  assert state['commits']==1 and D()['targetConfigs']['2026-01']['financial']['divisor']=='dias'
  assert '3.100,00' in await page.get_by_role('row').filter(has_text='01/2026').inner_text()
  await page.reload(); await page.get_by_role('row').filter(has_text='01/2026').wait_for()
  assert '3.000,00' in await page.get_by_role('row').filter(has_text='01/2026').inner_text()
  await page.set_viewport_size({'width':390,'height':844})
  await page.get_by_role('row').filter(has_text='01/2026').get_by_role('button').click()
  await page.screenshot(path='/tmp/browser/metas/mobile.png')
  assert not errors
  print('PASS: rascunho, revisão/voltar, gravação fictícia única, coluna, reload, simulação isolada e retorno real.'); await b.close()
asyncio.run(main())
