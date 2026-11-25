"""Células salvam ao concluir (Enter/blur) em Recebimentos e Metas. Store sintético; toda escrita de rede bloqueada."""
import asyncio,json,datetime,re
from pathlib import Path
base=Path('/dev-server/scripts/e2e/fornecedores-card-unico-isolado.py').read_text()
exec(base.split('async def main():')[0])
OUT=Path('/tmp/browser/autosave');OUT.mkdir(parents=True,exist_ok=True)
D['targets']={'2026-11':30000000,'2026-12':30000000}
D['receipts']=[{'id':'r1','date':'2026-11-24','general':None,'byPlatform':{},'note':''}]
original=fixture
def fixture(role='editor'):
  f=original(role);f['active']['data']=json.loads(json.dumps(D));return f
mock=mock.replace("export const uid=","window.__updates=[];f.update=(fn)=>{try{const d=structuredClone(f.active.data);fn(d);window.__updates.push(JSON.stringify(d.receipts)+'|'+JSON.stringify(d.targets));f.active={...f.active,data:d};f.base=f.active;bump();return null;}catch(e){return e.message}};export const uid=")
async def main():
  from playwright.async_api import async_playwright
  checks=0
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);errs=[]
    ctx=await b.new_context(viewport={'width':1440,'height':1000});page=await ctx.new_page();page.on('pageerror',lambda e:errs.append(str(e)))
    await page.clock.set_fixed_time(datetime.datetime(2026,11,24,15,tzinfo=datetime.timezone.utc))
    await login(ctx,page);await page.goto('http://localhost:8080/recebimentos');await page.evaluate("localStorage.removeItem('fixture-db')");await page.reload()
    await page.get_by_role('heading',name='Recebimentos').first.wait_for()
    cell=page.locator('input.inp.num').first;await cell.wait_for()
    await cell.click();await cell.fill('1');await cell.fill('12');await cell.fill('123,45')
    assert await page.evaluate('window.__updates.length')==0,'não grava a cada tecla'
    await cell.press('Enter');await page.wait_for_timeout(200);await page.locator('body').click(position={'x':5,'y':5})
    n=await page.evaluate('window.__updates.length');assert n==1,f'Enter+blur deve gravar uma vez, gravou {n}'
    assert '12345' in await page.evaluate('window.__updates[0]')
    print('PASS recebimento: Enter+blur grava uma vez, em centavos');checks+=1
    await cell.click();await cell.fill('0');await cell.press('Enter');await page.wait_for_timeout(200)
    assert await page.evaluate('window.__updates.length')==2 and '"general":0' in await page.evaluate('window.__updates[1]')
    await cell.click();await cell.fill('abc');await cell.press('Enter');await page.wait_for_timeout(200)
    assert await page.evaluate('window.__updates.length')==2 and await cell.get_attribute('aria-invalid')=='true' and await cell.input_value()=='abc'
    print('PASS zero explícito gravado; inválido preservado no campo sem gravar');checks+=1
    assert await page.get_by_role('button',name=re.compile('Revisar')).count()==0
    await page.screenshot(path=str(OUT/'1_recebimentos.png'))
    await page.goto('http://localhost:8080/metas');await page.get_by_role('heading',name='Meta de Faturamento').wait_for()
    assert await page.get_by_role('button',name='Revisar e confirmar').count()==0
    m=page.locator('table input[inputmode="decimal"]').first;await m.wait_for();before=await page.evaluate('window.__updates.length')
    await m.click();await m.fill('310.000,00');await m.press('Enter');await page.wait_for_timeout(400)
    after=await page.evaluate('window.__updates.length');assert after==before+1,f'meta: {before}->{after}'
    assert '31000000' in await page.evaluate('window.__updates.at(-1)')
    await page.screenshot(path=str(OUT/'2_metas.png'))
    print('PASS meta salva ao concluir, sem revisão');checks+=1
    errs=[e for e in errs if 'hydrating' not in e]  # SSR não vê o store simulado
    assert not errs,errs
    print('bloqueadas',len(blocked),'checks',checks);await b.close()
asyncio.run(main())
