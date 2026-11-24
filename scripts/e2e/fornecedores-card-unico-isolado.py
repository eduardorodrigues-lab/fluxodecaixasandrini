# Fornecedores: card único (visualizar/editar/cadastrar) e cadastro completo dentro do lançamento.
# Ambiente SINTÉTICO: store simulado com persistência em memória/localStorage do teste (applyOps); toda rede de escrita é bloqueada.
import asyncio,json,datetime,re
from pathlib import Path
from urllib.parse import urlparse
OUT=Path('/tmp/browser/forn2'); OUT.mkdir(parents=True,exist_ok=True)
T=lambda *t: list(t)+[None]*(10-len(t))
sups=[{"id":"a","name":"ALFA FICT","group":"","terms":T(30,60),"legalName":"ALFA FICTICIA LTDA","aliases":["Alfa Antiga"]},{"id":"m","name":"ALFA VELHA","group":"","terms":T(1),"mergedInto":"a"}]+[{"id":f"s{i}","name":f"FORNECEDOR {i:02d}","group":"","terms":T(30)} for i in range(12)]
D={"suppliers":sups,"planned":[],"committed":[{"id":"c1","supplierId":"a","purchaseCode":"P","document":"NF1","value":10000,"dueDate":"2026-12-10","extensionDate":None,"extensionHistory":[],"extensionInfo":"","legacyAbatement":None,"origin":"manual","plannedId":None,"effectivationId":None,"notes":"","status":"ativo","categoryId":"cat1","baseDate":"2026-11-10"},{"id":"c2","supplierId":"m","purchaseCode":"P2","document":"NF2","value":5000,"dueDate":"2026-12-15","extensionDate":None,"extensionHistory":[],"extensionInfo":"","legacyAbatement":None,"origin":"manual","plannedId":None,"effectivationId":None,"notes":"","status":"ativo","categoryId":"cat1","baseDate":"2026-11-10"}],
   "expenses":[],"receipts":[],"adjustments":[],"categories":[{"id":"cat1","name":"Mercadoria para a revenda","kind":"compra","group":""}],"platforms":[],"payments":[],"effectivations":[],"importLog":[],"bankAccounts":[],"transfers":[],"cards":[],"cardOps":[]}
def fixture(role='editor'):
  return {'authReady':True,'user':{'id':'u1','email':'teste@example.test'},'official':{'status':'ready','orgId':'org-teste','orgName':'Teste','role':role,'version':1,'error':''},'orgs':[],'active':{'id':'base','name':'Base','isBase':True,'data':D},'canEdit':role!='viewer','sims':[],'allSims':[],'ui':{'view':'vertical','start':'','end':'','supplierId':'','group':'','flowMode':'consolidada'},'draft':None,'changes':[],'saveState':'idle','saveMsg':'','conflicts':[],'protectErr':'','pendingOperation':None,'globalReview':None,'confirmationChecking':False,'baseMoved':False}
mock=("import {defaultFlowPeriod} from '/src/lib/dates.ts';import {normalizeData} from '/src/lib/engine/actions.ts';import {applyOps} from '/src/lib/diff.ts';import React from 'react';const {useSyncExternalStore}=React;const subs=new Set();let ver=0;const f=window.__fixture;"
 "const saved=localStorage.getItem('fixture-db');if(saved){const s=JSON.parse(saved);f.active.data=s.data;f.official.version=s.version;}f.active.data=normalizeData(f.active.data);f.base=f.active;Object.assign(f.ui,defaultFlowPeriod());"
 "const bump=()=>{ver++;subs.forEach(s=>s());};f.setUi=(p)=>{f.ui={...f.ui,...(typeof p==='function'?p(f.ui):p)};bump();};window.__commits=window.__commits||[];"
 "f.saveOperation=async(req)=>{if(window.__commits.some(c=>c.requestId===req.requestId))return;const r=applyOps(f.active.data,req.ops,true);if(r.conflicts.length)throw new Error('Conflito');f.active={...f.active,data:r.data};f.base=f.active;f.official={...f.official,version:f.official.version+1};window.__commits.push({requestId:req.requestId,ops:req.ops.length});localStorage.setItem('fixture-db',JSON.stringify({data:f.active.data,version:f.official.version}));bump();};"
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
overlay=lambda page: page.locator('div.fixed.inset-0').count()
async def main():
  from playwright.async_api import async_playwright
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); errs=[]
    ctx=await b.new_context(viewport={'width':1600,'height':1100}); page=await ctx.new_page(); page.on('pageerror',lambda e:errs.append(str(e)))
    await page.clock.set_fixed_time(datetime.datetime(2026,11,24,15,tzinfo=datetime.timezone.utc))
    await login(ctx,page); await page.goto('http://localhost:8080/referencias'); await page.wait_for_timeout(3000)
    await page.evaluate("localStorage.removeItem('fixture-db')"); await page.reload(); await page.wait_for_timeout(3000)
    await page.get_by_label('Buscar fornecedor').fill('alfa'); await page.wait_for_timeout(300)
    print('busca por apelido/nome: linhas', await page.locator('.sup-table tbody tr').count())
    await page.get_by_label('Buscar fornecedor').fill('alfa antiga'); await page.wait_for_timeout(300); print('apelido encontra principal:', (await page.locator('.sup-table tbody tr').first.inner_text()).split('\n')[0])
    await page.get_by_role('button',name='Editar ALFA FICT').click(); await page.wait_for_timeout(500)
    print('EDITAR: overlay/dialog =', await overlay(page), await page.get_by_role('dialog').count(), '| lista visível:', await page.locator('.sup-table').is_visible(), '| busca mantida:', await page.get_by_label('Buscar fornecedor').input_value())
    card=page.locator('section.sup-detail'); print('card editável com dados e condições:', await card.get_by_label('Código de origem').count()==1, 'Condições (' in await card.inner_text())
    await page.screenshot(path=str(OUT/'1_editar_inline.png'))
    await card.get_by_label('Fechar').click(); await page.wait_for_timeout(300); print('fechar sem edição: imediato, card de visualização:', await page.locator('aside.sup-detail').count())
    await page.get_by_role('button',name='Editar ALFA FICT').click(); await page.wait_for_timeout(300); card=page.locator('section.sup-detail')
    await card.get_by_label('Origem do código').fill('FLUXO xlsm'); await card.get_by_label('Código de origem').fill('999')
    await card.get_by_role('button',name='Revisar e confirmar').click(); await page.wait_for_timeout(300); print('revisão no mesmo card:', 'Código de origem' in await card.inner_text(), 'dialogs', await page.get_by_role('dialog').count())
    await card.get_by_role('button',name='Salvar fornecedor').click(); await page.wait_for_timeout(1200)
    print('commits após editar:', await page.evaluate('window.__commits'), '| card voltou a visualização:', await page.locator('aside.sup-detail').count(), '| busca mantida:', await page.get_by_label('Buscar fornecedor').input_value())
    print('código exibido:', '999' in await page.locator('aside.sup-detail').inner_text())
    # NOVO
    await page.get_by_label('Buscar fornecedor').fill(''); await page.get_by_role('button',name='Fornecedor',exact=True).click(); await page.wait_for_timeout(300)
    card=page.locator('section.sup-detail'); print('NOVO no mesmo card; overlay', await overlay(page), 'dialog', await page.get_by_role('dialog').count())
    await card.get_by_role('button',name='Cancelar').click(); await page.wait_for_timeout(300); print('cancelar novo limpo: fechou', await page.locator('section.sup-detail').count()==0, 'commits', len(await page.evaluate('window.__commits')))
    await page.get_by_role('button',name='Fornecedor',exact=True).click(); await page.wait_for_timeout(300); card=page.locator('section.sup-detail')
    await card.get_by_label('Nome comercial').fill('BETA SINTÉTICA'); await card.get_by_label('Razão social').fill('BETA SINTETICA LTDA')
    await card.get_by_role('button',name='Nova condição').click(); await card.get_by_label('Nome da condição 1').fill('30/60 padrão negociado')
    await card.locator('input.num, input[inputmode=numeric]').last.fill('30'); await card.locator('input.num, input[inputmode=numeric]').last.blur()
    await page.screenshot(path=str(OUT/'2_novo_inline.png'))
    await card.get_by_role('button',name='Revisar e confirmar').click(); await page.wait_for_timeout(300); t=await card.inner_text(); print('revisão novo: CNPJ', 'Não informado' in t, '| sem vigência', 'sem vigência' in t)
    await card.get_by_role('button',name='Confirmar fornecedor').click(); await page.wait_for_timeout(1200)
    cs=await page.evaluate('window.__commits'); print('commits após novo:', len(cs), '| pede segundo salvar?', await page.get_by_text('Alterações não salvas').count())
    await page.get_by_label('Buscar fornecedor').fill('beta'); await page.wait_for_timeout(300); print('novo listado:', await page.locator('.sup-table tbody tr').count(), (await page.locator('aside.sup-detail').inner_text())[:200].replace('\n',' | '))
    # reload sintético
    await page.reload(); await page.wait_for_timeout(3000); await page.get_by_label('Buscar fornecedor').fill('beta'); await page.wait_for_timeout(300)
    print('após reload: persistido', await page.locator('.sup-table tbody tr').count(), '| commits novos', len(await page.evaluate('window.__commits||[]')))
    # LANÇAMENTO
    await page.goto('http://localhost:8080/lancamentos?tab=committed'); await page.wait_for_timeout(3000)
    print('erros até aqui', errs[-3:]); await page.screenshot(path=str(OUT/'lanc_pre.png')); await page.get_by_role("button", name="+ Novo lançamento").click(timeout=20000); await page.get_by_role("button", name="Efetivado").last.click(); await page.wait_for_timeout(600)
    dl=page.get_by_role("dialog").last
    await dl.get_by_role("textbox").nth(1).fill("NF-SINT-1")
    sel=dl.locator("[data-supplier-combobox] input"); await sel.click(); await sel.fill('GAMA NOVA'); await page.wait_for_timeout(300)
    await page.locator("ul[role=listbox] button", has_text='Cadastrar fornecedor').click(); await page.wait_for_timeout(400)
    sc=dl.locator('section[aria-label="Cadastrar fornecedor neste lançamento"]')
    print('LANÇAMENTO: cadastro inline completo:', await sc.count(), await sc.get_by_label('CNPJ').count(), await sc.get_by_label('Código de origem').count(), '| dialogs', await page.get_by_role('dialog').count())
    await page.screenshot(path=str(OUT/'3_lancamento_cadastro.png'))
    await sc.get_by_role('button',name='Cancelar').click(); await page.wait_for_timeout(300)
    print('cancelar cadastro: sem criar; doc preservado:', await dl.get_by_role("textbox").nth(1).input_value(), '| commits', len(await page.evaluate('window.__commits||[]')))
    await sel.click(); await sel.fill('GAMA NOVA'); await page.wait_for_timeout(300); await page.locator("ul[role=listbox] button", has_text='Cadastrar fornecedor').click(); await page.wait_for_timeout(300)
    sc=dl.locator('section[aria-label="Cadastrar fornecedor neste lançamento"]'); await sc.get_by_label('Razão social').fill('GAMA NOVA LTDA')
    await sc.get_by_role('button',name='Revisar e confirmar').click(); await sc.get_by_role('button',name='Cadastrar e selecionar').click(); await page.wait_for_timeout(500)
    print('selecionado:', await sel.input_value(), '| doc preservado:', await dl.get_by_role("textbox").nth(1).input_value(), '| commits (só grava com o lançamento):', len(await page.evaluate('window.__commits||[]')))
    print('sem condição: aviso', await dl.get_by_text('sem condição vigente definida').count())
    await page.screenshot(path=str(OUT/'4_lancamento_selecionado.png'))
    await ctx.close()
    # mobile
    ctx=await b.new_context(viewport={'width':390,'height':844}); page=await ctx.new_page(); await login(ctx,page); await page.goto('http://localhost:8080/referencias'); await page.wait_for_timeout(3000)
    await page.get_by_role('button',name='Editar ALFA FICT').click(); await page.wait_for_timeout(400); print('MOBILE editar: overlay', await overlay(page), 'card', await page.locator('section.sup-detail').count())
    await page.locator('section.sup-detail').scroll_into_view_if_needed(); await page.screenshot(path=str(OUT/'5_mobile.png')); await ctx.close()
    # leitor
    ctx=await b.new_context(viewport={'width':1400,'height':900}); page=await ctx.new_page(); await login(ctx,page,'viewer'); await page.goto('http://localhost:8080/referencias'); await page.wait_for_timeout(3000)
    print('LEITOR: botões editar', await page.get_by_role('button',name=re.compile('^Editar ')).count(), '| + Fornecedor', await page.get_by_role('button',name='Fornecedor',exact=True).count()); await ctx.close()
    print('erros', errs[:3], '| rede de escrita bloqueada', len(blocked))
asyncio.run(main())
