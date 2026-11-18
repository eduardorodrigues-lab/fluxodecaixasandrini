import asyncio,json,os,copy,re,base64
from pathlib import Path
from playwright.async_api import async_playwright
Path('/tmp/browser/recovery-actions').mkdir(parents=True,exist_ok=True)
source=Path(__file__).with_name('save-speed-isolado.py').read_text();exec(source.split('async def main():')[0])
original_handler=handler
state['data']['suppliers']=[{'id':'s','name':'FORNECEDOR FICTÍCIO','terms':[],'group':''}]
state['data']['receipts']=[{'id':'r','date':'2026-11-18','platforms':{},'general':None,'notes':''}]
done={};read_mode='absent';fresh_fail=False;checks=0;writes=0
async def handler(route):
 global checks,writes
 seg=route.request.url.split('/_serverFn/')[1].split('?')[0];text=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode();m=re.search(r'"export":"(\w+?)_createServerFn_handler',text);name=m.group(1) if m else text.split('#')[-1]
 if name in ['commitOps','commitOfficial']:
  writes+=1;raise AssertionError('Consulta nunca pode gravar')
 if name=='getOfficial' and fresh_fail:return await route.abort()
 if name=='checkCommitRequest':
  checks+=1
  if read_mode=='failure':return await route.abort()
  if read_mode=='delay':await asyncio.sleep(1)
  req=unquote(route.request.url);v=next(({'version':x['version'],'opsJson':json.dumps(x['ops'])} for k,x in done.items() if k in req),None)
  return await route.fulfill(status=200,headers={'content-type':'application/json','x-tss-serialized':'true'},body=wrap(v))
 return await original_handler(route)
async def put(page,key,value):
 await page.evaluate('''async ([key,value])=>new Promise((resolve,reject)=>{const q=indexedDB.open('fluxo-sandrini',1);q.onupgradeneeded=()=>q.result.createObjectStore('drafts');q.onsuccess=()=>{const t=q.result.transaction('drafts','readwrite');t.objectStore('drafts').put(value,key);t.oncomplete=resolve;t.onerror=reject;};})''',[key,value])
async def get(page,key):
 return await page.evaluate('''async key=>new Promise(resolve=>{const q=indexedDB.open('fluxo-sandrini',1);q.onsuccess=()=>{const r=q.result.transaction('drafts','readonly').objectStore('drafts').get(key);r.onsuccess=()=>resolve(r.result);};})''',key)
async def main():
 global read_mode,fresh_fail
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  for case in ['unknown_rejected','lost_confirmed','query_failure','absent','conflict','update_failure','legacy','offline','signed_out']:
   context=await browser.new_context(viewport={'width':1280,'height':1800});await context.route('**/_serverFn/**',handler);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   state['data']['suppliers']=[{'id':'s','name':'FORNECEDOR FICTÍCIO','terms':[],'group':''}];state['version']=1;done.clear();fresh_fail=False;read_mode='absent'
   await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.goto('http://localhost:8080/recebimentos');await page.locator('#pending-r').wait_for()
   uid=json.loads(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])['user']['id'];scope='oficial:'+uid+':'+ORG;rid='11111111-1111-4111-8111-111111111111'
   before=copy.deepcopy(state['data']['suppliers'][0]);after={**before,'name':'ALTERAÇÃO CAPTURADA'};op={'entity':'Fornecedor','id':'s','kind':'alteração','before':before,'after':after,'fields':['name']}
   receipt=copy.deepcopy(state['data']['receipts'][0]);ind={'entity':'Recebimento','id':'r','kind':'alteração','before':receipt,'after':{**receipt,'general':0},'fields':['general']}
   packet={'scope':uid+':'+ORG,'orgId':ORG,'requestId':rid,'ops':[op],'recoveredPending':[op],'submittedAt':'2026-11-18T10:00:00Z','phase':'unknown','rejected':case=='unknown_rejected'}
   if case=='conflict':packet.update({'phase':'conflict','rejected':True,'conflicts':[{'change':op,'server':{**before,'name':'ATUAL DE OUTRA PESSOA'}}]})
   if case=='legacy':packet.update({'requestId':'','legacyUncertain':True,'ops':[]})
   await put(page,'draft:'+scope,{'scope':scope,'baseVersion':1,'requestId':'22222222-2222-4222-8222-222222222222','ops':[op,ind],'submissionModel':'reviewed'});await put(page,'operation:'+scope,packet);await page.reload();button=page.get_by_role('button',name='Consultar resultado',exact=True);await button.wait_for()
   if case=='signed_out':
    await page.get_by_role('button',name='Sair',exact=True).click();await page.get_by_role('dialog').get_by_role('button',name='Sair',exact=True).click();await page.get_by_role('link',name='Entrar',exact=True).wait_for();assert not await page.get_by_role('button',name='Consultar resultado').count();assert await get(page,'operation:'+scope);await context.close();print(case,'OK',flush=True);continue
   if case=='legacy':
    assert await button.is_disabled();assert 'requestId válido' in await page.locator('body').inner_text()
    async with page.expect_download() as download:await page.get_by_role('button',name='Exportar pacote preservado',exact=True).click()
    path=await (await download.value).path();assert json.loads(Path(path).read_text())['requestId']==''
   elif case=='offline':
    await context.set_offline(True);await page.wait_for_timeout(200);assert await button.is_disabled();assert 'Reconecte' in await page.locator('body').inner_text();await context.set_offline(False);await page.wait_for_timeout(200);assert await button.is_enabled()
   elif case=='conflict':
    assert await button.is_enabled();await page.get_by_role('button',name='Revisar conflito',exact=True).click();dl=page.get_by_role('dialog',name='Revisar operação recusada?');await dl.get_by_role('button',name='Revisar conflito',exact=True).click();dl=page.get_by_role('dialog',name='Conflito na mesma informação');await dl.wait_for();txt=await dl.inner_text();assert all(x in txt for x in ['Anterior → solicitado','Atual no banco → solicitado','ATUAL DE OUTRA PESSOA','ALTERAÇÃO CAPTURADA']);await dl.screenshot(path='/tmp/browser/recovery-actions/conflict.png')
   else:
    assert await button.is_enabled();assert not await page.get_by_role('button',name='Liberar para nova revisão').count();start_checks=checks
    if case=='query_failure':read_mode='failure'
    if case in ['unknown_rejected','lost_confirmed','update_failure']:
     state['data']['suppliers']=[after];state['version']=3;done[rid]={'version':2,'ops':[op]}
    if case=='update_failure':fresh_fail=True
    await button.dblclick();await page.wait_for_function("!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Consultando resultado…')")
    assert checks==start_checks+1
    if case in ['unknown_rejected','lost_confirmed']:
     await button.wait_for(state='hidden');assert await get(page,'operation:'+scope) is None;draft=await get(page,'draft:'+scope);assert len(draft['ops'])==1 and draft['ops'][0]['entity']=='Recebimento';assert draft['baseVersion']==3
    else:
     assert await get(page,'operation:'+scope);assert await button.is_enabled();text=await page.locator('body').inner_text();assert ('não comprova' in text if case=='absent' else 'não foi possível' in text.lower() if case=='query_failure' else 'atualização da tela' in text)
     if case=='update_failure':
      assert (await get(page,'operation:'+scope))['confirmation']['version']==2;fresh_fail=False;await button.click();await button.wait_for(state='hidden')
     else:
      await page.get_by_role('button',name='Ver alterações').click();await page.get_by_role('dialog').screenshot(path='/tmp/browser/recovery-actions/'+case+'.png');await page.get_by_role('dialog').get_by_role('button',name='Fechar',exact=True).click();await page.reload();await button.wait_for();assert await button.is_enabled()
   assert not errors,errors;assert writes==0;print(case,'OK; writes',writes,flush=True);await context.close()
  await browser.close()
asyncio.run(main())
