# Aceite do fluxo abrir→editar→revisar→salvar 1×→fechar→reabrir→recarregar, com dados FICTÍCIOS em volume
# equivalente ao atual (84 fornecedores, ~4,2 mil planejadas, ~5,5 mil efetivados, ~4 mil despesas, ~7,9 mil baixas).
# Servidor interceptado (nenhuma chamada à base real). Uso: python3 estabilizacao-editor.py owner|editor|viewer
import asyncio,json,os,re,base64,copy,hashlib,sys,time,statistics
from urllib.parse import unquote
from playwright.async_api import async_playwright
ROLE='editor'
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
TABLES={'Conta bancária':'bankAccounts','Cartão':'cards','Transferência':'transfers','Operação no cartão':'cardOps','Fornecedor':'suppliers','Previsão (planejada)':'planned','Efetivado (compra/pedido)':'committed','Despesa':'expenses','Pagamento (baixa)':'payments','Categoria':'categories','Efetivação':'effectivations'}
S={'data':{'params':{},'suppliers':[],'categories':[],'planned':[],'committed':[],'expenses':[],'payments':[]},'version':200,'role':ROLE,'commits':0,'done':{},'mode':None,'delay':0,'reads':0,'refetch_fail':0,'sent':[]}
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
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);ctx=await browser.new_context(viewport={'width':1280,'height':1800});page=await ctx.new_page()
  await ctx.route('**/_serverFn/**',handler)
  await ctx.route(re.compile(r'.*/rest/v1/.*'),lambda r:r.abort())
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  await page.goto('http://localhost:8080/bancos');await page.get_by_role('button',name='+ Conta',exact=True).wait_for()
  async def create(label):
   await page.get_by_role('button',name='+ Conta',exact=True).click();dl=page.get_by_role('dialog',name='Nova conta');await dl.get_by_label('Banco',exact=True).fill('Banco Fictício');await dl.get_by_label('Identificação',exact=True).fill(label)
   await dl.get_by_role('button',name='Revisar e confirmar').click();await page.get_by_role('dialog',name='Revisar operação de Bancos').wait_for();return page.get_by_role('dialog',name='Revisar operação de Bancos')
  async def confirm(dl):
   await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.wait_for(state='hidden',timeout=60000)
  dl=await create('Conta Sintética');await dl.screenshot(path='/tmp/browser/bancos-confirmacao/review.png');await confirm(dl)
  assert S['commits']==1 and len(S['data']['bankAccounts'])==1
  assert await page.get_by_text('Alterações não salvas',exact=False).count()==0
  await page.get_by_role('row',name=re.compile('Conta Sintética')).get_by_role('button',name='Editar',exact=True).click();dl=page.get_by_role('dialog',name='Editar conta');await dl.get_by_label('Identificação').fill('Editada');await dl.get_by_role('button',name='Revisar e confirmar').click();await confirm(page.get_by_role('dialog',name='Revisar operação de Bancos'))
  await page.reload();await page.get_by_role('row',name=re.compile('Editada')).wait_for();assert S['commits']==2;assert await page.get_by_text('Alterações não salvas',exact=False).count()==0
  # Last keystroke survives explicit keep, without submitting.
  await page.get_by_role('button',name='+ Conta',exact=True).click();dl=page.get_by_role('dialog',name='Nova conta');await dl.get_by_label('Identificação').fill('Última tecla');await dl.get_by_role('button',name='Fechar',exact=True).click();await page.get_by_role('button',name='Manter rascunho e fechar').click();await page.get_by_role('button',name='+ Conta',exact=True).click();dl=page.get_by_role('dialog',name='Nova conta');assert await dl.get_by_label('Identificação').input_value()=='Última tecla';await dl.get_by_role('button',name='Cancelar',exact=True).click();await page.get_by_role('button',name='Descartar',exact=True).click()
  # Lost ACK is recovered by read only.
  S['mode']='lose';dl=await create('ACK perdido');await confirm(dl);assert S['commits']==3;assert await page.get_by_text('Alterações não salvas',exact=False).count()==0
  # Post-ACK reread fails: closes as confirmed, never retries write.
  S['mode']='noreceipt';S['refetch_fail']=5;dl=await create('Refresh falha');await confirm(dl);assert S['commits']==4;assert await page.get_by_text(re.compile('Gravação confirmada; atualização')).count()>0
  await page.screenshot(path='/tmp/browser/bancos-confirmacao/ack_refresh.png')
  S['refetch_fail']=0;await page.get_by_role('button',name=re.compile('Consultar resultado')).first.click();await page.wait_for_timeout(1500)
  # Inactivation and card each have one shared confirmation.
  row=page.get_by_role('row',name=re.compile('Editada'))
  await row.get_by_role('button',name='Inativar',exact=True).click();await confirm(page.get_by_role('dialog',name='Revisar operação de Bancos'));assert next(a for a in S['data']['bankAccounts'] if a['label']=='Editada')['active']==False
  await page.get_by_role('row',name=re.compile('Editada')).get_by_role('button',name='Reativar',exact=True).click();await confirm(page.get_by_role('dialog',name='Revisar operação de Bancos'))
  await page.get_by_role('row',name=re.compile('Editada')).get_by_role('button',name='+ Cartão').click();dl=page.get_by_role('dialog',name='Novo cartão');await dl.get_by_label('Nome',exact=True).fill('Cartão teste');await dl.get_by_label('Últimos 4 dígitos').fill('0001');await dl.get_by_label('Dia de fechamento').fill('10');await dl.get_by_label('Dia de vencimento').fill('20');await dl.get_by_role('button',name='Salvar cartão',exact=True).click();await confirm(page.get_by_role('dialog',name='Revisar operação de Bancos'));assert len(S['data']['cards'])==1
  # Explicit recovery of one account, not the other account or supplier pending.
  legacy={'id':'legacy','bank':'Legado Fictício','label':'Legada','holder':'','agency':'','account':'','openingBalance':None,'openingDate':None,'active':True,'history':[]}
  ops=[{'entity':'Conta bancária','id':'legacy','kind':'inclusão','before':None,'after':legacy,'fields':[]},{'entity':'Conta bancária','id':'ind','kind':'inclusão','before':None,'after':{**legacy,'id':'ind','label':'Independente'},'fields':[]},{'entity':'Fornecedor','id':'s','kind':'inclusão','before':None,'after':{'id':'s','name':'Independente','terms':[],'group':''},'fields':[]}]
  scope='oficial:'+USER+':'+ORG
  await page.evaluate('''async ([scope,ops,version])=>new Promise((resolve,reject)=>{const q=indexedDB.open('fluxo-sandrini',1);q.onsuccess=()=>{const t=q.result.transaction('drafts','readwrite');t.objectStore('drafts').put({scope,baseVersion:version,requestId:crypto.randomUUID(),ops,submissionModel:'reviewed'},'draft:'+scope);t.oncomplete=resolve;t.onerror=reject;};})''',[scope,ops,S['version']])
  await page.reload();await page.get_by_role('button',name='Revisar conta Legada',exact=True).click();await confirm(page.get_by_role('dialog',name='Revisar operação de Bancos'))
  assert S['sent'][-1]['entities']==['Conta bancária'];assert any(a['id']=='legacy' for a in S['data']['bankAccounts']);assert not any(a['id']=='ind' for a in S['data']['bankAccounts']);assert not S['data']['suppliers']
  assert await page.get_by_role('button',name='Revisar conta Independente',exact=True).count()==1
  # Definitive pre-write failure then explicit retry uses identical packet.
  S['mode']='fail';dl=await create('Retry fictício');await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await page.get_by_text(re.compile('Resultado ainda desconhecido|Resultado desconhecido')).first.wait_for(timeout=60000)
  rid=S['sent'][-1]['rid'];await page.get_by_role('button',name='Consultar resultado',exact=True).first.click();await page.wait_for_timeout(7000)
  retry=page.get_by_role('button',name=re.compile('Reenviar o mesmo pacote')).first
  if await retry.count():
   await retry.click();await page.get_by_role('button',name='Reenviar o mesmo pacote',exact=True).last.click();await page.wait_for_timeout(1500);assert S['sent'][-1]['rid']==rid;assert S['commits']==9
  else:
   print('BUTTONS',await page.get_by_role('button').all_text_contents());await page.screenshot(path='/tmp/browser/bancos-confirmacao/retry.png');raise AssertionError('Explicit retry absent')
  await page.get_by_role('button',name='Transferências',exact=True).click();await page.get_by_role('button',name='+ Transferência',exact=True).click();dl=page.get_by_role('dialog',name='Transferir entre contas');await dl.get_by_label('Conta de origem',exact=True).fill('Banco Fictício · Editada');await dl.get_by_label('Conta de origem',exact=True).press('Enter');await dl.get_by_label('Conta de destino',exact=True).fill('Banco Fictício · ACK perdido');await dl.get_by_label('Conta de destino',exact=True).press('Enter');await dl.locator('input.num').fill('1,00');await dl.locator('input.num').blur();await dl.get_by_role('button',name='Revisar e confirmar').click();await confirm(page.get_by_role('dialog',name='Revisar operação de Bancos'));assert len(S['data']['transfers'])==1;assert S['data']['transfers'][0]['amount']==100
  print('PASS inactivate/reactivate/card/legacy account+two independent drafts/failure preserved; errors',errors)
  print('PASS create, edit, reopen, reload, last-key keep, lost ACK, post-ACK refresh failure;',S['commits'],'synthetic commits;',len(errors),'page errors')
  await page.screenshot(path='/tmp/browser/bancos-confirmacao/final.png');await browser.close()
asyncio.run(main())
