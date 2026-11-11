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
  elif u.endswith("#listAudit"):
    rows=[]
    if state['commits']:
      change={'entity':'Configuração financeira mensal','id':'2026-01','kind':'alteração','before':doc['targetConfigs']['2026-01'],'after':D()['targetConfigs']['2026-01'],'fields':['financial']}
      rows=[obj(['id','at','user_email','version_from','version_to','summary','changesJson'],[sv('audit-test'),sv('2026-11-11T16:05:00Z'),sv('teste-isolado@example.invalid'),{'t':0,'s':1},{'t':0,'s':2},sv('Metas revisadas'),sv(json.dumps([change]))])]
    body=wrap({'t':9,'i':next(_ids),'a':rows,'o':0})
  elif u.endswith("#commitOfficial"):
    state["data"]=find_json(route.request.post_data); state["v"]+=1; state["commits"]+=1
    body=wrap(obj(["status","version","summary"],[sv("ok"),{"t":0,"s":state["v"]},sv("")]))
  else:
    return await route.abort()  # qualquer outra função do servidor é bloqueada
  await route.fulfill(status=200, headers={"content-type":"application/json","x-tss-serialized":"true"}, body=body)
def D(): return json.loads(state["data"])


from pathlib import Path
SHOTS='/tmp/browser/relatorios'; os.makedirs(SHOTS,exist_ok=True)
f={"deflator1":0,"deflator2":0,"base1":"bruto","base2":"apos_r1","divisor":"30","lagDays":10}
doc['params'].update({'startDate':'2026-01-01','lagDays':10,'saldoInicial':2000000})
doc['targets']={'2026-01':9300000,'2026-02':5600000}
doc['targetConfigs']={m:{'gross':v,'legacyReducer':0,'webR1':0,'webR2':0,'divisorLegado':'30','divisorWeb':'30','r2Base':'apos_r1','lagDays':10,'version':1,'history':[],'financial':f} for m,v in doc['targets'].items()}
doc['suppliers']=[{'id':'s'+str(i),'name':'Fornecedor isolado '+str(i),'terms':[],'group':''} for i in range(1,7)]
doc['committed']=[dict(doc['committed'][0],id='c'+str(i),supplierId='s'+str(i%6+1),document='NF-'+str(i),value=100000+i*1000,dueDate='2026-11-'+str(i%28+1).zfill(2),parcelNo=1,parcelCount=2) for i in range(1,31)]
doc['expenses']=[{'id':'e1','supplierId':'s1','document':'DESP-1','value':250000,'baseDate':'2026-11-15','termDays':0,'extensionDate':None,'extensionHistory':[],'categoryId':'k2','status':'ativo','notes':''}]
state['data']=json.dumps(doc)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={'width':1366,'height':768})
  await ctx.route('**/_serverFn/**',handler)
  fake_user=json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']; fake_user['email']='teste-isolado@example.invalid'
  await ctx.route('**/auth/v1/user',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps(fake_user)))
  await ctx.route(re.compile(r'.*/rest/v1/.*'),lambda r:r.abort())
  page=await ctx.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>{localStorage.clear();localStorage.setItem(k,v)}',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  await page.goto('http://localhost:8080/dashboard'); await page.get_by_role('heading',name='Dashboard',exact=True).wait_for()
  await page.screenshot(path=SHOTS+'/dashboard-1366.png')
  assert await page.locator('.dashboard-kpi').count()==15
  assert await page.locator('.dashboard-chart-section').count()==4
  print('geometry initial',await page.evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})'))
  await page.locator('.dashboard-kpi').filter(has_text='Total em aberto').click()
  await page.wait_for_timeout(350); await page.screenshot(path=SHOTS+'/dashboard-expanded-1366.png')
  bounds=await page.evaluate('''(()=>{const t=document.querySelector('.dashboard-source').getBoundingClientRect();const a=document.querySelector('.dashboard-table-wrap').getBoundingClientRect();return {table:t.bottom,area:a.bottom}})()'''); assert bounds['table'] <= bounds['area']+1,bounds
  assert await page.locator('.dashboard-kpi').count()==15
  assert await page.locator('.dashboard-info h3').all_text_contents()==['Dados','Observações / considerações','Legenda / critério']
  assert await page.locator('.dashboard-source th').count()==8
  await page.get_by_role('button',name='Próxima',exact=True).click(); assert 'Página 2' in await page.locator('.dashboard-report').inner_text()
  await page.locator('.dashboard-plot svg [role=button]').first.click(); assert await page.get_by_role('button',name='Mostrar todos').is_visible()
  await page.get_by_role('button',name='Mostrar todos').click()
  await page.get_by_role('button',name='Minimizar',exact=True).click()
  await page.get_by_role('button',name='Ocultar menu').click()
  await page.screenshot(path=SHOTS+'/dashboard-collapsed-1366.png')
  print('geometry collapsed',await page.evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})'))
  for key in ['Maior fornecedor','Vencidos','A vencer 7','A vencer 15','A vencer 30','Vencimentos do período','Efetivado pendente','Despesas pendentes','Sem vencimento','Situação a confirmar','Previsão restante','Saldo mínimo','Primeiro saldo negativo','Necessidade de caixa']:
   await page.locator('.dashboard-kpi').filter(has_text=key).click(); assert await page.get_by_role('heading',name='Relatório dos dados').is_visible()
  await page.get_by_role('button',name='Minimizar',exact=True).click()
  await page.set_viewport_size({'width':1920,'height':1080}); await page.screenshot(path=SHOTS+'/dashboard-1920.png')
  for show_menu in [False,True]:
   if show_menu: await page.get_by_role('button',name='Mostrar menu').click()
   for name in ['Saldo projetado no período','Fornecedores em aberto','Vencimentos do período','Despesas por subgrupo']:
    await page.get_by_role('button',name='Expandir '+name,exact=True).click(); await page.wait_for_timeout(300)
    geom=await page.evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})'); assert geom['sw']==geom['w'] and geom['sh']==geom['h'],geom
    marks=page.locator('.dashboard-plot svg [role=button]')
    if await marks.count():
     await marks.first.press('Enter'); assert await page.get_by_role('button',name='Mostrar todos').is_visible(); await page.get_by_role('button',name='Mostrar todos').click()
    await page.get_by_role('button',name='Minimizar',exact=True).click()
   await page.get_by_label('Fornecedor do dashboard').select_option('s1'); await page.locator('.dashboard-kpi').filter(has_text='Total em aberto').click(); await page.get_by_role('button',name='Minimizar',exact=True).click(); assert await page.get_by_label('Fornecedor do dashboard').input_value()=='s1'; await page.get_by_label('Fornecedor do dashboard').select_option('')
  await page.get_by_role('button',name='Ocultar menu').click()
  await page.get_by_role('button',name='Mostrar menu').click()
  await page.get_by_role('link',name='Meta de Faturamento',exact=True).click()
  await page.locator('.metas-table').wait_for()
  assert await page.locator('.metas-table thead th').count()==13
  await page.set_viewport_size({'width':1366,'height':768}); await page.screenshot(path=SHOTS+'/metas-1366.png')
  print('geometry metas',await page.evaluate('({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight})'))
  jan=page.get_by_role('row').filter(has=page.get_by_role('textbox',name='Faturamento 01/2026',exact=True))
  await page.get_by_label('Distribuição diária 01/2026').select_option('dias')
  assert '3.000,00' in await jan.inner_text()
  await page.get_by_role('textbox',name='Deflator 1 02/2026',exact=True).fill('25'); await page.get_by_role('textbox',name='Deflator 1 02/2026',exact=True).press('Tab')
  await page.get_by_role('textbox',name='Deflator 2 02/2026',exact=True).fill('18'); await page.get_by_role('textbox',name='Deflator 2 02/2026',exact=True).press('Tab')
  assert state['commits']==0
  await page.get_by_role('button',name='Renomear deflator 1',exact=True).click()
  dialog=page.get_by_role('dialog'); await dialog.get_by_role('textbox').fill('Devoluções'); await dialog.get_by_role('button',name='Usar nome no rascunho').click()
  await page.get_by_label('Novo mês (mm/aaaa)').fill('012026'); await page.get_by_role('button',name='Adicionar mês').click(); assert 'já está' in await page.get_by_role('alert').inner_text()
  await page.get_by_label('Novo mês (mm/aaaa)').fill('132026'); await page.get_by_role('button',name='Adicionar mês').click(); assert '01 a 12' in await page.get_by_role('alert').inner_text()
  await page.get_by_role('button',name='Selecionar mês e ano').click(); await page.get_by_label('Ano do novo mês').fill('2027'); await page.get_by_role('button',name='Março',exact=True).click(); assert await page.get_by_label('Novo mês (mm/aaaa)').input_value()=='03/2027'
  await page.get_by_role('button',name='Adicionar mês').click()
  await page.get_by_role('button',name='Revisar e confirmar').click(); dialog=page.get_by_role('dialog'); await dialog.get_by_role('button',name='Voltar',exact=True).click()
  assert await page.get_by_label('Distribuição diária 01/2026').input_value()=='dias'
  await page.get_by_role('button',name='Revisar e confirmar').click(); await page.get_by_role('dialog').get_by_role('button',name='Confirmar metas').click()
  await page.wait_for_timeout(1800); assert state['commits']==1
  assert D()['targetConfigs']['2026-01']['financial']['divisor']=='dias'
  await page.reload(); await page.get_by_label('Distribuição diária 01/2026').wait_for(); assert await page.get_by_label('Distribuição diária 01/2026').input_value()=='dias'
  await page.get_by_role('button',name='Histórico 01/2026',exact=True).click(); await page.get_by_role('dialog').wait_for(); assert 'teste-isolado@example.invalid' in await page.get_by_role('dialog').inner_text(); await page.screenshot(path=SHOTS+'/metas-history.png'); await page.get_by_role('dialog').get_by_role('button',name='Fechar',exact=True).click()
  await page.get_by_label('Distribuição diária 01/2026').select_option('30'); await page.get_by_role('button',name='Descartar',exact=True).click(); await page.get_by_role('dialog').get_by_role('button',name='Descartar',exact=True).click(); assert await page.get_by_label('Distribuição diária 01/2026').input_value()=='dias'
  await page.set_viewport_size({'width':1920,'height':1080}); await page.screenshot(path=SHOTS+'/metas-1920.png')
  await page.get_by_role('link',name='Fluxo',exact=True).click()
  inputs=page.locator('input[placeholder="dd/mm/aaaa"]'); await inputs.first.fill('01/02/2026'); await inputs.first.press('Tab'); await inputs.nth(1).fill('11/02/2026'); await inputs.nth(1).press('Tab')
  estimated=page.get_by_role('row').filter(has_text='Recebimento Estimado').last
  assert (await estimated.inner_text()).count('3.000,00')==10
  assert '1.148,00' in await estimated.inner_text()
  await page.screenshot(path=SHOTS+'/flow-after-reload.png')
  await page.get_by_role('button',name='Vertical (equipe)',exact=True).click(); assert '3.000,00' in await page.get_by_role('row').filter(has_text='10/02/2026').inner_text()
  await page.get_by_role('link',name='Meta de Faturamento',exact=True).click()
  await page.get_by_label('Distribuição diária 01/2026').select_option('30'); await page.get_by_role('button',name='Revisar e confirmar').click(); await page.get_by_role('dialog').get_by_role('button',name='Voltar',exact=True).click(); await page.get_by_role('button',name='Descartar',exact=True).click(); await page.get_by_role('dialog').get_by_role('button',name='Descartar',exact=True).click()
  await page.get_by_role('link',name='Simulações',exact=True).click(); await page.get_by_placeholder('Nome da simulação').fill('Metas isoladas'); await page.get_by_role('button',name='Criar a partir da base e ativar').click()
  await page.get_by_role('link',name='Meta de Faturamento',exact=True).click(); await page.get_by_label('Distribuição diária 01/2026').select_option('30'); await page.get_by_role('button',name='Revisar e confirmar').click(); await page.get_by_role('dialog').get_by_role('button',name='Confirmar metas').click(); await page.wait_for_timeout(1000); assert state['commits']==1
  await page.set_viewport_size({'width':390,'height':844}); await page.get_by_role('button',name='Ocultar menu').click(); await page.screenshot(path=SHOTS+'/metas-mobile.png')
  await page.get_by_role('button',name='Mostrar menu').click(); await page.get_by_role('link',name='Dashboard',exact=True).click(); await page.get_by_role('button',name='Ocultar menu').click(); await page.screenshot(path=SHOTS+'/dashboard-mobile.png')
  await page.locator('.dashboard-kpi').filter(has_text='Total em aberto').click(); await page.wait_for_timeout(400); await page.locator('.dashboard-expanded').scroll_into_view_if_needed(); await page.screenshot(path=SHOTS+'/dashboard-mobile-expanded.png')
  assert await page.locator('.dashboard-source th').count()==8
  await page.locator('.dashboard-plot svg [role=button]').first.press('Enter'); assert await page.get_by_role('button',name='Mostrar todos').is_visible()
  await page.get_by_role('button',name='Mostrar todos').click(); await page.get_by_role('button',name='Minimizar',exact=True).click()
  await page.get_by_role('button',name='Mostrar menu').click(); await page.get_by_role('link',name='Meta de Faturamento',exact=True).click(); await page.get_by_role('button',name='Ocultar menu').click()
  await page.get_by_label('Distribuição diária 01/2026').select_option('dias'); await page.get_by_role('button',name='Revisar e confirmar').click(); await page.get_by_role('dialog').wait_for(); await page.screenshot(path=SHOTS+'/metas-mobile-review.png'); await page.get_by_role('dialog').get_by_role('button',name='Voltar',exact=True).click()
  assert state['commits']==1
  assert not errors, errors
  print('PASS: 15KPIs/4gráficos/expansão/seleção/paginação/minimizar; 13colunas/edição/nomes/mês/revisão/voltar/confirmar/reload/descarte/simulação; uma gravação apenas interceptada')
  await b.close()
asyncio.run(main())
