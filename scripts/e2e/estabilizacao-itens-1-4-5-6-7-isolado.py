import asyncio,json,re,datetime
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/estab')
def T(id,due,val,st='ativo',**k): return {'id':id,'supplierId':'s1','purchaseCode':'P','document':k.pop('doc','NF-M'),'value':val,'dueDate':due,'extensionDate':None,'extensionHistory':[],'extensionInfo':'','legacyAbatement':None,'origin':'manual','plannedId':None,'effectivationId':None,'categoryId':'k1','notes':'','status':st,**k}
from importlib.machinery import SourceFileLoader
d={"params":{"profile":"legado","startDate":"2026-11-01","saldoInicial":0,"baseGeneration":"g1"},"suppliers":[{"id":"s1","name":"MATHEUS FICTICIO","group":"","terms":[]}],"categories":[{"id":"k1","name":"Material","kind":"compra","group":""},{"id":"k2","name":"Software","kind":"despesa","group":""}],
 "committed":[T('m1','2026-11-25',12000,'cancelado',noteId='nm',parcelNo=1,parcelCount=2),T('m2','2026-12-20',12000,'cancelado',noteId='nm',parcelNo=2,parcelCount=2),T('v1','2026-11-26',50000,doc='NF-VIVA'),T('v2','2026-11-27',30000,doc='NF-SOLO')],
 "planned":[],"expenses":[],"payments":[],"receipts":[],"months":[],"effectivations":[],"platforms":[],"bankAccounts":[],"cards":[]}
D=d
fixture={'authReady':True,'user':{'id':'fixture-user','email':'teste-isolado@example.test'},'official':{'status':'ready','orgId':'fixture-org','orgName':'Teste isolado','role':'editor','version':1,'error':''},'orgs':[], 'active':{'id':'base','name':'Base','isBase':True,'data':D},'canEdit':True,'sims':[],'allSims':[], 'ui':{'view':'vertical','start':'','end':'','supplierId':'','group':'','flowMode':'consolidada'},'draft':None,'changes':[],'saveState':'idle','saveMsg':'','conflicts':[],'protectErr':'','pendingOperation':None,'globalReview':None,'confirmationChecking':False,'baseMoved':False}
mock="import {defaultFlowPeriod} from '/src/lib/dates.ts';import {normalizeData} from '/src/lib/engine/actions.ts';import React from 'react';const {useSyncExternalStore}=React;const subs=new Set();let ver=0;const f=window.__fixture;f.active.data=normalizeData(f.active.data);f.base=f.active;Object.assign(f.ui,defaultFlowPeriod());f.setUi=(p)=>{f.ui={...f.ui,...(typeof p==='function'?p(f.ui):p)};ver++;subs.forEach(s=>s());};export const uid=()=>crypto.randomUUID();export function AppProvider({children}){return children;}export function useApp(){useSyncExternalStore(cb=>{subs.add(cb);return()=>subs.delete(cb)},()=>ver);return {...f};}export function useAuditHistory(){return {entries:[],status:'ready',error:'',refresh:()=>{}};}"
async def login(ctx,page):
  await ctx.add_init_script('window.__fixture='+json.dumps(fixture)+';window.__fixture.base=window.__fixture.active; for(const k of ["update","saveOperation","saveSimulationOperation","commitDraft","signOut"]) window.__fixture[k]=()=>{throw new Error("Escrita bloqueada no teste")}; for(const k of ["setActive","reloadOfficial","requestAudit","closeGlobalReview"])window.__fixture[k]=()=>{};')
  async def intercept(route):
   req=route.request
   if '/src/lib/store.tsx' in req.url:
    real=await (await route.fetch()).text(); m=re.search(r'"(/node_modules/\.vite/deps/react\.js\?v=[^"]+)"',real)
    return await route.fulfill(status=200,content_type='application/javascript',body=mock.replace("from 'react'","from '"+(m.group(1) if m else '/node_modules/.vite/deps/react.js')+"'"))
   if req.method not in ['GET','HEAD'] or urlparse(req.url).hostname not in ['localhost','127.0.0.1'] or '/_serverFn/' in req.url:
    blocked.append(req.method+' '+urlparse(req.url).path);return await route.abort()
   await route.continue_()
  await page.route('**/*',intercept)
blocked=[]
state={'commits':'n/a (escritas bloqueadas)'}
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); errors=[]
  # Item 6: abertura do Fluxo em datas fixas (America/Sao_Paulo)
  for iso,exp in [('2026-11-24T15:00:00Z','23/11/2026'),('2026-11-30T02:30:00Z','23/11/2026'),('2027-01-03T12:00:00Z','28/12/2026'),('2026-12-01T12:00:00Z','30/11/2026')]:
   ctx=await b.new_context(viewport={'width':1366,'height':900}); page=await ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
   await page.clock.set_fixed_time(datetime.datetime.fromisoformat(iso.replace('Z','+00:00')))
   await login(ctx,page); await page.goto('http://localhost:8080/'); await page.wait_for_timeout(3500)
   rd=lambda: page.evaluate("()=>{const t=document.querySelector('main tbody tr td');const rows=[...document.querySelectorAll('main tbody tr')];return [t&&t.innerText, rows.length&&rows[rows.length-1].cells[0].innerText]}")
   print('FLUXO',iso,'esperado início',exp,'primeira/última linha',await rd()); await page.screenshot(path=str(OUT/f'fluxo-{iso[:10]}.png'))
   if iso.startswith('2026-11-24'):
     de=page.locator('div:has(> .lbl:text-is("De")) input').first; print('campo De', await de.input_value()); await de.fill('01/12/2026'); await de.blur(); await page.wait_for_timeout(600)
     print('após escolher 01/12', await rd())
     await page.locator('a[href="/lancamentos"]').first.click(); await page.wait_for_timeout(1500); await page.locator('a[href="/"]').first.click(); await page.wait_for_timeout(2000)
     print('FLUXO período escolhido após navegar e voltar:', await rd())
     body=await page.locator('main').inner_text(); print('Fluxo mostra 120,00 cancelado?', '120,00' in body)
   await ctx.close()
  # Itens 1,4,5,7 em Lançamentos
  ctx=await b.new_context(viewport={'width':1536,'height':1000}); page=await ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
  await page.clock.set_fixed_time(datetime.datetime(2026,11,24,15,tzinfo=datetime.timezone.utc))
  await login(ctx,page); await page.goto('http://localhost:8080/lancamentos?tab=committed'); await page.wait_for_timeout(3500)
  print('LISTA',(await page.locator('main table tbody').first.inner_text())[:1500]); await page.screenshot(path=str(OUT/'lista.png'))
  # 4: abrir e fechar sem edição -> fecha imediatamente
  await page.get_by_role('cell',name='NF-SOLO').first.click(); dlg=page.get_by_role('dialog',name='Gerenciar lançamento',exact=True); await dlg.wait_for()
  await dlg.get_by_role('button',name='Cancelar',exact=True).click(); await page.wait_for_timeout(300)
  print('ITEM4 fechou sem diálogo:',await dlg.count()==0, 'decisão aberta:', await page.get_by_role('dialog').count())
  # 7: adicionar parcela + 4 manter rascunho
  await page.get_by_role('cell',name='NF-SOLO').first.click(); await dlg.wait_for()
  await dlg.get_by_role('button',name='+ Adicionar parcela/vencimento').click()
  row=dlg.locator('table.launch-parcels tbody tr').last
  money=row.locator('td[data-label="Valor"] input'); await money.fill('150,00'); await money.blur()
  d=row.locator('td[data-label="Vencimento original"] input'); await d.fill('15/01/2027'); await d.blur()
  await dlg.get_by_label('Justificativa para valores, datas, efetivação ou cancelamento').fill('Parcela adicional negociada')
  st=await dlg.get_by_role('status').filter(has_text='Novo total').inner_text(); print('ITEM7',st)
  await dlg.screenshot(path=str(OUT/'item7-nova-parcela.png'))
  await dlg.get_by_role('button',name='Revisar antes de salvar').click(); rv=page.get_by_role('dialog',name='Revisar lançamento'); await rv.wait_for()
  print('ITEM7 revisão:',(await rv.inner_text())[:900]); await rv.screenshot(path=str(OUT/'item7-revisao.png'))
  await rv.get_by_role('button',name='Voltar').click(); await page.wait_for_timeout(300)
  await page.get_by_role('dialog',name='Gerenciar lançamento').get_by_role('button',name='Cancelar',exact=True).click(); await page.wait_for_timeout(300)
  dec=page.get_by_role('dialog',name=re.compile('Fechar com alterações')); print('ITEM4 opções:', await dec.inner_text() if await dec.count() else 'SEM DIÁLOGO'); await page.screenshot(path=str(OUT/'item4-fechar.png'))
  await dec.get_by_role('button',name='Manter rascunho e fechar').click(); await page.wait_for_timeout(600)
  await page.get_by_role('cell',name='NF-SOLO').first.click(); await page.wait_for_timeout(800)
  print('ITEM4 rascunho restaurado:', await page.get_by_role('dialog',name='Gerenciar lançamento').get_by_role('status').filter(has_text='Novo total').count()==1)
  await page.get_by_role('dialog',name='Gerenciar lançamento').get_by_role('button',name='Cancelar',exact=True).click(); await page.wait_for_timeout(300)
  await page.get_by_role('dialog',name=re.compile('Fechar com alterações')).get_by_role('button',name='Descartar').click(); await page.wait_for_timeout(400)
  print('ITEM4 descartado, diálogos abertos:',await page.get_by_role('dialog').count())
  # 1: cancelada no gerenciar
  await page.get_by_role('cell',name='NF-M').first.click(); await page.wait_for_timeout(800); g=page.get_by_role('dialog',name='Gerenciar lançamento')
  await g.get_by_role('button',name='Resumo',exact=True).click(); await page.wait_for_timeout(300); print('ITEM1 resumo:',(await g.inner_text())[:1200]); await g.screenshot(path=str(OUT/'item1-cancelada.png'))
  await g.get_by_role('button',name='Cancelar',exact=True).click(); await page.wait_for_timeout(300)
  # 5: edição em massa
  await page.get_by_role('checkbox',name=re.compile('Marcar .*NF-VIVA')).check(); await page.get_by_role('checkbox',name=re.compile('Marcar .*NF-SOLO')).check()
  print('ITEM5 barra:',await page.locator('main [role=status]').filter(has_text='marcada').inner_text())
  await page.get_by_role('button',name='Editar selecionadas').click(); be=page.get_by_role('dialog',name='Editar parcelas selecionadas'); await be.wait_for()
  await be.get_by_role('button',name='Cancelar',exact=True).click(); await page.wait_for_timeout(300); print('ITEM5 fecha sem edição:',await be.count()==0)
  await page.get_by_role('button',name='Editar selecionadas').click(); await be.wait_for()
  await be.locator('select').first.select_option('extend'); di=be.locator('input').filter(has_text='').nth(2)
  ins=be.locator('input:not([type=radio])'); await ins.first.fill('10/12/2026'); await ins.first.blur()
  await be.locator('textarea').fill('Prorrogação em lote teste'); await be.get_by_role('button',name='Revisar antes de salvar').click()
  rv=page.get_by_role('dialog',name='Revisar edição em massa'); await rv.wait_for(); print('ITEM5 revisão:',(await rv.inner_text())[:1200]); await rv.screenshot(path=str(OUT/'item5-revisao.png'))
  await rv.get_by_role('button',name='Voltar').click(); await page.get_by_role('dialog',name='Editar parcelas selecionadas').locator('select').first.select_option('cancel')
  print('ITEM5 cancelar totais:',await page.get_by_role('dialog',name='Editar parcelas selecionadas').get_by_role('status').inner_text())
  print('chamadas bloqueadas',blocked,'erros',errors)
  await b.close()
asyncio.run(main())
