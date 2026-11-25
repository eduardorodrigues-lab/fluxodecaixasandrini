"""Consulta única: fixtures sintéticas no cliente, escrita de rede bloqueada, sem base oficial."""
import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright
base=Path('/dev-server/scripts/e2e/fornecedores-card-unico-isolado.py').read_text()
exec(base.split('\nasync def main():')[0])
OUT=Path('/tmp/browser/lancamentos-unificados');OUT.mkdir(parents=True,exist_ok=True)
mock="import {unifiedLaunchFixture} from '/src/test/unifiedLaunchFixture.ts';"+mock
mock=mock.replace('f.active.data=normalizeData(f.active.data);','if(!saved)f.active.data=unifiedLaunchFixture(window.__extra||0);else f.active.data=normalizeData(f.active.data);')
async def setup(browser,role='editor',extra=0,url='/lancamentos',mobile=False):
    ctx=await browser.new_context(**({'viewport':{'width':390,'height':844}} if mobile else {}))
    page=await ctx.new_page();await login(ctx,page,role)
    await ctx.add_init_script('window.__extra='+str(extra))
    await page.goto('http://localhost:8080'+url);await page.get_by_role('heading',name='Lançamentos',exact=True).wait_for()
    await page.get_by_role('region',name='Tabela de Lançamentos',exact=True).wait_for()
    if mobile:await page.get_by_label('Ocultar menu').click()
    return ctx,page
async def count(page,n):
    await page.wait_for_function('(n)=>document.querySelectorAll("[data-launch-key]").length===n',arg=n)
async def close(page):
    await page.get_by_role('dialog').get_by_role('button',name='Cancelar',exact=True).click()
    await page.get_by_role('dialog').wait_for(state='hidden')
async def main():
 async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);errors=[];checks=0
    ctx,page=await setup(b);page.on('pageerror',lambda e:errors.append(str(e)))
    await count(page,14)
    stage=page.get_by_label('Etapa',exact=True)
    assert await stage.input_value()==''
    assert await page.get_by_role('link',name=re.compile('^Planejada$|^Efetivado$')).count()==0
    for title in ['Pagamentos (baixas)','Consultas','Planejado × Efetivado']:assert await page.get_by_role('link',name=re.compile('^'+re.escape(title))).count()==1
    rows=page.locator('[data-launch-key]')
    assert await rows.evaluate_all('(rs)=>new Set(rs.map(r=>r.dataset.launchKey)).size')==14
    assert await rows.first.locator('td').nth(1).inner_text() in ['Planejamento','Efetivação']
    assert 'Etapa' in await page.get_by_role('region',name='Tabela de Lançamentos',exact=True).locator('th').nth(1).inner_text()
    # resumo financeiro no cabeçalho: dois indicadores compactos, imediatamente à esquerda de "+ Novo lançamento"
    header=page.locator('header.page-header')
    chipre=re.compile('^(Planejamento remanescente|Efetivação — obrigação vigente): ')
    chips=header.get_by_role('button',name=chipre)
    await chips.nth(1).wait_for()
    assert await chips.count()==2
    names=[await chips.nth(i).get_attribute('aria-label') for i in range(2)]
    assert names[0].startswith('Planejamento remanescente:') and names[1].startswith('Efetivação — obrigação vigente:')
    assert 'R$' in names[0] and 'R$' in names[1]
    for i in range(2):
        box=await chips.nth(i).bounding_box()
        assert 48<=box['height']<=56,(i,box['height'])
    order=await header.evaluate("(h)=>[...h.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')||b.textContent.trim())")
    assert order==[names[0],names[1],'+ Novo lançamento'],order
    assert 'obrigação vigente' not in await page.get_by_role('region',name='Filtros de lançamentos',exact=True).inner_text()
    await chips.nth(0).click()
    menu=page.get_by_role('menu');await menu.wait_for()
    assert await chips.nth(0).get_attribute('aria-expanded')=='true'
    for cell in ['Parcelas em planejamento','Saldo planejado remanescente','Totais separados por etapa']:assert await menu.get_by_text(cell,exact=False).count()>0
    await page.screenshot(path=str(OUT/'0b_resumo_cabecalho.png'))
    await page.keyboard.press('Escape');await menu.wait_for(state='hidden')
    await chips.nth(1).click();await menu.wait_for()
    for cell in ['Parcelas efetivadas','Obrigação vigente','Pago','Saldo em aberto','Valores registrados']:assert await menu.get_by_text(cell,exact=False).count()>0
    await page.keyboard.press('Escape');await menu.wait_for(state='hidden')
    primary=page.locator('[data-filter-row="primary"]');secondary=page.locator('[data-filter-row="secondary"]')
    for label in ['Busca rápida','Fornecedor','Etapa','Situação do lançamento']:assert await primary.get_by_label(label,exact=True).count()==1
    for label in ['Categoria','Subgrupo','Período','De','Até']:assert await secondary.get_by_label(label,exact=True).count()==1
    assert await page.locator('[data-filter-row="more"]').count()==0
    review=page.locator('details').filter(has_text='Auditoria e identificações para revisão')
    assert await review.count()==1 and not await review.get_attribute('open')
    await page.get_by_role('region',name='Filtros de lançamentos',exact=True).screenshot(path=str(OUT/'0_layout_filtros.png'))
    await page.screenshot(path=str(OUT/'1_tabela.png'));print('PASS layout em duas linhas, totais compactos, auditoria recolhida, tabela e Etapa preservados');checks+=1
    # filtro compartilhado, zero, busca e ordenação
    await stage.select_option('planned');await count(page,8)
    assert await page.locator('[data-stage="committed"]').count()==0
    await page.get_by_label('Categoria',exact=True).select_option('Despesa');await count(page,2)
    await stage.select_option('committed');await count(page,3)
    assert await page.get_by_label('Categoria',exact=True).input_value()=='Despesa'
    await page.get_by_role('button',name='Limpar filtros',exact=True).click();await count(page,14)
    assert await stage.input_value()==''
    await page.get_by_label('Busca rápida',exact=True).fill('sintético');await count(page,14)
    await page.get_by_label('Busca rápida',exact=True).fill('BOL-001');await count(page,1)
    assert await page.locator('[data-stage="committed"]').count()==1
    await page.get_by_role('button',name='Limpar filtros',exact=True).click();await count(page,14)
    await page.get_by_role('button',name='Mais filtros',exact=True).click()
    await page.get_by_label('Situação do pagamento',exact=True).select_option('Pago');await count(page,1)
    assert 'same-2' in await rows.first.get_attribute('data-launch-key')
    await page.get_by_role('button',name='Mais filtros',exact=True).click()
    assert await page.locator('[data-filter-row="more"]').count()==0
    assert await page.get_by_text('Pagamento: Pago',exact=True).count()==1
    await count(page,1)
    await page.get_by_role('button',name='Limpar filtros',exact=True).click();await count(page,14)
    # zero presente em ambas fontes
    await page.get_by_role('button',name='Mais filtros',exact=True).click()
    await page.get_by_label('Valor mínimo (R$)',exact=True).fill('0')
    await page.get_by_label('Valor máximo (R$)',exact=True).fill('0');await count(page,2)
    assert await page.locator('[data-stage="planned"]').count()==1
    assert await page.locator('[data-stage="committed"]').count()==1
    await page.get_by_role('button',name='Limpar filtros',exact=True).click();await count(page,14)
    print('PASS filtros compartilhados entre etapas, pagamento, busca por boleto e zeros');checks+=1
    # Identidades same em três entidades: abrir correto sem mexer na base
    for kind,stage_value,title in [('planned','planned','Editar planejamento'),('committed','committed','Gerenciar lançamento'),('expense','committed','Gerenciar lançamento')]:
        key=json.dumps(['planned','same','same#0'],separators=(',',':')) if kind=='planned' else json.dumps(['committed',kind,'same','same'],separators=(',',':'))
        # Identidade observada distingue as fontes, mesmo quando IDs coincidem.
        all_keys=await page.locator('[data-launch-key]').evaluate_all('(rs)=>rs.map(r=>r.dataset.launchKey)')
        assert key in all_keys
        row=page.locator('[data-launch-key]').nth(all_keys.index(key))
        await row.get_by_role('button',name=re.compile('^Gerenciar ')).click()
        dl=page.get_by_role('dialog',name=title);await dl.wait_for()
        if kind=='planned':
            assert await dl.get_by_role('button',name='Efetivar documento inteiro',exact=True).count()==1
            assert await dl.get_by_role('button',name='Registrar pagamento',exact=True).count()==0
        else:
            assert await dl.get_by_role('button',name='Efetivar documento inteiro',exact=True).count()==0
            assert await dl.get_by_role('button',name='Registrar pagamento',exact=True).count()>0
            if kind=='expense':assert 'EXP-SAME' in await dl.inner_text()
        await close(page)
    assert await page.evaluate('window.__commits.length')==0
    # acessos próprios navegam sem redefinir a listagem e suas fontes
    await page.get_by_role('link',name=re.compile(r'^Pagamentos \(baixas\)')).click()
    await page.get_by_role('link',name='Pagamentos (baixas) (2)',exact=True).wait_for()
    assert await page.get_by_role('columnheader',name='Título',exact=True).count()==1
    await page.get_by_role('link',name='Consultas',exact=True).click()
    assert 'tab=consultas' in page.url
    await page.get_by_label('Abas de Lançamentos',exact=True).get_by_role('link',name='Planejado × Efetivado',exact=True).click()
    assert 'tab=pva' in page.url
    await page.get_by_role('link',name='Lançamentos',exact=True).last.click();await count(page,14)
    print('PASS mesmas IDs abrem formulários e capacidades corretos por fonte');checks+=1
    # alteração existente revisada, salva só descrição sintética, sem tocar valores
    await page.get_by_label('Busca rápida',exact=True).fill('BOL-001');await count(page,1)
    await rows.first.get_by_role('button',name=re.compile('^Gerenciar ')).click()
    dl=page.get_by_role('dialog',name='Gerenciar lançamento');await dl.get_by_text('Descrição',exact=True).locator('..').locator('input').fill('Consulta unificada sintética')
    await page.screenshot(path=str(OUT/'2_edicao.png'))
    await dl.get_by_role('button',name='Salvar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
    assert await page.evaluate('window.__commits.length')==1
    assert await page.evaluate('window.__fixture.active.data.committed.find(c=>c.id==="same").value')==10000
    assert await page.evaluate('window.__fixture.active.data.planned.find(c=>c.id==="same").notes')=='Descrição same'
    await page.get_by_label('Busca rápida',exact=True).fill('Consulta unificada sintética');await count(page,2)
    assert await page.locator('[data-stage="committed"]').count()==2
    assert 'Consulta unificada sintética' in await rows.first.inner_text()
    print('PASS alteração existente revisada, salva e relida na consulta por descrição');checks+=1
    await ctx.close()
    # seleção da página, fora de filtro, CSV completo >50, ordenação
    ctx,page=await setup(b,extra=70);await count(page,50)
    await page.get_by_label('Ordenar por',exact=True).select_option('value');await count(page,50)
    await page.get_by_label('Marcar todas desta página',exact=True).check()
    eligible=await page.locator('[data-launch-key] input:enabled').count()
    marked=await page.locator('[data-launch-key] input:checked').count()
    assert marked==eligible and marked<50
    await page.get_by_label('Etapa',exact=True).select_option('planned');await count(page,43)
    assert await page.locator('[data-launch-key] input:enabled').count()==0
    assert await page.get_by_text('fora do filtro atual continuam marcadas',exact=False).count()>0
    await page.get_by_role('button',name='Limpar filtros',exact=True).click();await count(page,50)
    await page.get_by_role('button',name='Limpar seleção',exact=True).click()
    await page.get_by_label('Ordenar por',exact=True).select_option('value');await count(page,50)
    await page.get_by_role('button',name='Próxima',exact=True).click();await count(page,34)
    await page.get_by_label('Marcar todas desta página',exact=True).check()
    assert await page.locator('[data-launch-key] input:checked').count()==await page.locator('[data-launch-key] input:enabled').count()
    async with page.expect_download() as download:
        await page.get_by_role('button',name='Exportar CSV',exact=True).click()
    csv=await (await download.value).path();text=Path(csv).read_text(encoding='utf-8-sig')
    assert text.startswith('"Etapa";') and len(text.splitlines())==85
    assert '"Planejamento";' in text and '"Efetivação";' in text
    await page.get_by_role('button',name='Editar selecionadas',exact=True).click()
    assert await page.get_by_role('dialog').count()==1
    assert await page.evaluate('window.__commits.length')==0
    await page.screenshot(path=str(OUT/'3_selecao.png'))
    print('PASS paginação/seleção por etapa, fora do filtro, revisão do lote e CSV 84 linhas');checks+=1
    await ctx.close()
    # navegação antiga e acessos próprios (uma nova sessão sintética, sem recarregar usuário)
    for tab,expected in [('planned','planned'),('committed','committed')]:
        ctx,page=await setup(b,url='/lancamentos?tab='+tab+'&focus=same')
        assert await page.get_by_label('Etapa',exact=True).input_value()==expected
        await count(page,8 if expected=='planned' else 6)
        assert await page.locator('#pending-same').count()==1
        await ctx.close()
    print('PASS caminhos antigos e foco equivalente');checks+=1
    # leitor abre consulta, nenhuma ação de gravação/seleção
    ctx,page=await setup(b,'viewer');await count(page,14)
    assert await page.get_by_role('button',name='+ Novo lançamento',exact=True).is_disabled()
    assert await page.locator('[data-launch-key] input:enabled').count()==0
    await page.locator('[data-stage="committed"]').first.get_by_role('button',name=re.compile('^Gerenciar ')).click()
    dl=page.get_by_role('dialog',name='Gerenciar lançamento')
    assert await dl.get_by_role('button',name='Salvar',exact=True).is_disabled()
    assert await page.evaluate('window.__commits.length')==0
    await ctx.close();print('PASS visualizador somente consulta');checks+=1
    ctx,page=await setup(b,mobile=True);await count(page,14)
    assert await page.get_by_label('Etapa',exact=True).is_visible()
    assert await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    mbox=[await c.bounding_box() for c in await page.get_by_role('button',name=chipre).all()]
    assert len(mbox)==2,mbox
    m1,m2=mbox
    assert not (m1['x']<m2['x']+m2['width'] and m2['x']<m1['x']+m1['width'] and m1['y']<m2['y']+m2['height'] and m2['y']<m1['y']+m1['height']),'indicadores sobrepostos no celular'
    await page.screenshot(path=str(OUT/'4_mobile.png'))
    region=page.get_by_role('region',name='Tabela de Lançamentos',exact=True)
    await region.screenshot(path=str(OUT/'4_mobile_tabela.png'))
    await page.get_by_label('Etapa',exact=True).select_option('committed');await count(page,6)
    region=page.get_by_role('region',name='Tabela de Lançamentos',exact=True)
    await region.evaluate('(el)=>el.scrollLeft=el.scrollWidth')
    await page.locator('[data-stage="committed"]').first.get_by_role('button',name=re.compile('^Gerenciar ')).click()
    await page.get_by_role('dialog',name='Gerenciar lançamento').wait_for()
    await page.screenshot(path=str(OUT/'5_mobile_gerenciar.png'))
    await ctx.close();print('PASS celular filtro e abertura por origem');checks+=1
    runtime=[e for e in errors if e!='There was an error while hydrating but React was able to recover by instead client rendering the entire root.']
    assert not runtime,runtime
    print('TOTAL',checks,'grupos aprovados; erros inesperados',runtime,'; avisos conhecidos fixture',len(errors)-len(runtime),'; requisições escritas bloqueadas',len(blocked))
    await b.close()
asyncio.run(main())
