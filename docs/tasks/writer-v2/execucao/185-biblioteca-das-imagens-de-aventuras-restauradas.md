# P2 — biblioteca das imagens de aventuras restauradas

Base: 62987b1. Continuação da restauração aprovada.

## Decisão técnica e objetivo

Reutilizar o ciclo dos livros: registro preparing/url null, uso nativo e
useCount 1; aceitação/URL e estado active somente na finalização posterior da
mídia. Os leitores atuais exigem active, a listagem do servidor exclui preparing
e mutações não retiram imagem em uso. Rules mantêm a leitura direta apenas do
próprio usuário e negam escrita/usos. Não criar um novo gate que quebre consultas.

Ao contrário da capa única, instalar cada imagem e seu uso por unidade antes da
ativação da raiz. Essa preparação física revisa a formulação de 182/ADR 0204:
disponibilidade continua posterior à ativação auditada, enquanto os registros
privados preparing são preparados em lotes. Não impor teto artificial de imagens.

## Requisitos e sequência

1. Origem v2 real de aventura: target tipado, restoreId/jobToken, assetId e
   installationOperationId. Não fabricar bookId nem um recibo de ativação que
   ainda não existe. Preservar origem v1 dos livros e o protocolo de retirada
   permanente para imagem desvinculada/excluída. Validadores puros não importam
   orquestração nem seeds.
2. Endereços de staging próprios para imagem e uso no usuário; registrar
   namespace/journals/filhos e ordenação de cleanup antes de gravar. Uma unidade
   cria imagem+uso+journals/checkpoint/recibo, conferindo ausência e filhos.
3. advanceAdventureRestoreImageLibrary interno começa somente do audit-ready
   original, com recibo/selo/contexto nativos. Guarda a prova histórica desse
   gate e remove o selo operacional antes da primeira instalação.
4. Percorrer intenções Storage prepared por kind/nome e um ativo por avanço.
   Conferir intenção, binding, recurso nativo e prova atual dos journals. Criar
   registro preparing com bytes/prova/origem, dados preservados e URL null.
   Uso e chave exatamente iguais aos writers de cenas/blocos; useCount 1.
5. Replay precede leitura; CAS/rollback/ACK perdido não duplicam biblioteca/usos.
   image-library-ready exige uma imagem/uso por intenção prepared.
6. Estender o layout da auditoria com imagens da origem e filhos uses; nenhuma
   consulta a imagens alheias. Nova auditoria obrigatória inclui os registros
   instalados e seu contexto; não aceitar o selo anterior. Estado preparing é
   preservado após auditar. Ativação/aceitação/URL continuam tarefas seguintes.
7. Cleanup cancela personas e fecha todas as intenções Storage primeiro, depois
   remove usos antes das imagens pelos journals nativos. Não adota ou remove
   imagem/uso alheio, alterado ou recriado. Contadores do projeto original intactos.
8. Testes dirigidos Node/corpus/SDK: zero/várias imagens, origem v1/v2 e retiradas,
   listagem/leitura/remoção de preparing, vínculos nativos, dois usos da mesma
   origem, ausência/foreign/ABA, CAS/replay/rollback, cancelamento parcial/final,
   invalidação e nova auditoria. Revisão/ADR/docs/evidência/commit local.
   Fechar o grande bloco local 183–185 com npm run validate, conforme orientação.

## Arquivos e riscos

Origem/retirada de imagens; serviço/meta de biblioteca restaurada; integração de
Artifacts/StagingCleanup/Store/Transfer/Contracts/StagingMeta/CountMeta; layout/
inventário/serviço de auditoria; testes, fixtures e documentação. Sem nova
dependência, endpoint, índice ou permissão pública.

Metadados puros não podem criar ciclo com imageLibrary. A nova imagem nasce no
commit de instalação, não no futuro commit de ativação; a finalização deverá
conferir sua prova própria e nunca religar imagem retirada/trocada. Editor/
preview/backup continuam exigindo active: o host de restauração deverá concluir
ou permitir retomar mídia pendente antes de afirmar restauração finalizada.

## Aceites

- [x] Instalação limitada cria preparing + uso nativo, invisível à listagem.
- [x] Origem/retirada v2 preservam v1 e impedem recriação de mídia excluída.
- [x] Selo anterior invalidado; nova auditoria cobre imagem e uso.
- [x] Replay/CAS/rollback/identidades/cleanup e casos reais cobertos.
- [x] Testes dirigidos/SDK, revisão, documentação, validate integral e commit local.

Não ativa a raiz nem aceita mídia/URL. P2 ainda precisa ativação, finalização de
mídia, recuperação/UI/roundtrip; P3/D/F2-09, fases 3–5 e gates humanos/comerciais
permanecem pendentes. Macro 8/35 inalterada.
