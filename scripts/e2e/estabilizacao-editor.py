# Aceite do fluxo abrir→editar→revisar→salvar 1×→fechar→reabrir→recarregar, com dados FICTÍCIOS em volume
# equivalente ao atual (84 fornecedores, ~4,2 mil planejadas, ~5,5 mil efetivados, ~4 mil despesas, ~7,9 mil baixas).
# Servidor interceptado (nenhuma chamada à base real). Uso: python3 estabilizacao-editor.py owner|editor|viewer
import asyncio,json,os,re,base64,copy,hashlib,sys,time,statistics
from urllib.parse import unquote
from playwright.async_api import async_playwright
ROLE=sys.argv[1] if len(sys.argv)>1 else 'editor'
ORG='e197262e-1453-49b0-aad9-878e80602ee4';OLD='e5775c8d-38b4-496c-a5c5-1433b2cb6c6c'
OUT='/tmp/browser/aceite';os.makedirs(OUT,exist_ok=True)
USER=json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id']
def fixture():
 sup=[{'id':f's{i}','name':f'FORNECEDOR FICTICIO {i:02d}','group':'','terms':[30,60,90]} for i in range(84)]
 cats=[{'id':f'k{i}','kind':'compra' if i<14 else 'despesa','name':('Material' if i==0 else 'Obras e Construções' if i==14 else f'Subgrupo {i}'),'group':''} for i in range(28)]
 planned=[{'id':f'p{i}','supplierId':f's{i%84}','categoryId':f'k{i%14}','purchaseCode':f'F{i}','document':f'FIX{i}','value':315840+i,'baseDate':'2026-11-07','terms':[30,60],'notes':'observação fictícia longa '+('x'*900),'status':'ativo','remainingOverride':None} for i in range(4207)]
 committed=[{'id':f'c{i}','supplierId':f's{i%84}','categoryId':f'k{i%14}','purchaseCode':f'C{i}','document':f'NFC{i}','value':12345+i,'dueDate':'2026-12-%02d'%(1+i%28),'extensionDate':None,'extensionHistory':[],'extensionInfo':'','legacyAbatement':None,'origin':'manual','plannedId':None,'effectivationId':None,'notes':'efetivado fictício '+('y'*200),'status':'ativo'} for i in range(5469)]
 expenses=[{'id':f'e{i}','supplierId':f's{i%84}','document':f'DSP{i}','value':5000+i,'baseDate':'2026-11-%02d'%(1+i%28),'termDays':0,'extensionDate':None,'extensionHistory':[],'categoryId':f'k{14+i%14}','notes':'despesa fictícia '+('z'*150),'status':'ativo'} for i in range(3952)]
 payments=[{'id':f'pg{i}','titleKind':'committed' if i%2 else 'expense','titleId':(f'c{i%5469}' if i%2 else f'e{i%3952}'),'date':'2026-11-10','amount':1000,'note':'','reversedAt':None,'reversalNote':''} for i in range(7894)]
 return {'params':{},'suppliers':sup,'categories':cats,'planned':planned,'committed':committed,'expenses':expenses,'payments':payments}
TABLES={'Fornecedor':'suppliers','Previsão (planejada)':'planned','Efetivado (compra/pedido)':'committed','Despesa':'expenses','Pagamento (baixa)':'payments','Categoria':'categories','Efetivação':'effectivations'}
S={'data':fixture(),'version':200,'role':ROLE,'commits':0,'done':{},'mode':None,'delay':0,'reads':0,'refetch_fail':0,'sent':[]}
def ser(v):
 if v is None:return {'t':2,'s':0}
 if isinstance(v,bool):return {'t':2,'s':2 if v else 3}
 if isinstance(v,str):return {'t':1,'s':v.replace('\\','\\\\').replace('"','\\"')}
 if isinstance(v,(int,float)):return {'t':0,'s':v}
 if isinstance(v,list):return {'t':9,'i':id(v)%100000,'a':[ser(x) for x in v],'o':0}
 return {'t':10,'i':id(v)%100000,'p':{'k':list(v),'v':[ser(x) for x in v.values()]},'o':0}
def wrap(v):return json.dumps({'t':10,'i':0,'p':{'k':['result','error','context'],'v':[ser(v),{'t':2,'s':1},{'t':11,'i':999,'p':{'k':[],'v':[]},'o':0}]},'o':0})
def field(x,k):
 if isinstance(x,dict):
  p=x.get('p',{})
  if k in p.get('k',[]):
   v=p['v'][p['k'].index(k)];return v.get('s') if isinstance(v,dict) else v
  for y in x.values():
   z=field(y,k)
   if z is not None:return z
 if isinstance(x,list):
  for y in x:
   z=field(y,k)
   if z is not None:return z
def apply(ops):
 for op in ops:
  tab=TABLES[op['entity']];rows=S['data'].setdefault(tab,[])
  S['data'][tab]=[x for x in rows if x['id']!=op['id']]
  if op.get('after'):S['data'][tab].append(op['after'])
async def handler(route):
 seg=route.request.url.split('/_serverFn/')[1].split('?')[0];text=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode()
 m=re.search(r'"export":"(\w+?)_createServerFn_handler',text);name=m.group(1) if m else text.split('#')[-1]
 if name=='listMyOrgs':v=[{'orgId':OLD,'name':'Grupo Sandrini','role':'owner','own':True},{'orgId':ORG,'name':'Grupo Sandrini','role':S['role'],'own':False}]
 elif name=='getOfficial':
  S['reads']+=1;print('READ getOfficial',S['reads'],round(time.time(),1),flush=True)
  if S['refetch_fail']>0:S['refetch_fail']-=1;return await route.abort()
  d=S['data']
  for k in ['platforms','effectivations','payments','receipts','adjustments','importLog','bankAccounts','cards','transfers','cardOps','expenses','committed','planned','suppliers','categories']:d.setdefault(k,[])
  d.setdefault('targets',{});d.setdefault('targetConfigs',{});d['params']={'profile':'legado','legacyReducer':0.25,'webR1':0.25,'webR2':0.18,'divisorLegado':'30','divisorWeb':'dias','lagDays':10,'startDate':'2026-11-01','saldoInicial':0}
  v={'orgId':ORG,'orgName':'Grupo Sandrini','role':S['role'],'version':S['version'],'updatedAt':'','normalization':1,'dataJson':json.dumps(d)}
 elif name=='listAudit':v=[]
 elif name=='checkCommitRequest':
  if S.get('check_fail'):return await route.abort()
  req=unquote(route.request.url);v=next(({'version':x['version'],'opsJson':json.dumps(x['ops'])} for k,x in S['done'].items() if k in req),None)
 elif name=='commitOps':
  body=json.loads(route.request.post_data);rid=field(body,'requestId');ops=json.loads(field(body,'opsJson').replace('\\"','"').replace('\\\\','\\'))
  assert field(body,'orgId')==ORG
  S['sent'].append({'rid':rid,'entities':[o['entity'] for o in ops]})
  if S['role']=='viewer':raise AssertionError('viewer sent mutation')
  if S['delay']:await asyncio.sleep(S['delay'])
  mode=S['mode'];S['mode']=None
  if rid in S['done']:v={'status':'duplicate','version':S['done'][rid]['version'],'conflictsJson':'[]'}
  elif mode=='fail':return await route.abort()  # perdido ANTES de gravar
  elif mode=='conflict':v={'status':'conflict','version':S['version'],'conflictsJson':json.dumps([{'change':ops[0],'server':ops[0]['before']}])}
  else:
   fv=S['version'];apply(ops);S['version']+=1;S['commits']+=1;S['done'][rid]={'version':S['version'],'ops':ops}
   ch=json.dumps(ops,ensure_ascii=False,separators=(',',':'))
   v={'status':'ok','version':S['version'],'conflictsJson':'[]'}
   if mode!='noreceipt':v['receipt']={'orgId':ORG,'userId':USER,'requestId':rid,'fromVersion':fv,'version':S['version'],'normalization':1,'changesJson':ch,'digest':hashlib.sha256(ch.encode()).hexdigest()}
   if mode=='lose':return await route.abort()  # gravado, resposta perdida
 else:return await route.abort()
 await route.fulfill(status=200,headers={'content-type':'application/json','x-tss-serialized':'true'},body=wrap(v))
R=[];ERR=[]
def check(name,ok,detail=''):
 R.append((name,bool(ok),detail));print(('PASS' if ok else 'FAIL'),name,detail,flush=True)
async def now(p):return await p.evaluate('performance.now()')
async def bar(p):return {'unsaved':await p.get_by_text('Alterações não salvas').count(),'strip':await p.get_by_text(re.compile('Resultado desconhecido|Aguardando confirmação|Confirmado — atualizando|Conflito:|Falha recuperável')).count()}
def rec(tab,id_):return next((x for x in S['data'][tab] if x['id']==id_),None)
async def login(page):
 await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
async def goto(page,tab='planned',probe='FIX0 '):
 await page.goto(f'http://localhost:8080/lancamentos?tab={tab}');await page.get_by_role('row',name=re.compile(probe)).first.wait_for(timeout=120000)
async def open_row(page,probe):
 s=await now(page)
 try:await page.get_by_role('row',name=re.compile(probe)).first.locator('td.txt').first.click()
 except Exception:
  await page.screenshot(path=f'{OUT}/{ROLE}_fail_open.png');print('DEBUG dialogs=',[ (await x.inner_text())[:300].replace('\n',' | ') for x in await page.get_by_role('dialog').all()],'alertdialogs=',[(await x.inner_text())[:300].replace('\n',' | ') for x in await page.get_by_role('alertdialog').all()],flush=True);raise
 dl=page.get_by_role('dialog').last;await dl.wait_for(timeout=30000);return dl,await now(page)-s
async def type_desc(page,dl,text,committed=False):
 if committed:await dl.get_by_role('button',name='Dados do documento').click()
 d=dl.get_by_label('Descrição',exact=True);await d.fill('');s=await now(page);await d.press_sequentially(text,delay=0);return await now(page)-s
async def confirm(page,dl,committed=False,double=False):
 rv=dl.get_by_role('button',name='Revisar antes de salvar' if committed else 'Revisar e salvar',exact=True)
 try:await rv.click(timeout=15000)
 except Exception:
  await page.screenshot(path=f'{OUT}/{ROLE}_fail_review.png');print('DEBUG disabled=',await rv.is_disabled() if await rv.count() else 'ausente','texto=',(await dl.inner_text())[:600].replace('\n',' | '));raise
 b=page.get_by_role('dialog').last.get_by_role('button',name='Confirmar e salvar',exact=True);await b.wait_for()
 s=await now(page)
 if double:await b.dblclick()
 else:await b.click()
 return s
async def wait_closed(page,s,timeout=40000):
 await page.get_by_role('dialog').first.wait_for(state='hidden',timeout=timeout);t=await now(page)-s
 ph=await page.evaluate("(()=>{const m=performance.getEntriesByType('measure').filter(e=>e.name.startsWith('sandrini.save'));performance.clearMeasures();return m.map(e=>e.name.replace('sandrini.save.','')+'='+Math.round(e.duration))})()")
 print('  fases',ph,'total',round(t),flush=True);return t
IDS=[]
async def pick_ids(page):
 names=await page.get_by_role('row').evaluate_all("rs=>rs.map(r=>r.innerText)")
 seen=[]
 for n in names:
  m=re.search(r'\bFIX(\d+)\b',n)
  if m and m.group(1) not in seen:seen.append(m.group(1))
 IDS[:]=seen;print('linhas visíveis FIX',seen[:14],flush=True)
def fx(i):return f'FIX{IDS[i]} '
def pid(i):return f'p{IDS[i]}'
async def main():
 metrics={'open':[],'type34':[],'close':[],'confirm':[]}
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(headless=True);ctx=await browser.new_context(viewport={'width':1366,'height':900});page=await ctx.new_page()
  page.on('pageerror',lambda e:ERR.append('pageerror: '+str(e)));page.on('console',lambda m:ERR.append('console.'+m.type+': '+m.text) if m.type=='error' else None)
  print('role',ROLE,'fixture_bytes',len(json.dumps(S['data']).encode()),flush=True)
  await ctx.route('**/_serverFn/**',handler);await login(page)
  t=time.time();await goto(page);check('carga Lançamentos',True,f'{time.time()-t:.1f}s; leituras da base={S["reads"]}')
  check('base baixada uma única vez na carga',S['reads']==1,f'leituras={S["reads"]}')
  await pick_ids(page)
  if ROLE=='viewer':
   dl,_=await open_row(page,fx(1));desc=dl.get_by_label('Descrição',exact=True)
   check('leitor: campos bloqueados para edição',await desc.is_disabled())
   btn=dl.get_by_role('button',name='Revisar e salvar',exact=True);check('leitor: salvar ausente ou desabilitado',(not await btn.count()) or await btn.is_disabled())
   s=await now(page);await dl.get_by_role('button',name='Cancelar',exact=True).click();await page.get_by_role('dialog').first.wait_for(state='hidden',timeout=10000)
   check('leitor: fecha sem pergunta',True,f'{round(await now(page)-s)}ms');check('leitor: nenhum envio',not S['sent'])
   await browser.close();return report(metrics)
  # 1) Planejada: 3 repetições de abrir→digitar→revisar→salvar→fechar→reabrir
  for r in range(3):
   txt=f'descricao planejada rep{r} 1234567'[:34].ljust(34,'x');c0=S['commits']
   dl,o=await open_row(page,fx(1));metrics['open'].append(o);metrics['type34'].append(await type_desc(page,dl,txt))
   s=await confirm(page,dl);metrics['confirm'].append(await wait_closed(page,s))
   dl,_=await open_row(page,fx(1));val=await dl.get_by_label('Descrição',exact=True).input_value()
   s=await now(page);await dl.get_by_role('button',name='Cancelar',exact=True).click();metrics['close'].append(await wait_closed(page,s))
   b=await bar(page);check(f'planejada rep{r}: 1 gravação, reaberta igual, sem pendência',S['commits']==c0+1 and val==txt and rec('planned',pid(1))['notes']==txt and b['unsaved']==0 and b['strip']==0,f'commits+{S["commits"]-c0} val={val==txt} bar={b}')
  await goto(page);dl,_=await open_row(page,fx(1));v=await dl.get_by_label('Descrição',exact=True).input_value();await dl.get_by_role('button',name='Cancelar',exact=True).click()
  b=await bar(page);check('planejada após recarregar: mesmo dado, sem pendência',v.startswith('descricao planejada rep2') and b['unsaved']==0 and b['strip']==0,f'bar={b}')
  # 2) Efetivado existente
  await goto(page,'committed','NFC0 ');c0=S['commits']
  dl,o=await open_row(page,'NFC1 ');ty=await type_desc(page,dl,'descricao efetivado editada 123456',True)
  s=await confirm(page,dl,True);ms=await wait_closed(page,s)
  await goto(page,'committed','NFC0 ');dl,_=await open_row(page,'NFC1 ');await dl.get_by_role('button',name='Dados do documento').click();v=await dl.get_by_label('Descrição',exact=True).input_value()
  await dl.get_by_role('button',name='Cancelar',exact=True).click();b=await bar(page)
  check('efetivado: salvar 1×, recarregar, mesmo dado, sem pendência',S['commits']==c0+1 and v=='descricao efetivado editada 123456' and b['unsaved']==0 and b['strip']==0,f'abrir={o:.0f}ms digitar34={ty:.0f}ms confirmar={ms:.0f}ms bar={b}')
  # 3) Novo Efetivado + fornecedor no próprio formulário + 3 parcelas e datas manuais: uma revisão, uma confirmação
  await goto(page);c0=S['commits'];n_sup=len(S['data']['suppliers'])
  await page.get_by_role('button',name='+ Novo lançamento').click();await page.get_by_role('button',name='Efetivado').last.click()
  dl=page.get_by_role('dialog').last;await dl.locator('select').nth(2).select_option(label='Material')
  inp=dl.locator('[data-supplier-combobox] input');await inp.click();await inp.fill('FORNECEDOR INLINE ACEITE')
  await page.get_by_text(re.compile('Cadastrar fornecedor “FORNECEDOR INLINE ACEITE”')).click()
  cw=page.get_by_role('dialog',name='Cadastrar fornecedor');await cw.get_by_role('button',name='Cadastrar e selecionar').click()
  await dl.get_by_role('textbox').nth(1).fill('NF-ACEITE-01');bd=dl.locator('input[placeholder="dd/mm/aaaa"]').first;await bd.fill('10/11/2026');await bd.blur()
  m=dl.locator('input.num').first;await m.fill('900,00');await m.blur()
  await dl.get_by_text('Preencher manualmente').click();await dl.locator('input[type=number]').fill('3');await dl.get_by_role('button',name='Gerar linhas').click();await page.wait_for_timeout(300)
  dates=['15/12/2026','20/01/2027','25/02/2027']
  for i,x in enumerate(dates):
   r_=dl.get_by_role('row',name=re.compile(rf"^{i+1}.3"));vv=r_.locator('input').nth(1);await vv.fill('300,00');await vv.blur();e=r_.locator('input').nth(2);await e.fill(x);await e.blur()
  await dl.get_by_role('button',name='Revisar e confirmar').click();await page.get_by_text('Conferi os valores').click()
  s=await now(page);await page.get_by_role('dialog').last.get_by_role('button',name='Confirmar e salvar').click()
  for _ in range(120):
   if await page.get_by_role('dialog').count()==0:break
   await page.wait_for_timeout(250)
  ms=await now(page)-s;sup=[x for x in S['data']['suppliers'] if x['name']=='FORNECEDOR INLINE ACEITE']
  cs=sorted((c['value'],c['dueDate']) for c in S['data']['committed'] if c.get('document')=='NF-ACEITE-01' and sup and c['supplierId']==sup[0]['id'])
  last=S['sent'][-1]['entities'] if S['sent'] else []
  await goto(page);b=await bar(page)
  check('novo efetivado + fornecedor inline: 1 gravação atômica, datas manuais, sem pendência solta',S['commits']==c0+1 and len(sup)==1 and cs==[(30000,'2026-12-15'),(30000,'2027-01-20'),(30000,'2027-02-25')] and 'Fornecedor' in last and b['unsaved']==0 and b['strip']==0,f'confirmar={ms:.0f}ms entidades={sorted(set(last))} bar={b}')
  # 4) Duplo clique no confirmar → uma gravação
  c0=S['commits'];dl,_=await open_row(page,fx(2));await type_desc(page,dl,'duplo clique')
  s=await confirm(page,dl,double=True);await wait_closed(page,s);await page.wait_for_timeout(500)
  check('duplo clique: uma única gravação',S['commits']==c0+1,f'commits+{S["commits"]-c0} envios={len([x for x in S["sent"][-3:]])}')
  # 5) Resposta perdida APÓS gravar → consulta read-only confirma, sem reenvio nem duplicação
  c0=S['commits'];n0=len(S['sent']);S['mode']='lose'
  dl,_=await open_row(page,fx(3));await type_desc(page,dl,'resposta perdida')
  s=await confirm(page,dl);await wait_closed(page,s,60000);await page.wait_for_timeout(500);b=await bar(page)
  check('resposta perdida após gravar: confirmada por consulta, 1 gravação, 1 envio, sem pendência',S['commits']==c0+1 and len(S['sent'])==n0+1 and rec('planned',pid(3))['notes']=='resposta perdida' and b['strip']==0 and b['unsaved']==0,f'bar={b}')
  # 6) Gravado mas releitura falha (sem recibo): não volta como "Alterações não salvas"; recarregar retira o pacote confirmado
  c0=S['commits'];S['mode']='noreceipt';S['refetch_fail']=1
  dl,_=await open_row(page,fx(4));await type_desc(page,dl,'releitura falhou')
  s=await confirm(page,dl);await page.wait_for_timeout(4000);b=await bar(page)
  check('gravado com releitura falha: sem "Alterações não salvas"',S['commits']==c0+1 and b['unsaved']==0,f'bar={b}')
  if await page.get_by_role('dialog').count():
   await page.get_by_role('dialog').last.get_by_role('button',name=re.compile('Fechar')).first.click()
  await goto(page);await page.wait_for_timeout(1000);b=await bar(page)
  dl,_=await open_row(page,fx(4));v=await dl.get_by_label('Descrição',exact=True).input_value();await dl.get_by_role('button',name='Cancelar',exact=True).click()
  check('após recarregar: pacote confirmado retirado, dado presente, nenhuma nova gravação',b['strip']==0 and b['unsaved']==0 and v=='releitura falhou' and S['commits']==c0+1,f'bar={b}')
  # 7) Envio perdido ANTES de gravar → resultado desconhecido → consultar (não encontrado) → reenviar o MESMO pacote
  c0=S['commits'];S['mode']='fail'
  dl,_=await open_row(page,fx(5));await type_desc(page,dl,'perdido antes')
  s=await confirm(page,dl);await page.get_by_text(re.compile('desconhecido')).first.wait_for(timeout=60000)
  rid=S['sent'][-1]['rid'];check('perdido antes de gravar: estado desconhecido, nada gravado',S['commits']==c0,f'rid={rid[:8]}')
  await page.get_by_role('dialog').last.get_by_role('button',name=re.compile('Fechar')).first.click()
  await page.get_by_role('button',name='Consultar resultado').first.click();await page.get_by_role('button',name='Reenviar o mesmo pacote').wait_for(timeout=20000)
  await page.get_by_role('button',name='Reenviar o mesmo pacote').click();await page.get_by_role('dialog').last.get_by_role('button',name='Reenviar o mesmo pacote').click()
  await page.wait_for_timeout(3000);b=await bar(page)
  check('reenvio explícito: mesmo requestId, 1 gravação, sem pendência',S['commits']==c0+1 and S['sent'][-1]['rid']==rid and rec('planned',pid(5))['notes']=='perdido antes' and b['strip']==0,f'bar={b}')
  # 8) Conflito: nada gravado, pacote preservado para revisão
  # 7b) Gravado no servidor, resposta E consultas perdidas → desconhecido; após recarregar, UMA consulta automática só de leitura reconcilia
  c0=S['commits'];n0=len(S['sent']);S['mode']='lose';S['check_fail']=1
  dl,_=await open_row(page,fx(9));await type_desc(page,dl,'ack perdido reload')
  s=await confirm(page,dl);await page.get_by_text(re.compile('desconhecido')).first.wait_for(timeout=90000)
  rid_txt=await page.locator('span.font-mono').first.inner_text()
  check('ack perdido: faixa desconhecida mostra identificação do envio',rid_txt==S['sent'][-1]['rid'] and S['commits']==c0+1,rid_txt[:8])
  S['check_fail']=0;await goto(page);await page.wait_for_timeout(6000);b=await bar(page)
  check('após recarregar: consulta automática reconcilia pacote já gravado, sem reenvio',b['strip']==0 and len(S['sent'])==n0+1 and S['commits']==c0+1 and rec('planned',pid(9))['notes']=='ack perdido reload',f'bar={b} envios+{len(S["sent"])-n0}')
  c0=S['commits'];S['mode']='conflict'
  dl,_=await open_row(page,fx(6));await type_desc(page,dl,'conflito')
  s=await confirm(page,dl);await page.wait_for_timeout(2500);txt=await page.locator('body').inner_text()
  check('conflito: nada gravado, revisão oferecida',S['commits']==c0 and ('Conflito' in txt or 'alterou' in txt))
  if await page.get_by_role('dialog').count():await page.get_by_role('dialog').last.get_by_role('button',name=re.compile('Fechar')).first.click()
  if await page.get_by_role('button',name='Revisar conflito').count():
   await page.get_by_role('button',name='Revisar conflito').click();await page.get_by_role('dialog').last.get_by_role('button',name='Revisar conflito').click();await page.wait_for_timeout(800)
   await page.get_by_role('button',name='Manter a do banco').first.wait_for(timeout=30000)
   for _ in range(10):
    k=page.get_by_role('button',name='Manter a do banco')
    if not await k.count():break
    await k.first.wait_for();await page.wait_for_function("()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Manter a do banco');return !b||!b.disabled}",timeout=15000)
    if await k.count():await k.first.click();await page.wait_for_timeout(300)
   check('conflito resolvido mantendo a do banco: nada gravado, sem pendência',S['commits']==c0 and not await page.get_by_role('button',name='Manter a do banco').count() and rec('planned',pid(6))['notes']!='conflito',f'bar={await bar(page)}')
  # 9) Debounce tardio: digita e fecha na hora mantendo o rascunho → recarrega → última tecla preservada; descarta
  dl,_=await open_row(page,fx(7));d=dl.get_by_label('Descrição',exact=True);await d.fill('ultima tecla Z')
  await dl.get_by_role('button',name='Cancelar',exact=True).click();await page.get_by_role('dialog',name=re.compile('Fechar com alterações')).get_by_role('button',name='Manter rascunho e fechar').click()
  await goto(page);dl,_=await open_row(page,fx(7));v=await dl.get_by_label('Descrição',exact=True).input_value()
  check('rascunho local: última tecla preservada após recarregar, nada enviado',v=='ultima tecla Z' and rec('planned',pid(7))['notes']!='ultima tecla Z')
  await dl.get_by_role('button',name='Cancelar',exact=True).click();await page.get_by_role('dialog',name=re.compile('Fechar com alterações')).get_by_role('button',name='Descartar').click()
  # 10) Pendência independente intacta + duas abas
  await page.goto('http://localhost:8080/referencias');await page.get_by_role('button',name='Categorias e subgrupos').click();await page.get_by_role('button',name='+ Subgrupo').click();await page.wait_for_timeout(600)
  b0=await bar(page);n_cat=len(S['data']['categories'])
  page2=await ctx.new_page();page2.on('pageerror',lambda e:ERR.append('pageerror tab2: '+str(e)));await goto(page2);reads0=S['reads']
  await goto(page);c0=S['commits'];dl,_=await open_row(page,fx(8));await type_desc(page,dl,'duas abas')
  s=await confirm(page,dl);await wait_closed(page,s);await page.wait_for_timeout(2500)
  b=await bar(page);b2=await bar(page2);last=S['sent'][-1]['entities']
  check('pendência independente intacta e fora do pacote',b0['unsaved']==1 and b['unsaved']==1 and 'Categoria' not in last and len(S['data']['categories'])==n_cat and S['commits']==c0+1,f'antes={b0} depois={b} entidades={last}')
  check('segunda aba: avisada e base relida, sem pacote pendente',S['reads']>reads0 and b2['strip']==0,f'leituras +{S["reads"]-reads0} aba2={b2}')
  await page2.close()
  await page.get_by_role('button',name='Descartar').first.click();await page.get_by_role('dialog').last.get_by_role('button',name='Descartar').click()
  await page.screenshot(path=f'{OUT}/{ROLE}_final.png')
  await browser.close()
 report(metrics)
def report(metrics):
 for k,v in metrics.items():
  if v:print(f'METRIC {ROLE} {k}: n={len(v)} mediana={statistics.median(v):.0f}ms max={max(v):.0f}ms valores={[round(x) for x in v]}')
 print('ERROS DE PÁGINA/CONSOLE (completos):');[print('  ',e) for e in ERR] or print('   nenhum')
 print(f'RESUMO {ROLE}: {sum(1 for r in R if r[1])}/{len(R)} PASS');[print('  FAIL:',n,d) for n,ok,d in R if not ok]
asyncio.run(main())
