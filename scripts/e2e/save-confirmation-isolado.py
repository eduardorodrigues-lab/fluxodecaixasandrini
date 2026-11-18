import asyncio,json,os,re,base64,copy,hashlib
from pathlib import Path
from playwright.async_api import async_playwright
source=Path('/dev-server/scripts/e2e/save-speed-isolado.py').read_text();exec(source.split('async def main():')[0])
original_handler=handler
state['data']['suppliers']=[{'id':'s','name':'FORNECEDOR FICTÍCIO','group':'','terms':[]}]
state['data']['receipts']=[{'id':'r','date':'2026-11-18','platforms':{},'general':None,'notes':''}]
requests=[];done={};lost=False;offline=False;reject=False;delay=0
async def handler(route):
 global lost,offline,reject
 seg=route.request.url.split('/_serverFn/')[1].split('?')[0];text=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode();m=re.search(r'"export":"(\w+?)_createServerFn_handler',text);name=m.group(1) if m else text.split('#')[-1]
 if name=='checkCommitRequest':
  req=unquote(route.request.url)
  v=next(({'version':x['version'],'opsJson':json.dumps(x['ops'])} for k,x in done.items() if k in req),None)
  if offline:return await route.abort()
 elif name=='commitOps':
  body=json.loads(route.request.post_data);rid=field(body,'requestId');ops=json.loads(field(body,'opsJson').replace('\\"','"').replace('\\\\','\\'));requests.append(rid)
  if delay:await asyncio.sleep(delay)
  if offline:return await route.abort()
  if reject:
   reject=False;v={'status':'conflict','version':state['version'],'conflictsJson':json.dumps([{'change':ops[0],'server':{'id':'s','name':'OUTRA EDIÇÃO','group':'','terms':[]}}])}
  else:
   before=state['version'];tables={'Fornecedor':'suppliers','Recebimento':'receipts'}
   for op in ops:
    tab=tables[op['entity']];state['data'][tab]=[x for x in state['data'][tab] if x['id']!=op['id']]
    if op['after']:state['data'][tab].append(op['after'])
   state['version']+=1;state['commits']+=1;done[rid]={'version':state['version'],'ops':ops}
   changes=json.dumps(ops,ensure_ascii=False,separators=(',',':'));v={'status':'ok','version':state['version'],'conflictsJson':'[]','receipt':{'orgId':ORG,'userId':json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id'],'requestId':rid,'fromVersion':before,'version':state['version'],'normalization':1,'changesJson':changes,'digest':hashlib.sha256(changes.encode()).hexdigest()}}
   if lost:lost=False;return await route.abort()
 else:return await original_handler(route)
 await route.fulfill(status=200,headers={'content-type':'application/json','x-tss-serialized':'true'},body=wrap(v))
async def put(page,key,value):
 await page.evaluate('''async ([key,value])=>new Promise((resolve,reject)=>{const q=indexedDB.open('fluxo-sandrini',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>{const t=q.result.transaction('drafts','readwrite');t.objectStore('drafts').put(value,key);t.oncomplete=resolve;t.onerror=reject;};})''',[key,value])
async def get(page,key):
 return await page.evaluate('''async key=>new Promise(resolve=>{const q=indexedDB.open('fluxo-sandrini',1);q.onsuccess=()=>{const t=q.result.transaction('drafts','readonly'),r=t.objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result);};})''',key)
def supplier(name):
 old=copy.deepcopy(state['data']['suppliers'][0]);new={**old,'name':name};return {'entity':'Fornecedor','id':'s','kind':'alteração','before':old,'after':new,'fields':['name']}
async def main():
 global lost,offline,reject,delay
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800});await context.route('**/_serverFn/**',handler);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.goto('http://localhost:8080/recebimentos');await page.locator('#pending-r').wait_for()
  uid=json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id'];scope='oficial:'+uid+':'+ORG
  receipt=copy.deepcopy(state['data']['receipts'][0]);zero={**receipt,'general':0};rop={'entity':'Recebimento','id':'r','kind':'alteração','before':receipt,'after':zero,'fields':['general']}
  op=supplier('REVISADO');await put(page,'draft:'+scope,{'scope':scope,'baseVersion':1,'requestId':'11111111-1111-4111-8111-111111111111','ops':[op,rop],'submissionModel':'reviewed'});await page.reload();await page.get_by_role('button',name='Salvar outros módulos',exact=True).wait_for()
  await page.get_by_role('button',name='Salvar outros módulos',exact=True).click();dl=page.get_by_role('dialog',name='Revisar alterações não salvas');await dl.wait_for();assert not requests;assert 'REVISADO' in await dl.inner_text();await dl.screenshot(path='/tmp/browser/save-confirmation/review.png');await dl.get_by_role('button',name='Voltar à edição').click();assert not requests
  await page.get_by_role('button',name='Salvar outros módulos',exact=True).click();lost=True;await dl.get_by_role('button',name='Confirmar e salvar').dblclick();await page.get_by_text('Operação salva com sucesso.',exact=False).wait_for();assert state['commits']==1;assert len(requests)==1;assert state['data']['receipts'][0]['general'] is None
  print('global: back no send, one confirmation, lost response read-only recovery, independent receipt preserved',flush=True)
  # Offline: no repeated write, immutable packet visible, reload reconciliation.
  op=supplier('OFFLINE');await asyncio.sleep(.6);await put(page,'draft:'+scope,{'scope':scope,'baseVersion':state['version'],'requestId':'22222222-2222-4222-8222-222222222222','ops':[op,rop],'submissionModel':'reviewed'});await page.reload();await page.get_by_role('button',name='Salvar outros módulos',exact=True).click();await dl.wait_for();offline=True;await dl.get_by_role('button',name='Confirmar e salvar').click();await page.get_by_role('button',name='Consultar resultado').wait_for();await page.get_by_text('Resultado desconhecido',exact=False).first.wait_for();assert len(requests)==2
  await page.get_by_role('button',name='Ver alterações').click();packet=page.get_by_role('dialog',name='Alterações do pacote enviado');await packet.wait_for();assert 'OFFLINE' in await packet.inner_text();await packet.screenshot(path='/tmp/browser/save-confirmation/unknown-packet.png');assert await page.get_by_role('button',name='Revisar conflito',exact=True).count()==0;await packet.get_by_role('button',name='Fechar').click()
  stored=await get(page,'operation:'+scope);rid=stored['requestId'];assert stored['submittedAt'];assert stored['ops']==[op]
  # Simulate late commit in fixture; after reload only reads are allowed.
  state['data']['suppliers']=[op['after']];state['version']+=1;done[rid]={'version':state['version'],'ops':[op],'submissionModel':'reviewed'};offline=False;await page.reload();await page.get_by_role('button',name='Consultar resultado').click();await page.get_by_role('button',name='Consultar resultado').wait_for(state='hidden');assert len(requests)==2
  print('offline/unknown/immutable view/reload original ID/read-only late confirmation verified',flush=True)
  # Isolated receipt shares recovery; concurrent editing preserves newer value.
  inp=page.locator('#pending-r td').nth(1).locator('input')
  # Determine General column from actual header, not a guessed table position.
  headers=await page.locator('.receipts-table thead th').all_text_contents();idx=next(i for i,x in enumerate(headers) if 'Geral' in x);inp=page.locator('#pending-r td').nth(idx).locator('input');await inp.fill('123,45');await inp.blur();await page.get_by_role('button',name='Revisar e salvar recebimentos',exact=True).click();receipt_dl=page.get_by_role('dialog',name='Revisar recebimentos');await receipt_dl.wait_for();await receipt_dl.get_by_role('button',name='Voltar à edição').click();await page.get_by_role('button',name='Revisar e salvar recebimentos',exact=True).click();delay=3;click=asyncio.create_task(receipt_dl.get_by_role('button',name='Confirmar e salvar').click());await asyncio.sleep(.4);await page.locator('button').filter(has_text='Ver alterações').wait_for(state='attached');await inp.fill('200,00',force=True);await inp.blur();await click;await receipt_dl.wait_for(state='hidden');delay=0;await asyncio.sleep(.5);persisted=await get(page,'draft:'+scope);assert persisted['ops'][0]['after']['general']==20000;assert state['data']['receipts'][0]['general']==12345
  # Explicit conflict is rejected; release only after rejection, no automatic retry.
  await asyncio.sleep(.6);op=supplier('CONFLITO');await put(page,'draft:'+scope,{'scope':scope,'baseVersion':state['version'],'requestId':'33333333-3333-4333-8333-333333333333','ops':[op],'submissionModel':'reviewed'});await page.reload();await page.get_by_role('button',name='Salvar',exact=True).click();await dl.wait_for();reject=True;await dl.get_by_role('button',name='Confirmar e salvar').click();await page.get_by_role('button',name='Revisar conflito').wait_for();await page.wait_for_function("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Revisar conflito' && !b.disabled)");assert len(requests)==4
  await page.get_by_role('button',name='Ver alterações').click();await packet.wait_for();assert 'CONFLITO' in await packet.inner_text();await packet.get_by_role('button',name='Fechar').click()
  await page.get_by_role('button',name='Revisar conflito').click();await page.get_by_role('dialog',name='Revisar operação recusada?').get_by_role('button',name='Revisar conflito').click();await page.get_by_role('dialog',name='Conflito na mesma informação').wait_for();await page.get_by_role('button',name='Manter a minha').click();await page.get_by_role('button',name='Salvar',exact=True).click();await dl.wait_for();await dl.get_by_role('button',name='Voltar à edição').click();assert len(requests)==4
  print('isolated/edit during send/conflict/release/new review without send verified; calls',len(requests),'blocked',counts['blocked'],'errors',errors,flush=True)
  await browser.close()
asyncio.run(main())
