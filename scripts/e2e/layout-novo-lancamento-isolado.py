"""Layout aprovado do novo lançamento; fixture sintética e rede de escrita bloqueada."""
import asyncio, datetime, json, re
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/layout-novo-lancamento')
OUT.mkdir(parents=True, exist_ok=True)
base = Path('/dev-server/scripts/e2e/fornecedores-card-unico-isolado.py').read_text()
exec(base.split('async def main():')[0])
OUT = Path('/tmp/browser/layout-novo-lancamento')
OUT.mkdir(parents=True, exist_ok=True)
D['categories'].append({'id': 'desp', 'kind': 'despesa', 'name': 'Fretes e Logística', 'group': ''})

async def setup(browser, mobile=False):
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 1000})
    page = await ctx.new_page()
    await page.clock.set_fixed_time(datetime.datetime(2026, 11, 25, 15, tzinfo=datetime.timezone.utc))
    await login(ctx, page)
    await page.goto('http://localhost:8080/lancamentos?tab=committed')
    await page.get_by_role('heading', name='Lançamentos', exact=True).wait_for()
    if mobile:
        await page.get_by_label('Ocultar menu').click()
    await page.get_by_role('button', name='+ Novo lançamento').click()
    await page.wait_for_timeout(500)
    dialog = page.get_by_role('dialog').last
    if await page.get_by_role('dialog').count() == 0:
        print('DIÁLOGO AUSENTE:', (await page.locator('body').inner_text())[:2000])
        await page.screenshot(path=str(OUT / 'erro_abertura.png'))
    await dialog.wait_for(timeout=15000)
    actual_label = await dialog.get_attribute('aria-label')
    print('DIÁLOGO ABERTO:', actual_label)
    await page.screenshot(path=str(OUT / '0_dialogo_aberto.png'))
    assert actual_label == 'Novo lançamento', actual_label
    return ctx, page, dialog

async def fill_base(dialog, page, total='120,00'):
    await dialog.get_by_text('Categoria', exact=True).locator('..').locator('select').select_option('compra')
    await dialog.get_by_text('Subgrupo', exact=True).locator('..').locator('select').select_option('cat1')
    supplier = dialog.locator('[data-supplier-combobox] input')
    await supplier.fill('ALFA FICT')
    await page.locator('ul[role=listbox] button', has_text='ALFA FICT').first.click()
    await dialog.get_by_text('Código do pedido', exact=True).locator('..').locator('input').fill('PED-SINT')
    await dialog.get_by_text('Documento', exact=True).locator('..').locator('input').fill('NF-SINT')
    await dialog.get_by_text('Descrição', exact=True).locator('..').locator('input').fill('Compra sintética')
    await dialog.get_by_text('Valor total', exact=True).locator('..').locator('input').fill(total)
    base_date = dialog.get_by_text('Data base para os prazos', exact=True).locator('..').locator('input')
    await base_date.fill('25/11/2026')
    await base_date.blur()

async def paste_date(locator, value):
    await locator.evaluate('(el,text)=>{const data=new DataTransfer();data.setData("text",text);el.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));}', value)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        errors = []
        checks = 0

        ctx, page, dialog = await setup(browser)
        page.on('pageerror', lambda e: errors.append(str(e)))
        assert await dialog.locator('.launch-stage-switch').get_by_role('button', name=re.compile('Efetivado')).get_attribute('aria-pressed') == 'true'
        assert await dialog.get_by_label('Vínculo com previsão', exact=True).count() == 1
        assert await dialog.get_by_role('heading', name='Valores e condição de pagamento', exact=True).count() == 1
        assert await dialog.get_by_role('heading', name='Tipo de lançamento', exact=True).count() == 0
        assert await dialog.get_by_role('heading', name='Valores e prazos', exact=True).count() == 0
        assert await dialog.get_by_role('heading', name='Condição de pagamento', exact=True).count() == 0
        columns = await dialog.locator('.launch-grid').evaluate('(el)=>getComputedStyle(el).gridTemplateColumns.split(" ").length')
        assert columns == 3, columns
        overflow = await dialog.evaluate('(el)=>({scroll:el.scrollWidth,client:el.clientWidth})')
        assert overflow['scroll'] <= overflow['client'] + 1, overflow
        await page.screenshot(path=str(OUT / '1_desktop_inicial.png'))
        print('PASS cabeçalho compacto, três colunas e sem overflow do formulário')
        checks += 1

        await fill_base(dialog, page)
        await dialog.get_by_role('button', name='Preencher manualmente', exact=True).click()
        await dialog.locator('input[type=number]').fill('3')
        await dialog.get_by_role('button', name='Gerar linhas', exact=True).click()
        rows = dialog.locator('.launch-parcel-table tbody tr')
        assert await rows.count() == 3
        for i in range(3):
            assert await rows.nth(i).locator('input.num').input_value() == '40,00'
            await rows.nth(i).get_by_label(f'Número do boleto parcela {i+1}').fill(f'BOL-{i+1}')
            await paste_date(rows.nth(i).locator('input[placeholder="dd/mm/aaaa"]').first, f'{25+i:02d}/12/2026')
        summary = ' '.join((await dialog.locator('.launch-totals-bar').inner_text()).split())
        assert 'Total do lançamento' in summary
        assert 'R$ 120,00' in summary, summary
        assert 'Diferença' in summary
        await page.screenshot(path=str(OUT / '2_desktop_parcelas.png'))
        print('PASS geração manual, boletos, vencimentos e resumo horizontal')
        checks += 1

        await dialog.get_by_role('button', name='Planejado', exact=True).click()
        assert await dialog.get_by_label('Vínculo com previsão', exact=True).count() == 0
        assert await dialog.get_by_text('Documento (opcional)', exact=True).locator('..').locator('input').input_value() == 'NF-SINT'
        assert await dialog.locator('.launch-parcel-table tbody tr').count() == 3
        await dialog.locator('.launch-stage-switch').get_by_role('button', name=re.compile('Efetivado')).click()
        assert await dialog.locator('.launch-parcel-table tbody tr').count() == 3
        assert await dialog.get_by_label('Vínculo com previsão', exact=True).count() == 1
        await dialog.get_by_role('button', name='Usar condição cadastrada', exact=True).click()
        assert await dialog.get_by_label('Condição', exact=True).count() == 1
        assert await dialog.locator('.launch-parcel-table tbody tr').count() == 3
        await dialog.get_by_role('button', name='Gerar parcelas', exact=True).click()
        decision = page.get_by_role('dialog', name='Gerar parcelas?', exact=True)
        await decision.get_by_role('button', name='Gerar parcelas', exact=True).click()
        assert await dialog.locator('.launch-parcel-table tbody tr').count() == 2
        print('PASS troca de tipo preserva dados e condição só recalcula ao gerar')
        checks += 1
        await ctx.close()

        ctx, page, dialog = await setup(browser)
        await dialog.get_by_role('button', name='Salvar', exact=True).click()
        await dialog.get_by_role('alert').first.wait_for()
        assert await page.evaluate('window.__commits.length') == 0
        assert await page.evaluate('document.activeElement.tagName') == 'SELECT'
        await dialog.get_by_label('Fechar', exact=True).click()
        decision = page.get_by_role('dialog', name='Fechar com alterações não salvas?', exact=True)
        if await decision.count():
            await decision.get_by_role('button', name='Descartar', exact=True).click()
        await page.get_by_role('dialog').wait_for(state='hidden')
        assert await page.evaluate('window.__commits.length') == 0
        print('PASS validação com foco e X sem gravação')
        checks += 1

        await page.get_by_role('button', name='+ Novo lançamento').click()
        dialog = page.get_by_role('dialog').last
        await dialog.get_by_role('button', name='Planejado', exact=True).click()
        assert await dialog.get_by_role('button', name='Preencher manualmente', exact=True).count() == 0
        assert await dialog.get_by_text('Selecione o fornecedor para ver as condições cadastradas.', exact=True).count() == 1
        supplier = dialog.locator('[data-supplier-combobox] input')
        await supplier.fill('FORNECEDOR INLINE LAYOUT')
        await page.locator('ul[role=listbox] button', has_text='Cadastrar fornecedor').click()
        card = dialog.get_by_role('region', name='Cadastrar fornecedor neste lançamento')
        await card.get_by_label('Razão social').fill('FORNECEDOR INLINE LAYOUT LTDA')
        await card.get_by_role('button', name='Cadastrar e selecionar').click()
        assert await supplier.input_value() == 'FORNECEDOR INLINE LAYOUT'
        assert await page.evaluate('window.__commits.length') == 0
        await dialog.get_by_role('button', name='Cancelar', exact=True).click()
        decision = page.get_by_role('dialog', name='Fechar com alterações não salvas?', exact=True)
        if await decision.count():
            await decision.get_by_role('button', name='Descartar', exact=True).click()
        await page.get_by_role('dialog').wait_for(state='hidden')
        assert await page.evaluate('window.__commits.length') == 0
        print('PASS planejado, fornecedor inline e Cancelar sem escrita')
        checks += 1
        await ctx.close()

        ctx, page, dialog = await setup(browser, mobile=True)
        await fill_base(dialog, page)
        await dialog.get_by_role('button', name='Preencher manualmente', exact=True).click()
        await dialog.locator('input[type=number]').fill('2')
        await dialog.get_by_role('button', name='Gerar linhas', exact=True).click()
        overflow = await dialog.evaluate('(el)=>({scroll:el.scrollWidth,client:el.clientWidth})')
        assert overflow['scroll'] <= overflow['client'] + 1, overflow
        table_wrap = dialog.locator('.launch-parcel-table').locator('..')
        table_overflow = await table_wrap.evaluate('(el)=>({scroll:el.scrollWidth,client:el.clientWidth,overflow:getComputedStyle(el).overflow})')
        assert table_overflow['scroll'] > table_overflow['client']
        assert table_overflow['overflow'] == 'auto'
        await dialog.get_by_role('button', name='Salvar', exact=True).scroll_into_view_if_needed()
        await page.screenshot(path=str(OUT / '3_mobile_rodape.png'))
        await dialog.get_by_label('Fechar', exact=True).click()
        decision = page.get_by_role('dialog', name='Fechar com alterações não salvas?', exact=True)
        if await decision.count():
            await decision.get_by_role('button', name='Descartar', exact=True).click()
        await page.get_by_role('dialog').wait_for(state='hidden')
        assert await page.evaluate('window.__commits.length') == 0
        print('PASS mobile sem overflow geral, rolagem só na tabela e rodapé acessível')
        checks += 1
        await ctx.close()

        runtime = [e for e in errors if 'hydrating' not in e]
        assert not runtime, runtime
        print('TOTAL', checks, 'grupos; erros de execução', runtime, '; escritas bloqueadas', len(blocked))
        await browser.close()

asyncio.run(main())
