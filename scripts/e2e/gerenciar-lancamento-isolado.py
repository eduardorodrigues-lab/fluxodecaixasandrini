import asyncio,json,os,re,base64
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/manager-feedback')
def function_name(url):
 seg=url.split('/_serverFn/')[1].split('?')[0]
 try:
  u=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode()
  m=re.search(r'"export":"(\w+?)_createServerFn_handler',u)
  return m.group(1) if m else u.split('#')[-1]
 except: return 'unknown'
src=open('/dev-server/scripts/e2e/bancos-isolado.py').read().split('async def main')[0]
src=src.replace('u=base64.b64decode(seg+"="*(-len(seg)%4)).decode()', 'u="#"+function_name(route.request.url)')
exec(src)
doc['suppliers'][0]['name']='MANCHESTER'; doc['committed']=[]
doc['planned']=[{'id':'pl1','supplierId':'s1','categoryId':'k1','purchaseCode':'PROVISÃO2027-JULHO','document':'','notes':'','value':62700,'baseDate':'2027-07-01','status':'ativo','remainingOverride':None,'installments':[{'amount':20900,'date':f'2027-{7+i:02d}-15','extensionDate':None,'extensionHistory':[]} for i in range(3)]}]
state['data']=json.dumps(doc)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True); ctx=await b.new_context(viewport={'width':1366,'height':900}); page=await ctx.new_page(); writes=[]; errors=[]
  await ctx.route('**/_serverFn/**',handler)
  await ctx.route('**/rest/v1/**',lambda r:r.abort())
  page.on('pageerror',lambda e:errors.append(str(e)))
  cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
  if cookies: await ctx.add_cookies([{**c,'url':'http://localhost:8080'} for c in cookies])
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']])
  await page.wait_for_timeout(1500); await page.goto('http://localhost:8080/lancamentos',wait_until='domcontentloaded')
  search=page.get_by_role('searchbox',name='Buscar no relatório').first; await page.wait_for_timeout(2000); print('state',page.url,await page.locator('body').inner_text()); await search.wait_for(timeout=10000); await search.fill('PROVISÃO2027-JULHO'); await page.wait_for_timeout(800)
  rows=page.locator('main table tbody tr'); print('fixture rows:',await rows.all_text_contents())
  await page.get_by_role('cell',name='2/3',exact=True).first.click(); dlg=page.get_by_role('dialog',name='Gerenciar lançamento',exact=True)
  await dlg.wait_for(); print('fixture summary:',await dlg.inner_text()); await dlg.screenshot(path=str(OUT/'fixture-summary-1366.png'))
  await dlg.get_by_role('button',name='Parcelas',exact=True).click()
  for width in [1366,1536,1920]:
   await page.set_viewport_size({'width':width,'height':900})
   geometry=await dlg.evaluate('''e=>{const t=e.querySelector('.launch-parcels'); const body=e.children[1]; return {width:e.clientWidth,bodyWidth:body.clientWidth,scrollWidth:body.scrollWidth,table:t.getBoundingClientRect().width,cells:[...t.querySelectorAll('tbody tr:first-child td')].map(c=>({x:c.getBoundingClientRect().x,right:c.getBoundingClientRect().right,w:c.clientWidth})),footer:e.lastElementChild.getBoundingClientRect().top}}''')
   print('fixture geometry',width,geometry); assert geometry['scrollWidth']<=geometry['bodyWidth']+1
   await dlg.screenshot(path=str(OUT/f'fixture-parcels-{width}.png'))
  boxes=dlg.locator('tbody input[type=checkbox]'); assert await boxes.count()==3
  assert await boxes.evaluate_all('(es)=>es.every(e=>!e.checked)')
  await boxes.nth(0).check(); assert await dlg.get_by_role('button',name='Efetivar selecionadas (1)',exact=True).is_enabled()
  await boxes.nth(1).check(); assert await dlg.get_by_role('button',name='Efetivar selecionadas (2)',exact=True).is_enabled()
  await dlg.get_by_role('button',name='Selecionar todas as planejadas',exact=True).click(); assert await boxes.evaluate_all('(es)=>es.every(e=>e.checked)')
  await dlg.screenshot(path=str(OUT/'fixture-selected-3.png')); print('selection counts 1/2/3 OK; writes',writes,'runtime errors',errors)
  assert not writes; assert not errors
  await dlg.get_by_role('button',name='Efetivar documento inteiro',exact=True).click()
  assert await boxes.evaluate_all('(es)=>es.every(e=>e.checked)')
  assert await dlg.get_by_label('Saldo restante previsto (informação manual)').input_value()==''
  await dlg.get_by_role('button',name='Voltar à edição de parcelas',exact=True).click()
  await dlg.get_by_role('button',name='Limpar seleção',exact=True).click()
  await boxes.nth(1).check()
  await dlg.get_by_role('button',name='Efetivar selecionadas (1)',exact=True).click()
  await dlg.get_by_label('Justificativa para valores, datas, efetivação ou cancelamento').fill('Conferência isolada')
  await dlg.get_by_role('button',name='Revisar antes de salvar').click()
  assert 'Informe e confirme' in await dlg.get_by_role('alert').inner_text()
  await dlg.get_by_label('Saldo restante previsto (informação manual)').fill('418,00'); await dlg.get_by_label('Saldo restante previsto (informação manual)').blur()
  await dlg.get_by_label(re.compile('Conferi o saldo restante')).check()
  await dlg.get_by_role('button',name='Revisar antes de salvar').click()
  review=page.get_by_role('dialog',name='Revisar lançamento',exact=True)
  await review.wait_for(); print('partial review',await review.locator('table').first.inner_text())
  assert await review.locator('table').first.get_by_role('cell',name='Efetivar',exact=True).count()==1
  assert '418,00' in await review.inner_text()
  await review.screenshot(path=str(OUT/'fixture-partial-review.png'))
  await review.get_by_role('button',name='Confirmar alterações').click()
  await page.get_by_role('dialog',name='Revisar lançamento',exact=True).wait_for(state='hidden')
  await page.get_by_role('button',name=re.compile(r'^Efetivado')).click()
  print('after fixture confirmation',await page.locator('main table tbody').all_text_contents())
  assert await page.get_by_role('cell',name='Efetivado (previsão)',exact=True).count()==1
  assert state['commits']==0
  print('fixture commits',state['commits'])
  await page.get_by_role('cell',name='1/1',exact=True).last.click()
  committed=page.get_by_role('dialog',name='Gerenciar lançamento',exact=True)
  await committed.get_by_role('button',name='Parcelas',exact=True).click()
  assert await committed.locator('tbody input[type=checkbox]').evaluate_all('(es)=>es.every(e=>e.disabled&&!e.checked)')
  await committed.screenshot(path=str(OUT/'fixture-effective-ineligible.png'))
  print('already effective excluded in browser; no commits')
  await b.close()
asyncio.run(main())
