import asyncio,json,os,re,copy
from pathlib import Path
from playwright.async_api import async_playwright
Path('/tmp/browser/entries').mkdir(parents=True,exist_ok=True)
source=Path(__file__).with_name('save-speed-isolado.py').read_text()
exec(source.split('async def main():')[0])
old_handler=handler
params={'profile':'legado','legacyReducer':0,'webR1':0.25,'webR2':0.18,'divisorLegado':'30','divisorWeb':'dias','lagDays':0,'startDate':'2026-11-01','saldoInicial':50000}
state['data'].update({'params':params,'targets':{'2026-11':300000},'targetConfigs':{},'planned':[],'committed':[],'expenses':[],'bankAccounts':[{'id':'A','bank':'Banco A','label':'Origem','holder':'Sandrini','agency':'','account':'','active':True,'openingBalance':100000,'openingDate':'2026-10-31','history':[]},{'id':'B','bank':'Banco B','label':'Destino','holder':'Buyclock','agency':'','account':'','active':True,'openingBalance':20000,'openingDate':'2026-10-31','history':[]}],'platforms':[{'id':'pf','name':'Plataforma fictícia','start':'2020-01-01','end':None,'history':[],'importedCode':None}],'receipts':[{'id':'r1','date':'2026-11-01','platforms':{'pf':10000},'general':5000,'accountByPlatform':{'pf':{'accountId':'A','override':True}},'notes':'','realized':True},{'id':'r2','date':'2026-11-02','platforms':{},'general':0,'notes':''}],'transfers':[{'id':'t','date':'2026-11-01','fromAccountId':'A','toAccountId':'B','amount':4000,'note':'fictícia','at':'2026-11-01','by':'fixture','reversedAt':None,'reversalNote':''},{'id':'tr','date':'2026-11-02','fromAccountId':'B','toAccountId':'A','amount':3000,'note':'','at':'2026-11-02','by':'fixture','reversedAt':'2026-11-03','reversalNote':'fixture estornada'}]})
for key in ['effectivations','adjustments','importLog','cards','cardOps']:state['data'].setdefault(key,[])
baseline=copy.deepcopy(state['data'])
async def handler(route):
 seg=route.request.url.split('/_serverFn/')[1].split('?')[0];text=base64.urlsafe_b64decode(seg+'='*(-len(seg)%4)).decode();m=re.search(r'"export":"(\w+?)_createServerFn_handler',text);name=m.group(1) if m else text.split('#')[-1]
 if name=='getOfficial':
  counts['official_reads']+=1
  v={'orgId':ORG,'orgName':'Grupo Sandrini','role':'editor','version':1,'updatedAt':'','normalization':1,'dataJson':json.dumps(state['data'])}
  return await route.fulfill(status=200,headers={'content-type':'application/json','x-tss-serialized':'true'},body=wrap(v))
 assert name not in ['commitOps','commitOfficial'], 'unexpected financial write'
 return await old_handler(route)
async def open_detail(page,label):
 await page.get_by_role('button',name=label,exact=True).click();dl=page.get_by_role('dialog').last;await dl.wait_for();return dl
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True);context=await browser.new_context(viewport={'width':1280,'height':1800});await context.route('**/_serverFn/**',handler);page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/auth');await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'],os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON']]);await page.goto('http://localhost:8080/');await page.wait_for_timeout(3000);await page.get_by_role('heading',name='Fluxo de caixa',exact=True).wait_for()
  dates=page.locator('[aria-label="Filtros do fluxo"] input');await dates.nth(0).fill('01/11/2026');await dates.nth(0).blur();await dates.nth(1).fill('03/11/2026');await dates.nth(1).blur();await page.get_by_role('button',name='Visão CEO horizontal',exact=True).click()
  for key in ['Saldo Inicial','Recebimento Previsto/Real','Recebimento Estimado','Entradas Total']:
   for date in ['01/11/2026','02/11/2026','03/11/2026','Total período']:
    dl=await open_detail(page,f'{key} · {date} · detalhar');assert 'Soma da composição:' in await dl.inner_text();await dl.get_by_role('button',name='Fechar detalhamento').click()
  dl=await open_detail(page,'Saldo Inicial · 01/11/2026 · detalhar');text=await dl.inner_text();assert '1.200,00' in text and '-R$\xa0700,00' in text;await dl.screenshot(path='/tmp/browser/entries/balance.png');await dl.get_by_role('button',name='Fechar detalhamento').click()
  dl=await open_detail(page,'Recebimento Previsto/Real · 01/11/2026 · detalhar');assert 'Conta não informada: R$\xa050,00' in await dl.inner_text();await dl.get_by_role('button',name='Fechar detalhamento').click()
  dl=await open_detail(page,'Entradas Total · Total período · detalhar');text=await dl.inner_text();assert '750,00' in text and 'Estornada' in text and 'Efeito consolidado: R$\xa00,00' in text
  for width,height in [(1366,900),(1920,1080),(390,844)]:
   await page.set_viewport_size({'width':width,'height':height});await dl.screenshot(path=f'/tmp/browser/entries/total-{width}.png');box=await dl.bounding_box();assert box['x']>=0 and box['width']<=width;assert await dl.get_by_role('button',name='Fechar detalhamento').is_visible()
  await dl.get_by_role('button',name='Fechar detalhamento').click();await page.set_viewport_size({'width':1366,'height':900});await page.get_by_role('button',name='Vertical (equipe)',exact=True).click();dl=await open_detail(page,'Recebimento Estimado · 02/11/2026 · detalhar');assert 'Substituída pelo informado' in await dl.inner_text();await dl.get_by_role('button',name='Fechar detalhamento').click()
  await page.goto('http://localhost:8080/simulacoes');await page.get_by_placeholder('Nome da simulação',exact=True).fill('Entradas fictícias');await page.get_by_role('button',name='Criar a partir da base e ativar',exact=True).click();await page.locator('#modo-sel option').filter(has_text='Entradas fictícias').wait_for(state='attached');await page.get_by_role('link',name='Fluxo',exact=True).click();dl=await open_detail(page,'Saldo Inicial · 01/11/2026 · detalhar');assert 'SIMULAÇÃO Entradas fictícias' in await dl.inner_text();await dl.screenshot(path='/tmp/browser/entries/simulation.png')
  assert state['commits']==0 and counts['blocked']==0 and state['data']==baseline;assert not errors,errors
  print('verified 16 horizontal daily/period details; bank difference; unassigned; zero/vazio; transfers/reversal; 1366/1920/390; vertical; simulation; zero writes, unchanged fixture, no runtime errors')
  await browser.close()
asyncio.run(main())
