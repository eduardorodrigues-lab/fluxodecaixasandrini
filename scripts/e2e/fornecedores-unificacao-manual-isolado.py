# Fornecedores: card único (visualizar/editar/cadastrar) e cadastro completo dentro do lançamento.
# Ambiente SINTÉTICO: store simulado com persistência em memória/localStorage do teste (applyOps); toda rede de escrita é bloqueada.
import asyncio,json,datetime,re
from pathlib import Path
from urllib.parse import urlparse
OUT=Path('/tmp/browser/merge'); OUT.mkdir(parents=True,exist_ok=True)
T=lambda *t: list(t)+[None]*(10-len(t))
sups=[{"id":"g1","name":"GAMA FICT","group":"","terms":T(30,60),"conditions":[{"id":"g1c","name":"Original GAMA","terms":T(30,60),"from":None,"at":"","by":""}]},{"id":"g2","name":"123 GAMA FICTICIA LTDA","group":"","terms":T(45),"legalName":"GAMA FICTICIA LTDA","sourceCodes":[{"source":"FLUXO xlsm","code":"123"}],"conditions":[{"id":"g2c","name":"ESPECIAL JUNHO","terms":T(45,75),"from":"2026-06-01","at":"","by":"","kind":"especial","scope":"pedido 77"}]},{"id":"g3","name":"Gama Fict.","group":"","terms":T()},{"id":"g4","name":"GAMA OUTRA","group":"","terms":T(10),"cnpj":"11.111.111/0001-11"},{"id":"g5","name":"GAMA DIFERENTE","group":"","terms":T(10),"cnpj":"22.222.222/0001-22"},{"id":"a","name":"ALFA FICT","group":"","terms":T(30,60),"legalName":"ALFA FICTICIA LTDA","aliases":["Alfa Antiga"]},{"id":"m","name":"ALFA VELHA","group":"","terms":T(1),"mergedInto":"a"}]+[{"id":f"s{i}","name":f"FORNECEDOR {i:02d}","group":"","terms":T(30)} for i in range(12)]
D={"suppliers":sups,"planned":[],"committed":[{"id":"c1","supplierId":"a","purchaseCode":"P","document":"NF1","value":10000,"dueDate":"2026-12-10","extensionDate":None,"extensionHistory":[],"extensionInfo":"","legacyAbatement":None,"origin":"manual","plannedId":None,"effectivationId":None,"notes":"","status":"ativo","categoryId":"cat1","baseDate":"2026-11-10"},{"id":"c2","supplierId":"m","purchaseCode":"P2","document":"NF2","value":5000,"dueDate":"2026-12-15","extensionDate":None,"extensionHistory":[],"extensionInfo":"","legacyAbatement":None,"origin":"manual","plannedId":None,"effectivationId":None,"notes":"","status":"ativo","categoryId":"cat1","baseDate":"2026-11-10"},{"id":"c3","supplierId":"g2","purchaseCode":"P3","document":"NF3","value":12001,"dueDate":"2026-12-20","extensionDate":None,"extensionHistory":[],"extensionInfo":"","legacyAbatement":None,"origin":"manual","plannedId":None,"effectivationId":None,"notes":"","status":"ativo","categoryId":"cat1","baseDate":"2026-11-10"}],
   "expenses":[{"id":"e1","supplierId":"","document":"Gama Fict.","value":99,"baseDate":"2026-12-01","dueDays":0,"categoryId":"cat1","status":"ativo","notes":"","origin":"manual"}],"receipts":[],"adjustments":[],"categories":[{"id":"cat1","name":"Mercadoria para a revenda","kind":"compra","group":""}],"platforms":[],"payments":[{"id":"pg1","refId":"c3","amount":1000,"date":"2026-11-20"}],"effectivations":[],"importLog":[],"bankAccounts":[],"transfers":[],"cards":[],"cardOps":[]}
def fixture(role='editor'):
  return {'authReady':True,'user':{'id':'u1','email':'teste@example.test'},'official':{'status':'ready','orgId':'org-teste','orgName':'Teste','role':role,'version':1,'error':''},'orgs':[],'active':{'id':'base','name':'Base','isBase':True,'data':D},'canEdit':role!='viewer','sims':[],'allSims':[],'ui':{'view':'vertical','start':'','end':'','supplierId':'','group':'','flowMode':'consolidada'},'draft':None,'changes':[],'saveState':'idle','saveMsg':'','conflicts':[],'protectErr':'','pendingOperation':None,'pendingOperations':[],'globalReview':None,'confirmationChecking':False,'baseMoved':False}
mock=("import {defaultFlowPeriod} from '/src/lib/dates.ts';import {normalizeData} from '/src/lib/engine/actions.ts';import {prepareCommit} from '/src/lib/commitCore.ts';import React from 'react';const {useSyncExternalStore}=React;const subs=new Set();let ver=0;const f=window.__fixture;"
 "const saved=localStorage.getItem('fixture-db');if(saved){const s=JSON.parse(saved);f.active.data=s.data;f.official.version=s.version;}f.active.data=normalizeData(f.active.data);f.base=f.active;Object.assign(f.ui,defaultFlowPeriod());"
 "const bump=()=>{ver++;subs.forEach(s=>s());};f.setUi=(p)=>{f.ui={...f.ui,...(typeof p==='function'?p(f.ui):p)};bump();};window.__commits=window.__commits||[];"
 "window.__db=window.__db||null;f.saveOperation=async(req)=>{req.submittedAt=req.submittedAt||Date.now();req.phase='sent';window.__sends=(window.__sends||0)+1;if(window.__commits.some(c=>c.requestId===req.requestId)){window.__dup=(window.__dup||0)+1;return;}const cur=window.__other?window.__other(f.active.data):f.active.data;const r=await prepareCommit(cur,'org',req.requestId,req.ops,req.dependencies,f.user.email);if(r.status!=='ready'){window.__rejects=(window.__rejects||[]).concat([r.status==='conflict'?JSON.parse(r.conflictsJson)[0]?.server:r.status]);throw new Error('Recusado pelo servidor: '+(r.status==='conflict'?JSON.parse(r.conflictsJson)[0]?.server:r.status));}f.active={...f.active,data:r.next};f.base=f.active;f.official={...f.official,version:f.official.version+1};window.__commits.push({requestId:req.requestId,ops:req.ops.length});localStorage.setItem('fixture-db',JSON.stringify({data:f.active.data,version:f.official.version}));bump();if(window.__loseOnce){window.__loseOnce=false;throw new Error('Resposta perdida (simulada)');}};"
 "export const uid=()=>crypto.randomUUID();export function AppProvider({children}){return children;}export function useApp(){useSyncExternalStore(cb=>{subs.add(cb);return()=>subs.delete(cb)},()=>ver);return {...f};}export function useAuditHistory(){return {entries:[],status:'ready',error:'',refresh:()=>{}};}")
blocked=[]
async def login(ctx,page,role='editor'):
  await ctx.add_init_script('window.__fixture='+json.dumps(fixture(role))+';for(const k of ["update","saveSimulationOperation","commitDraft","signOut"]) window.__fixture[k]=()=>{throw new Error("Escrita bloqueada")}; for(const k of ["setActive","reloadOfficial","requestAudit","closeGlobalReview"])window.__fixture[k]=()=>{};')
  async def intercept(route):
    req=route.request
    if '/src/lib/store.tsx' in req.url:
      real=await (await route.fetch()).text(); m=re.search(r'"(/node_modules/\.vite/deps/react\.js\?v=[^"]+)"',real)
      return await route.fulfill(status=200,content_type='application/javascript',body=mock.replace("from 'react'","from '"+(m.group(1) if m else '/node_modules/.vite/deps/react.js')+"'"))
    if req.method not in ['GET','HEAD'] or urlparse(req.url).hostname not in ['localhost','127.0.0.1'] or '/_serverFn/' in req.url:
      blocked.append(req.method+' '+urlparse(req.url).path); return await route.abort()
    await route.continue_()
  await page.route('**/*',intercept)

async def main():
  from playwright.async_api import async_playwright
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); errs=[]
    for role in ['viewer']:
      ctx=await b.new_context(); page=await ctx.new_page(); await login(ctx,page,role); await page.goto('http://localhost:8080/referencias'); await page.wait_for_timeout(3000)
      print('LEITOR: checkboxes', await page.get_by_label('Selecionar GAMA FICT', exact=True).count(), '| botão unificar', await page.get_by_role('button',name='Unificar fornecedores').count()); await ctx.close()
    ctx=await b.new_context(viewport={'width':1600,'height':1100}); page=await ctx.new_page(); page.on('pageerror',lambda e:errs.append(str(e)))
    await page.clock.set_fixed_time(datetime.datetime(2026,11,24,15,tzinfo=datetime.timezone.utc))
    await login(ctx,page); await page.goto('http://localhost:8080/referencias'); await page.wait_for_timeout(3000)
    await page.evaluate("localStorage.removeItem('fixture-db')"); await page.reload(); await page.wait_for_timeout(3000)
    q=page.get_by_label('Buscar fornecedor')
    # seleção de página explícita e limpar
    await page.get_by_label('Selecionar os fornecedores desta página').check(); await page.wait_for_timeout(200)
    print('selecionar página: ', (await page.get_by_role('region',name='Fornecedores selecionados').inner_text()).split('\n')[0], '| total na lista', await page.locator('.sup-table tbody tr').count())
    await page.get_by_role('button',name='Limpar seleção').click()
    await q.fill('gama'); await page.wait_for_timeout(300)
    print('busca "gama" linhas:', await page.locator('.sup-table tbody tr').count(), '(nenhuma selecionada automaticamente:', await page.get_by_role('region',name='Fornecedores selecionados').count()==0, ')')
    for n in ['GAMA FICT','123 GAMA FICTICIA LTDA']: await page.get_by_label(f'Selecionar {n}',exact=True).check()
    print('unificar com 2:', await page.get_by_role('button',name='Unificar fornecedores').is_enabled())
    await q.fill('Gama Fict.'); await page.wait_for_timeout(300); await page.get_by_label('Selecionar Gama Fict.',exact=True).check(); await q.fill('beta'); await page.wait_for_timeout(300)
    bar=await page.get_by_role('region',name='Fornecedores selecionados').inner_text(); print('fora do filtro avisado:', 'fora do filtro' in bar, '| IDs visíveis:', all(i in bar for i in ['g1','g2','g3']))
    await q.fill('gama'); await page.wait_for_timeout(300)
    await page.get_by_role('button',name='Unificar fornecedores').click(); await page.wait_for_timeout(400)
    panel=page.get_by_role('complementary',name='Unificar fornecedores')
    print('REVISÃO no card: overlays', await page.locator('div.fixed.inset-0').count(), 'dialogs', await page.get_by_role('dialog').count(), '| lista visível', await page.locator('.sup-table').is_visible())
    conf=panel.get_by_role('button',name='Confirmar unificação'); print('confirmar bloqueado sem principal:', await conf.is_disabled())
    await panel.get_by_role('radio').first.check(); await page.wait_for_timeout(300)
    await panel.get_by_label('Nome comercial final').fill('GAMA FICT'); t=await panel.inner_text()
    print('mostra condições:', 'ESPECIAL JUNHO' in t and 'Original GAMA' in t, '| sem vigência:', 'SEM vigência' in t, '| razão social conflito:', 'Razões' in t, '| despesa pendente:', 'Não migráveis' in t, '| finanças iguais:', 'iguais' in t)
    await page.screenshot(path=str(OUT/'1_revisao.png'))
    # cancelar não altera
    await panel.get_by_role('button',name='Cancelar').click(); await page.wait_for_timeout(300); print('cancelar: commits', len(await page.evaluate('window.__commits')), '| seleção mantida', await page.get_by_role('region',name='Fornecedores selecionados').count())
    await page.get_by_role('button',name='Unificar fornecedores').click(); await page.wait_for_timeout(300); panel=page.get_by_role('complementary',name='Unificar fornecedores')
    await panel.get_by_role('radio').first.check(); await panel.get_by_label('Nome comercial final').fill('GAMA FICT')
    await panel.get_by_role('radio',name=re.compile('Manter como está')).check(); await panel.get_by_label('Justificativa').fill('Mesma empresa: código 123 e razão social comprovados')
    print('pronto após principal+decisão+justificativa (sem conflito de identidade aqui):', await panel.get_by_role('button',name='Confirmar unificação').is_disabled())
    for cb in await panel.get_by_role('checkbox').all(): await cb.check()
    # outra sessão cria vínculo novo ao incorporado antes da confirmação -> servidor recusa
    await page.evaluate("()=>{window.__other=(d)=>({...d,committed:[...d.committed,{...d.committed[0],id:'cX',supplierId:'g3'}]});}")
    await panel.get_by_role('button',name='Confirmar unificação').click(); await page.wait_for_timeout(1200)
    print('CONFLITO outra sessão: commits', len(await page.evaluate('window.__commits')), '| envios', await page.evaluate('window.__sends||0'), '| motivo:', await page.evaluate('window.__rejects'), '| tela:', [x for x in (await panel.inner_text()).split('\n') if 'ecusad' in x or 'mudou' in x][:2]); await page.screenshot(path=str(OUT/'conflito.png'))
    await page.evaluate("window.__other=null"); await panel.get_by_role('button',name='Cancelar').click(); await page.wait_for_timeout(300)
    # nova revisão; resposta perdida + doubleclick
    await page.get_by_role('button',name='Unificar fornecedores').click(); await page.wait_for_timeout(300); panel=page.get_by_role('complementary',name='Unificar fornecedores')
    await panel.get_by_role('radio').first.check(); await panel.get_by_label('Nome comercial final').fill('GAMA FICT'); await panel.get_by_role('radio',name=re.compile('Manter como está')).check(); await panel.get_by_label('Justificativa').fill('Mesma empresa: código 123 e razão social comprovados')
    for cb in await panel.get_by_role('checkbox').all(): await cb.check()
    await page.evaluate("window.__loseOnce=true"); await panel.get_by_role('button',name='Confirmar unificação').click(); await page.wait_for_timeout(1200)
    print('resposta perdida: commits', len(await page.evaluate('window.__commits')), '| erro exibido', (await panel.inner_text()).count('Resposta perdida')>0, '| botão', await panel.locator('footer button').last.inner_text())
    await page.screenshot(path=str(OUT/'perdida.png'))
    await panel.locator('footer button').last.dblclick(); await page.wait_for_timeout(1200)
    print('reenvio mesmo requestId: commits', len(await page.evaluate('window.__commits')), '| duplicados ignorados', await page.evaluate('window.__dup||0'), '| painel fechou', await page.get_by_role('complementary',name='Unificar fornecedores').count()==0)
    db=await page.evaluate("JSON.parse(localStorage.getItem('fixture-db')).data")
    S={s['id']:s for s in db['suppliers']}
    print('APÓS: g2,g3 mergedInto', S['g2'].get('mergedInto'), S['g3'].get('mergedInto'), '| g4/g5 intactos', 'mergedInto' not in S['g4'] and 'mergedInto' not in S['g5'])
    print('vínculo c3→', [c['supplierId'] for c in db['committed'] if c['id']=='c3'], 'valor', [c['value'] for c in db['committed'] if c['id']=='c3'], '| pagamento', db['payments'], '| despesa sem vínculo', db['expenses'][0]['supplierId']=='')
    print('condições principal:', [(c['name'], c.get('periods')) for c in S['g1']['conditions']])
    await page.reload(); await page.wait_for_timeout(3000); await page.get_by_label('Buscar fornecedor').fill('123 GAMA'); await page.wait_for_timeout(300)
    print('RELOAD: busca nome histórico →', (await page.locator('.sup-table tbody tr').first.inner_text()).strip().split('\n')[0], '| linhas', await page.locator('.sup-table tbody tr').count())
    await page.screenshot(path=str(OUT/'2_apos.png'))
    # CNPJ diferente exige escolha
    await page.get_by_label('Buscar fornecedor').fill('gama'); await page.wait_for_timeout(300)
    for n in ['GAMA OUTRA','GAMA DIFERENTE']: await page.get_by_label(f'Selecionar {n}',exact=True).check()
    await page.get_by_role('button',name='Unificar fornecedores').click(); await page.wait_for_timeout(300); panel=page.get_by_role('complementary',name='Unificar fornecedores')
    await panel.get_by_role('radio').first.check(); await panel.get_by_role('radio',name=re.compile('sem condição vigente|Manter como está')).first.check(); await panel.get_by_label('Justificativa').fill('teste cnpj divergente')
    print('CNPJ diferente: bloqueado sem escolha', await panel.get_by_role('button',name='Confirmar unificação').is_disabled(), '| aviso', 'CNPJs diferentes' in await panel.inner_text())
    await panel.get_by_role('button',name='Cancelar').click()
    # mobile
    m=await b.new_context(viewport={'width':390,'height':900}); mp=await m.new_page(); await login(m,mp); await mp.goto('http://localhost:8080/referencias'); await mp.wait_for_timeout(3000)
    await mp.evaluate("localStorage.removeItem('fixture-db')"); await mp.reload(); await mp.wait_for_timeout(3000)
    await mp.mouse.click(204,30); await mp.wait_for_timeout(400); await mp.get_by_label('Buscar fornecedor').fill('gama'); await mp.wait_for_timeout(300); await mp.screenshot(path=str(OUT/'3a_mobile_lista.png'))
    for n in ['GAMA FICT','Gama Fict.']: await mp.get_by_label(f'Selecionar {n}',exact=True).check()
    await mp.get_by_role('button',name='Unificar fornecedores').click(); await mp.wait_for_timeout(300); pn=mp.get_by_role('complementary',name='Unificar fornecedores'); await pn.get_by_role('radio').first.check(); await pn.scroll_into_view_if_needed()
    await mp.screenshot(path=str(OUT/'3_mobile.png')); print('mobile overlays', await mp.locator('div.fixed.inset-0').count())
    print('erros de página:', errs[:3], '| rede de escrita bloqueada:', len(blocked))
    await b.close()
asyncio.run(main())
