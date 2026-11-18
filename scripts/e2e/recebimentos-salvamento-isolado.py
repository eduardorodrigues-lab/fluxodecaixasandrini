import asyncio,json,os,re,hashlib,copy,time
from pathlib import Path
from playwright.async_api import async_playwright
source=Path('/dev-server/scripts/e2e/save-speed-isolado.py').read_text()
exec(source.split('async def main():')[0])
original_handler=handler
state['data']['receipts']=[{'id':'ra','date':'2026-11-01','platforms':{'pf':10000},'general':None,'notes':'','residual':{}},{'id':'rb','date':'2026-11-02','platforms':{'pf':None},'general':None,'notes':'','residual':{}}]
state['data']['platforms']=[{'id':'pf','name':'PLATAFORMA FICTÍCIA','start':'2000-01-01','end':None,'history':[],'importedCode':None}]
state['data']['planned']=[{'id':f'p{i}','supplierId':'','categoryId':'','purchaseCode':f'F{i}','document':f'F{i}','value':100,'baseDate':'2026-11-01','terms':[30],'notes':'x'*1150,'status':'ativo','remainingOverride':None} for i in range(9000)]
seen={};requests=[];fail_after=False;conflict=False
async def handler(route):
 global fail_after,conflict
 seg=route.request.url.split('/_serverFn/')[1].split('?')[0]
 text=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode()
 m=re.search(r'"export":"(\w+?)_createServerFn_handler',text);name=m.group(1) if m else text.split('#')[-1]
 if name=='checkCommitRequest':
  v=None
  if state.get('legacy_done'):
   v=state.pop('legacy_done')
 elif name=='commitOps':
  await asyncio.sleep(0.05)
  body=json.loads(route.request.post_data);request=field(body,'requestId');ops=json.loads(field(body,'opsJson').replace('\\"','"').replace('\\\\','\\'))
  assert all(o['entity']=='Recebimento' for o in ops), 'included unrelated pending'
  requests.append(request)
  if request in seen:v={'status':'duplicate','version':seen[request]['version'],'conflictsJson':'[]'}
  elif conflict:
   conflict=False
   existing=state['data']['receipts'][0];existing['general']=99900
   v={'status':'conflict','version':state['version'],'conflictsJson':json.dumps([{'change':ops[0],'server':existing}])}
  else:
   before=state['version']
   for op in ops:
    rows=state['data']['receipts'];found=next((r for r in rows if r['id']==op['id']),None)
    if found:rows.remove(found)
    if op['after']:rows.append(op['after'])
   state['version']+=1;state['commits']+=1
   changes=json.dumps(ops,ensure_ascii=False,separators=(',',':'))
   v={'status':'ok','version':state['version'],'conflictsJson':'[]','receipt':{'orgId':ORG,'userId':json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id'],'requestId':request,'fromVersion':before,'version':state['version'],'normalization':1,'changesJson':changes,'digest':hashlib.sha256(changes.encode()).hexdigest()}}
   seen[request]=v
   if fail_after:fail_after=False;return await route.abort()
 else:return await original_handler(route)
 await route.fulfill(status=200,headers={'content-type':'application/json','x-tss-serialized':'true'},body=wrap(v))
async def row(page,id):return page.locator('#pending-'+id)
async def general(page,id,value):
 r=await row(page,id);inp=r.locator('td').nth(2).locator('input');await inp.fill(value);await inp.blur()
async def review(page):
 await page.get_by_role('button',name='Revisar e salvar recebimentos',exact=True).click()
 dl=page.get_by_role('dialog',name='Revisar recebimentos');await dl.wait_for();return dl
async def main():
 global fail_after,conflict
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800});await context.route('**/_serverFn/**',handler);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.goto('http://localhost:8080/recebimentos');await page.locator('#pending-ra').wait_for()
  print('fixture_bytes',len(json.dumps(state['data']).encode()),flush=True)
  # Add unrelated pending and historical receipt change only to this fresh context's IndexedDB.
  scope='oficial:'+json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id']+':'+ORG
  original=copy.deepcopy(state['data']['receipts'][0]);edited=copy.deepcopy(original);edited['general']=0
  pending=[{'entity':'Recebimento','id':'ra','kind':'alteração','before':original,'after':edited,'fields':['general']},{'entity':'Fornecedor','id':'local-supplier','kind':'inclusão','before':None,'after':{'id':'local-supplier','name':'LOCAL INDEPENDENTE','group':'','terms':[]},'fields':[]}]
  await page.evaluate('''async ([scope,ops])=>{await new Promise((resolve,reject)=>{const q=indexedDB.open('fluxo-sandrini',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>{const t=q.result.transaction('drafts','readwrite');t.objectStore('drafts').put({scope,baseVersion:1,requestId:crypto.randomUUID(),ops},'draft:'+scope);t.oncomplete=resolve;t.onerror=reject;};});}''',[scope,pending])
  await page.reload();await page.locator('#pending-ra').wait_for();await page.get_by_text('Rascunho recuperado',exact=False).wait_for()
  dl=await review(page);await dl.screenshot(path='/tmp/browser/receipts/legacy-review.png');await dl.get_by_role('button',name='Voltar à edição').click()
  await general(page,'rb','123,45');dl=await review(page);assert await dl.get_by_role('row').count()>=3
  reads=counts['official_reads'];start=time.perf_counter();await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.wait_for(state='hidden');print('save_seconds',round(time.perf_counter()-start,3),'rereads',counts['official_reads']-reads,'phases',await page.evaluate("performance.getEntriesByType('measure').filter(e=>e.name.startsWith('sandrini.save')).map(e=>({name:e.name,ms:e.duration}))"),flush=True)
  assert state['commits']==1;assert len(requests)==1
  assert any(r['id']=='ra' and r['general']==0 for r in state['data']['receipts']);assert any(r['id']=='rb' and r['general']==12345 for r in state['data']['receipts'])
  await page.get_by_role('button',name='Salvar',exact=True).wait_for();await page.reload();await page.locator('#pending-ra').wait_for();await page.get_by_text('Rascunho recuperado',exact=False).wait_for()
  # Lost response, reload, same ID recovery, no extra commit.
  await general(page,'rb','200,00');dl=await review(page);fail_after=True;await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.get_by_role('button',name='Tentar novamente a confirmação').wait_for();lost=requests[-1];await dl.screenshot(path='/tmp/browser/receipts/failed-review.png')
  await page.reload();await page.get_by_role('button',name='Tentar novamente a operação').wait_for();await page.get_by_role('button',name='Tentar novamente a operação').click();await page.get_by_role('button',name='Tentar novamente a operação').wait_for(state='hidden');assert requests[-1]==lost;assert state['commits']==2
  # Read-only reconciliation of a legacy request already confirmed in fixture audit.
  old=copy.deepcopy(next(r for r in state['data']['receipts'] if r['id']=='rb'));after=copy.deepcopy(old);after['general']=33300
  state['data']['receipts']=[after if r['id']=='rb' else r for r in state['data']['receipts']];state['version']+=1
  state['legacy_done']={'version':state['version'],'opsJson':json.dumps([{'entity':'Recebimento','id':'rb','kind':'alteração','before':old,'after':after,'fields':['general']}])}
  await general(page,'rb','333,00');before_commits=state['commits'];await page.get_by_role('button',name='Revisar e salvar recebimentos',exact=True).click();await page.get_by_text('Confirmação anterior conferida.',exact=False).wait_for();assert state['commits']==before_commits
  # Same-record conflict, release, choose ours, re-review.
  await general(page,'ra','500,00');dl=await review(page);conflict=True;await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.wait_for(state='hidden');await page.get_by_role('button',name='Liberar para nova revisão').click();await page.get_by_role('button',name='Liberar para nova revisão',exact=True).last.click();await page.get_by_role('dialog',name='Conflito na mesma informação').wait_for();await page.get_by_role('button',name='Manter a minha').click();dl=await review(page);await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.wait_for(state='hidden');assert state['commits']==3
  for width,height in [(1366,900),(1920,1080),(390,844)]:
   await page.set_viewport_size({'width':width,'height':height});
   if width==390:await page.get_by_role('button',name='Ocultar menu').click()
   await general(page,'rb',str(width)+',00');dl=await review(page);await dl.screenshot(path=f'/tmp/browser/receipts/review-{width}.png');await dl.get_by_role('button',name='Voltar à edição').click()
  # New receipt, cancelled review, explicit save, reload.
  await page.set_viewport_size({'width':1366,'height':900})
  await page.get_by_role('button',name='+ Recebimento',exact=True).click();newrow=page.locator('tr').filter(has=page.get_by_role('button',name='Excluir',exact=True)).filter(has=page.locator('input[placeholder="dd/mm/aaaa"]')).first
  # New undated records sort first; read its real generated ID.
  newrow=page.locator('tbody tr').filter(has=page.get_by_role('button',name='Excluir',exact=True)).first
  rid=(await newrow.get_attribute('id')).replace('pending-','');dateinp=newrow.locator('td').nth(0).locator('input').first;await dateinp.fill('03/11/2026');await dateinp.blur();await general(page,rid,'0');dl=await review(page);await dl.get_by_role('button',name='Voltar à edição').click();dl=await review(page);await dl.get_by_role('button',name='Confirmar e salvar',exact=True).click();await dl.wait_for(state='hidden');assert any(r['id']==rid and r['general']==0 for r in state['data']['receipts']);await page.reload();await page.locator('#pending-'+rid).wait_for()
  # Alternative editable General in the vertical flow routes to the same receipt review.
  await page.goto('http://localhost:8080/');await page.get_by_role('button',name='Vertical (equipe)',exact=True).click();await page.get_by_role('link',name='Revisar e salvar recebimentos',exact=True).click();await page.locator('#pending-'+rid).wait_for()
  print('verified legacy-already-confirmed/new/alternative/legacy/multiple/zero/back/confirm/reload/independent/lost-response-retry/conflict, commits',state['commits'],'blocked_other_calls',counts['blocked'],'errors',errors,flush=True)
  await browser.close()
asyncio.run(main())
