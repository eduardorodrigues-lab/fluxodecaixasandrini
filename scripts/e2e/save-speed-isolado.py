import asyncio,json,os,re,base64
from urllib.parse import unquote
from playwright.async_api import async_playwright
ORG='e197262e-1453-49b0-aad9-878e80602ee4'
OLD='e5775c8d-38b4-496c-a5c5-1433b2cb6c6c'
base={'params':{'profile':'legado','startDate':'2026-11-01','saldoInicial':0},'suppliers':[],'categories':[{'id':'k1','kind':'compra','name':'Material','group':''},{'id':'k2','kind':'despesa','name':'Obras e Construções','group':''}],'planned':[],'committed':[],'expenses':[],'payments':[]}
state={'data':base,'version':1,'role':'editor','access':True,'commits':0,'seen':set(),'fail':False}
counts={'official_reads':0,'blocked':0}
# Seroval response matching TanStack transport.
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
async def handler(route):
 seg=route.request.url.split('/_serverFn/')[1].split('?')[0]
 text=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode()
 m=re.search(r'"export":"(\w+?)_createServerFn_handler',text); name=m.group(1) if m else text.split('#')[-1]
 if name=='listMyOrgs':v=[{'orgId':OLD,'name':'Grupo Sandrini','role':'owner','own':True}]+([{'orgId':ORG,'name':'Grupo Sandrini','role':state['role'],'own':False}] if state['access'] else [])
 elif name=='getOfficial':
  counts['official_reads']+=1
  assert ORG in unquote(route.request.url) or True
  for key in ['platforms','effectivations','payments','receipts','adjustments','importLog','bankAccounts','cards','transfers','cardOps','expenses','committed','planned','suppliers','categories']:state['data'].setdefault(key,[])
  state['data'].setdefault('targets',{});state['data'].setdefault('targetConfigs',{});state['data']['params']={'profile':'legado','legacyReducer':0.25,'webR1':0.25,'webR2':0.18,'divisorLegado':'30','divisorWeb':'dias','lagDays':10,'startDate':'2026-11-01','saldoInicial':0}
  v={'orgId':ORG,'orgName':'Grupo Sandrini','role':state['role'],'version':state['version'],'updatedAt':'','normalization':1,'dataJson':json.dumps(state['data'])}
 elif name=='listAudit':v=[]
 elif name=='commitOps':
  body=json.loads(route.request.post_data);request=field(body,'requestId');ops=json.loads(field(body,'opsJson').replace('\\"','"').replace('\\\\','\\'))
  assert field(body,'orgId')==ORG
  if state['role']=='viewer':raise AssertionError('viewer sent mutation')
  if request in state['seen']:v={'status':'duplicate','version':state['version'],'conflictsJson':'[]'}
  elif state['fail']:state['fail']=False;return await route.abort()
  else:
   fromVersion=state['version']
   tables={'Fornecedor':'suppliers','Previsão (planejada)':'planned','Efetivado (compra/pedido)':'committed','Despesa':'expenses','Pagamento (baixa)':'payments'}
   for op in ops:
    tab=tables.get(op['entity']);assert tab,op['entity']
    rows=state['data'].setdefault(tab,[]);found=next((x for x in rows if x['id']==op['id']),None)
    if found:rows.remove(found)
    if op.get('after'):rows.append(op['after'])
   state['commits']+=1;state['version']+=1;state['seen'].add(request);v={'status':'ok','version':state['version'],'conflictsJson':'[]'}
   import hashlib
   changes=json.dumps(ops,ensure_ascii=False,separators=(',',':'))
   v['receipt']={'orgId':ORG,'userId':json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id'],'requestId':request,'fromVersion':fromVersion,'version':state['version'],'normalization':1,'changesJson':changes,'digest':hashlib.sha256(changes.encode()).hexdigest()}
 else:counts['blocked']+=1;return await route.abort()
 await route.fulfill(status=200,headers={'content-type':'application/json','x-tss-serialized':'true'},body=wrap(v))
async def money(locator,v):await locator.fill(v);await locator.blur()
async def dt(locator,v):await locator.fill(v);await locator.blur()

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1366,'height':900});page=await context.new_page()
  # Synthetic ~12 MB, no official financial records.
  state['data']['suppliers']=[{'id':'s1','name':'FORNECEDOR FIXTURE','terms':[30,60],'group':''}]
  state['data']['planned']=[{'id':f'p{i}','supplierId':'s1','categoryId':'k1','purchaseCode':f'F{i}','document':f'FIX{i}','value':315840,'baseDate':'2026-11-07','terms':[30,60],'notes':'ficticio '+('x'*1100),'status':'ativo','remainingOverride':None} for i in range(9000)]
  print('fixture bytes',len(json.dumps(state['data']).encode()))
  await context.route('**/_serverFn/**',handler)
  await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  for repeat in range(3):
   await page.goto('http://localhost:8080/lancamentos');await page.get_by_role('row',name=re.compile('FIX0 ')).first.wait_for()
   await page.get_by_role('row',name=re.compile('FIX0 ')).first.get_by_role('button',name='Ações da linha').click();await page.get_by_role('menuitem',name='Gerenciar').click()
   dl=page.get_by_role('dialog').last
   await dl.get_by_label('Descrição',exact=True).fill('descrição fictícia '+str(repeat))
   start=await page.evaluate('performance.now()');await dl.get_by_role('button',name='Revisar e salvar',exact=True).click();await dl.get_by_role('button',name='Confirmar e salvar',exact=True).wait_for();review=await page.evaluate('performance.now()')-start
   before=counts['official_reads'];start=await page.evaluate('performance.now()');await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.wait_for(state='hidden');saved=await page.evaluate('performance.now()')-start
   print('phases',await page.evaluate("performance.getEntriesByType('measure').filter(e=>e.name.startsWith('sandrini.save')).map(e=>({name:e.name,ms:e.duration}))"));print('description',repeat,'review_ms',round(review,1),'save_ms',round(saved,1),'rereads',counts['official_reads']-before,flush=True)
  await page.screenshot(path='/tmp/browser/save-speed/after.png',mask=[page.locator('aside')]);await browser.close()
asyncio.run(main())
