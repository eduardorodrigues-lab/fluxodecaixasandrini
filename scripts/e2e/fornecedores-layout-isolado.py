import asyncio,json,datetime,re
src=open('/dev-server/scripts/e2e/estabilizacao-itens-1-4-5-6-7-isolado.py').read()
head=src[:src.index('async def main')]
g={}; exec(head.replace("OUT=Path('/tmp/browser/estab')","OUT=Path('/tmp/browser/forn')"),g)
T=lambda *t: list(t)+[None]*(10-len(t))
sups=[{"id":"a","name":"ADIDAS FICT","group":"","terms":T(42,56,70),"legalName":"999 - ADIDAS FICTICIA LTDA","aliases":["Adidas Fict Brasil"],"note":"Fixture sintética","conditions":[
 {"id":"c0","name":"Condição original","terms":T(42,56,70),"from":None,"at":"2026-01-01T00:00:00Z","by":"x","kind":"padrao"},
 {"id":"c1","name":"A partir de 08/06","terms":T(58,70,84),"from":"2026-06-08","at":"2026-01-02T00:00:00Z","by":"x","kind":"vigencia"},
 {"id":"c2","name":"Simulação","terms":T(88,100,114),"from":None,"at":"2026-01-03T00:00:00Z","by":"x","kind":"simulacao","periods":[]},
 {"id":"c3","name":"A partir de 01/2027","terms":T(60,90),"from":"2027-01-01","at":"2026-01-04T00:00:00Z","by":"x","kind":"vigencia"}]},
 {"id":"m","name":"ADIDAS FICT SIMULACAO","group":"","terms":T(1),"mergedInto":"a"}]+[{"id":f"s{i}","name":f"FORNECEDOR {i:02d}","group":"","terms":T(30,60)} for i in range(14)]
g['fixture']['active']['data']['suppliers']=sups if 'active' in g['fixture'] else None
async def main():
  from playwright.async_api import async_playwright
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); errs=[]
    for w,h in [(1600,1000),(900,1100)]:
      ctx=await b.new_context(viewport={'width':w,'height':h}); page=await ctx.new_page(); page.on('pageerror',lambda e:errs.append(str(e)))
      await page.clock.set_fixed_time(datetime.datetime(2026,11,24,15,tzinfo=datetime.timezone.utc))
      await g['login'](ctx,page); await page.goto('http://localhost:8080/referencias'); await page.wait_for_timeout(3500)
      await page.get_by_label('Buscar fornecedor').fill('adidas'); await page.wait_for_timeout(300)
      print(w,'linhas:',await page.locator('.sup-table tbody tr').count())
      print(w,'card:',(await page.locator('.sup-detail').inner_text())[:700].replace('\n',' | '))
      await page.screenshot(path=f'/tmp/browser/forn/ref-{w}.png')
      if w==1600:
        await page.get_by_role('button',name='Editar ADIDAS FICT').click(); await page.wait_for_timeout(800)
        dlg=page.get_by_role('dialog').first; t=await dlg.inner_text(); print('manager tem dados+condições:', 'Razão social' in t and 'Condições (' in t, 'abas?', await dlg.get_by_role('tab').count())
        await page.screenshot(path='/tmp/browser/forn/manager.png')
        await dlg.get_by_role('button',name='Fechar').first.click(); await page.wait_for_timeout(300); print('fechou:', await page.get_by_role('dialog').count()==0)
      await ctx.close()
    print('erros',errs[:3],'bloqueados',len(g['blocked']))
asyncio.run(main())
