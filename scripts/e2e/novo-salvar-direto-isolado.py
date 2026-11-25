"""Salvamento direto: navegador e persistência sintética. Sem chamadas financeiras oficiais."""
import asyncio,json,re,datetime
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/salvar-direto');OUT.mkdir(parents=True,exist_ok=True)
# Reutiliza a instalação do store fictício já existente; não executa os testes antigos.
base=Path('/dev-server/scripts/e2e/fornecedores-card-unico-isolado.py').read_text()
exec(base.split('async def main():')[0])
OUT=Path('/tmp/browser/salvar-direto');OUT.mkdir(parents=True,exist_ok=True)
D['categories'].append({'id':'desp','kind':'despesa','name':'Fretes e Logística','group':''})
original=fixture

def fixture(role='editor'):
    f=original(role)
    f['active']['data']=json.loads(json.dumps(D))
    f['active']['data']['planned']=[];f['active']['data']['committed']=[]
    return f
old="f.saveOperation=async(req)=>{if(window.__commits.some(c=>c.requestId===req.requestId))return;const r=applyOps(f.active.data,req.ops,true);if(r.conflicts.length)throw new Error('Conflito');f.active={...f.active,data:r.data};f.base=f.active;f.official={...f.official,version:f.official.version+1};window.__commits.push({requestId:req.requestId,ops:req.ops.length});localStorage.setItem('fixture-db',JSON.stringify({data:f.active.data,version:f.official.version}));bump();};"
new="""f.saveOperation=async(req)=>{
 window.__attempts=(window.__attempts||0)+1;
 if(!f.canEdit||f.official.orgId!=='org-teste')throw new Error('Sem permissão');
 if(window.__commits.some(c=>c.requestId===req.requestId))return;
 req.phase='sending';req.submittedAt=new Date().toISOString();
 if(window.__mode==='fail'){req.phase='failed';req.rejected=true;throw new Error('Falha sintética — preenchimento preservado');}
 const r=applyOps(f.active.data,req.ops,true);if(r.conflicts.length)throw new Error('Conflito');
 const commit={requestId:req.requestId,ops:req.ops};
 const receipt={data:r.data,version:f.official.version+1};
 window.__commits.push(commit);localStorage.setItem('fixture-db',JSON.stringify(receipt));
 if(window.__mode==='lost'){
   req.phase='checking';f.pendingOperation=req;bump();
   const recovered=await confirmSubmission(new Promise(()=>{}),async()=>receipt,50);
   if(!recovered)throw new Error('Resultado desconhecido');
 }
 else await new Promise(resolve=>setTimeout(resolve,350));
 req.confirmation={requestId:req.requestId,version:receipt.version};req.phase='confirmed';
 f.active={...f.active,data:receipt.data};f.base=f.active;f.official={...f.official,version:receipt.version};f.pendingOperation=null;bump();
 if(window.__mode==='read-fail')throw new Error('Falha de atualização após ACK');
};"""
assert old in mock
mock=mock.replace(old,new).replace("import React from 'react';","import {confirmSubmission} from '/src/lib/saveRecovery.ts';import React from 'react';")

async def open_new(page,stage='committed',kind='compra',count=1,inline=False,doc='NF-SINT'):
    await page.get_by_role('button',name='+ Novo lançamento').click()
    dl=page.get_by_role('dialog',name=re.compile('Novo'))
    if stage=='planned':await dl.get_by_role('button',name='Planejado',exact=True).click()
    await dl.get_by_text('Categoria',exact=True).locator('..').locator('select').select_option(kind)
    await dl.get_by_text('Subgrupo',exact=True).locator('..').locator('select').select_option('cat1' if kind=='compra' else 'desp')
    sel=dl.locator('[data-supplier-combobox] input')
    await sel.fill('FORNECEDOR INLINE NOVO' if inline else 'ALFA FICT')
    if inline:
        await page.locator('ul[role=listbox] button',has_text='Cadastrar fornecedor').click()
        card=dl.get_by_role('region',name='Cadastrar fornecedor neste lançamento')
        await card.get_by_label('Razão social').fill('FORNECEDOR INLINE NOVO LTDA')
        await card.get_by_role('button',name='Nova condição').click()
        await card.get_by_label('Nome da condição 1').fill('Prazo negociado sintético')
        await card.locator('tbody input').last.fill('30')
        await card.locator('tbody input').last.blur()
        await card.get_by_role('button',name='Cadastrar e selecionar').click()
        assert await page.get_by_role('dialog').count()==1
    else:await page.locator('ul[role=listbox] button',has_text='ALFA FICT').first.click()
    await dl.get_by_text(re.compile(r'^Documento( \(opcional\))?$'),exact=True).locator('..').locator('input').fill(doc)
    await dl.get_by_text(re.compile(r'^Valor total( previsto)?$'),exact=True).locator('..').locator('input').fill('100,01')
    bd=dl.get_by_text('Data base para os prazos',exact=True).locator('..').locator('input')
    await bd.fill('24/11/2026');await bd.blur()
    for i in range(count):await dl.get_by_role('button',name='Adicionar parcela',exact=True).click()
    rows=dl.locator('.launch-parcel-table tbody tr')
    for i in range(count):
        row=rows.nth(i);amount=10001//count if i<count-1 else 10001-(10001//count)*(count-1)
        await row.locator('input.num').fill(f'{amount/100:.2f}'.replace('.',','));await row.locator('input.num').blur()
        dt=row.locator('input[placeholder="dd/mm/aaaa"]').first
        await dt.evaluate('(el,text)=>{const data=new DataTransfer();data.setData("text",text);el.dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));}',f'{i+1:02d}/12/2026')
    assert await dl.get_by_role('button',name='Salvar',exact=True).count()==1
    assert await dl.get_by_text('Conferi os valores',exact=False).count()==0
    return dl

async def setup(b,role='editor',mobile=False):
    ctx=await b.new_context(**({'viewport':{'width':390,'height':844}} if mobile else {}))
    page=await ctx.new_page();await login(ctx,page,role)
    await page.goto('http://localhost:8080/lancamentos?tab=committed');await page.get_by_role('heading',name='Lançamentos',exact=True).wait_for()
    if mobile: await page.get_by_label('Ocultar menu').click()
    return ctx,page

async def main():
 async with async_playwright() as p:
    b=await p.chromium.launch(headless=True);errors=[];checks=0
    for stage in ['planned','committed']:
      for kind in ['compra','despesa']:
       for count in [1,3]:
        ctx,page=await setup(b);page.on('pageerror',lambda e:errors.append(str(e)))
        dl=await open_new(page,stage,kind,count,doc=f'NF-{stage}-{kind}-{count}')
        if stage=='committed' and kind=='compra' and count==3:await page.screenshot(path=str(OUT/'1_formulario.png'))
        await dl.get_by_role('button',name='Salvar',exact=True).dblclick()
        await page.wait_for_function('window.__commits?.length===1 && !window.__fixture.pendingOperation')
        await page.get_by_role('dialog').wait_for(state='hidden')
        result=await page.evaluate('({d:window.__fixture.active.data,c:window.__commits,a:window.__attempts})')
        assert result['a']==1 and len(result['c'])==1
        values=[p['amount'] for p in result['d']['planned'][0]['installments']] if stage=='planned' else [c['value'] for c in result['d']['committed']]
        assert len(values)==count and sum(values)==10001 and not result['d']['payments']
        await page.reload();await page.get_by_role('heading',name='Lançamentos',exact=True).wait_for()
        assert await page.evaluate('window.__fixture.changes.length')==0
        assert await page.evaluate('window.__fixture.active.data.planned.length+window.__fixture.active.data.committed.length')==(1 if stage=='planned' else count)
        print('PASS inclusão+duplo clique+reload',stage,kind,count);checks+=1;await ctx.close()
    # inválido: nenhum envio; erro próximo e foco no subgrupo
    ctx,page=await setup(b);await page.get_by_role('button',name='+ Novo lançamento').click();dl=page.get_by_role('dialog')
    await dl.get_by_role('button',name='Salvar',exact=True).click()
    await dl.get_by_role('alert').first.wait_for()
    assert await page.evaluate('window.__attempts||0')==0
    assert await page.evaluate('document.activeElement.tagName')=='SELECT'
    print('PASS inválido, erro local e foco');checks+=1;await ctx.close()
    # fornecedor e condição inline: somente lançamento efetua o pacote
    ctx,page=await setup(b,'owner');dl=await open_new(page,count=3,inline=True)
    assert await page.evaluate('window.__attempts||0')==0
    await dl.get_by_role('button',name='Salvar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
    pack=await page.evaluate('window.__commits[0].ops');assert len([o for o in pack if o['entity']=='Fornecedor'])==1
    assert len([o for o in pack if o['entity']=='Efetivado (compra/pedido)'])==3
    assert await page.evaluate('window.__fixture.active.data.suppliers.find(s=>s.name==="FORNECEDOR INLINE NOVO").conditions[0].name')=='Prazo negociado sintético'
    print('PASS owner/fornecedor+condição+lançamento atômicos');checks+=1;await ctx.close()
    # condição específica nova no mesmo pacote, sem diálogo extra
    ctx,page=await setup(b);dl=await open_new(page,count=0)
    await dl.get_by_role('button',name='Usar condição cadastrada',exact=True).click()
    await dl.get_by_label('Condição',exact=True).select_option('__esp')
    await dl.locator('table').first.locator('tbody input').first.fill('30')
    await dl.locator('table').first.locator('tbody input').first.blur()
    await dl.get_by_text('Salvar como nova condição do fornecedor',exact=True).click()
    await dl.get_by_placeholder('Nome da condição').fill('Nova condição sintética')
    assert await page.get_by_role('dialog').count()==1
    await dl.get_by_role('button',name='Gerar parcelas',exact=True).click()
    assert await page.evaluate('window.__attempts||0')==0
    await dl.get_by_role('button',name='Salvar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
    assert await page.evaluate('window.__fixture.active.data.suppliers.find(s=>s.id==="a").conditions.some(c=>c.name==="Nova condição sintética")')
    print('PASS condição específica criada no mesmo envio');checks+=1;await ctx.close()
    # reabrir preenchimento ainda não salvo: Salvar direto; ID já confirmado não recria
    ctx,page=await setup(b);dl=await open_new(page,stage='planned',count=3)
    creation_id=await page.evaluate('sessionStorage.getItem("fluxo:new-id:u1:org-teste:base")')
    await page.wait_for_timeout(900);await page.reload();await page.get_by_role('heading',name='Lançamentos',exact=True).wait_for()
    await page.get_by_role('button',name='+ Novo lançamento').click();dl=page.get_by_role('dialog')
    assert await dl.get_by_role('button',name='Salvar',exact=True).count()==1
    await dl.get_by_text('Documento (opcional)',exact=True).locator('..').locator('input').wait_for()
    assert await dl.get_by_text('Documento (opcional)',exact=True).locator('..').locator('input').input_value()=='NF-SINT'
    await dl.get_by_role('button',name='Salvar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
    await page.evaluate('(id)=>sessionStorage.setItem("fluxo:new-id:u1:org-teste:base",id)',creation_id)
    await page.get_by_role('button',name='+ Novo lançamento').click();dl=page.get_by_role('dialog')
    assert await dl.get_by_text('Este lançamento já foi gravado.',exact=False).count()==1
    assert await dl.get_by_role('button',name='Salvar',exact=True).is_disabled()
    assert await page.evaluate('window.__commits.length')==1
    print('PASS rascunho recuperado direto e identidade confirmada bloqueia duplicação');checks+=1;await ctx.close()
    for mode in ['fail','lost','read-fail']:
        ctx,page=await setup(b);dl=await open_new(page,count=3);await page.evaluate('(m)=>window.__mode=m',mode)
        await dl.get_by_role('button',name='Salvar',exact=True).click()
        if mode=='fail':
            await dl.get_by_role('alert',name='').filter(has_text='Falha sintética').wait_for()
            assert await dl.get_by_text('Documento',exact=True).locator('..').locator('input').input_value()=='NF-SINT'
            assert await page.evaluate('window.__commits.length')==0
            await page.evaluate('window.__mode="ok"');await dl.get_by_role('button',name='Salvar',exact=True).click()
        await page.get_by_role('dialog').wait_for(state='hidden');assert await page.evaluate('window.__commits.length')==1
        assert await page.evaluate('window.__fixture.active.data.committed.length')==3
        print('PASS recuperação',mode);checks+=1;await ctx.close()
    # existente: revisão e adição continuam no gerenciamento
    ctx,page=await setup(b);dl=await open_new(page,count=3);await dl.get_by_role('button',name='Salvar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
    await page.get_by_role('button',name=re.compile('^Gerenciar ')).first.click()
    dl=page.get_by_role('dialog',name='Gerenciar lançamento');await dl.get_by_text('Descrição',exact=True).locator('..').locator('input').fill('Edição sintética')
    await dl.get_by_role('button',name='Salvar',exact=True).dblclick();await page.get_by_role('dialog',name='Gerenciar lançamento').wait_for(state='hidden')
    assert await page.get_by_role('dialog',name='Revisar lançamento').count()==0
    assert await page.evaluate('window.__commits.length')==2, 'edição existente: um clique, uma gravação (clique duplo sem duplicidade)'
    await page.screenshot(path=str(OUT/'2_existente_um_clique.png'));print('PASS existente salva com um clique, sem duplicar');checks+=1;await ctx.close()
    # leitor não pode incluir
    ctx,page=await setup(b,'viewer');newbtn=page.get_by_role('button',name='+ Novo lançamento')
    if await newbtn.count() and not await newbtn.is_disabled():
        await newbtn.click();assert await page.get_by_role('dialog').get_by_role('button',name='Salvar',exact=True).is_disabled()
    assert await page.evaluate('window.__commits.length')==0
    print('PASS leitor impedido');checks+=1;await ctx.close()
    # celular: salvar diretamente visível e sem extrapolar largura
    ctx,page=await setup(b,mobile=True);dl=await open_new(page,kind='despesa',count=1)
    await dl.get_by_role('button',name='Salvar',exact=True).scroll_into_view_if_needed();await page.screenshot(path=str(OUT/'3_mobile.png'))
    await dl.get_by_role('button',name='Salvar',exact=True).click();await page.get_by_role('dialog').wait_for(state='hidden')
    assert await page.evaluate('window.__fixture.active.data.committed[0].value')==10001
    assert await page.evaluate('window.__fixture.active.data.committed[0].dueDate')=='2026-12-01'
    print('PASS celular inclusão direta e valores/data relidos');checks+=1;await ctx.close()
    hydration=[e for e in errors if e=='There was an error while hydrating but React was able to recover by instead client rendering the entire root.']
    runtime=[e for e in errors if e not in hydration]
    assert not runtime,runtime
    print('TOTAL',checks,'checks; erros de execução',runtime,'; avisos de hidratação pela fixture cliente',len(hydration),'; escrita de rede bloqueada',len(blocked))
    await b.close()
asyncio.run(main())
