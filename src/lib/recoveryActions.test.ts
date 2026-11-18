import { describe, expect, it } from 'vitest';
import { confirmationBlockReason, definitiveRejection } from './recoveryActions';
import type { ReviewedOperation } from './operationSave';
const packet: ReviewedOperation={scope:'user:org',orgId:'org',requestId:'11111111-1111-4111-8111-111111111111',ops:[],phase:'unknown',rejected:true};
const ready={authenticated:true,authorized:true,busy:false,online:true};
describe('recuperação acionável sem escrita',()=>{
  it('UNKNOWN com rejected legado permite consulta mas não nova revisão',()=>{expect(confirmationBlockReason(packet,ready)).toBe('');expect(definitiveRejection(packet)).toBe(false);});
  it('recusa comprovada só libera revisão com fase failed ou conflict e sem confirmação',()=>{expect(definitiveRejection({...packet,phase:'failed'})).toBe(true);expect(definitiveRejection({...packet,phase:'conflict'})).toBe(true);expect(definitiveRejection({...packet,phase:'sending'})).toBe(false);expect(definitiveRejection({...packet,phase:'failed',confirmation:{status:'duplicate',version:2}})).toBe(false);});
  it('sem autenticação exige entrada sem consulta',()=>{expect(confirmationBlockReason(packet,{...ready,authenticated:false})).toContain('Entre novamente');});
  it('sem acesso ao contexto bloqueia a leitura',()=>{expect(confirmationBlockReason(packet,{...ready,authorized:false})).toContain('organização original');});
  it('offline e consulta simultânea explicam bloqueio',()=>{expect(confirmationBlockReason(packet,{...ready,online:false})).toContain('Reconecte');expect(confirmationBlockReason(packet,{...ready,busy:true})).toContain('andamento');});
  it('requestId ausente exige exportação sem gerar identificador',()=>{const old={...packet,requestId:''};expect(confirmationBlockReason(old,ready)).toContain('requestId válido');expect(old.requestId).toBe('');});
});