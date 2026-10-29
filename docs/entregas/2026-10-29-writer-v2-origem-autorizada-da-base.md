# Writer V2 — origem autorizada da base congelada

- Data: 2026-10-29.
- Base: 23dc270, branch codex/writer-v2.
- Escopo: primeiro incremento do [plano 205](../tasks/writer-v2/execucao/205-origem-autorizada-da-base-congelada.md),
  passo 3 de P3. Evidência parcial; macro 8/35.

## Resultado

O serviço interno confere se a base congelada ainda tem origem autorizada,
com máscara de metadados e sem consultar texto. Editar a aventura ou renomear
o universo mantém a edição antiga utilizável; remover/recriar a origem não
concede acesso pelo mesmo ID. Datas lógicas não substituem nascimento nativo.

A indisponibilidade do universo suspende só lore global, preservando o acesso
à estrutura da aventura própria. Clocks, variantes, geração ativa e guard de
adoção são conferidos sem criar/resetar controles. Nenhum nome, snapshot ou
corpo histórico é retornado quando a base/origem fica indisponível.

O token dessa consulta é privado e limitado a metadados. Não é atestado portátil,
autorização de ficha individual ou certificado de inventário completo.
Decisão na [ADR 0235](../decisions/0235-campaign-backup-derived-origin-gate.md).

## Critérios do incremento

- [x] Apenas máscaras fixas, sem prosa/query/escrita.
- [x] none independente; unavailable sem material histórico de base/origem ausente.
- [x] Captura v1 real, edição preservada e recriação/reserva permanente bloqueadas.
- [x] Lore global separado da estrutura própria, sem autorização de fichas por ID.
- [x] Estado/geração/guard/clock nativos e bloqueio de adoção em preparação.
- [x] Entradas/contas/pedidos obsoletos e C4 conferidos antes de conteúdo.
- [ ] Manifesto/atestado completo, gates por recurso, exportação/restauração P3.
- [ ] Validate integral do novo grande bloco.

## Arquivos e validação

Novo functions/src/campaignBackupDerivedSource.mjs e teste dedicado. Plano 205,
ADR e índices/arquitetura/progresso registram o contrato e seus limites.
Leitores/escritores existentes, Rules, frontend, dependências, lockfiles e
inventário C4 não foram alterados. Não há endpoint, assinatura, chave, job,
pin, prosa persistida ou concessão nova.

node --test functions/test/campaignBackupDerivedSource.test.mjs terminou
**exit 0, 20/20 positivos, zero falha/cancelado/ignorado/todo, 591,3161 ms**.
As fixtures executam produtores reais de captura/comparação, adoção C3, relógio
de autorização, exclusão C4 e exclusão de aventura. A porta do gate proíbe
query, get completo, escrita e máscaras de texto, inclusive snapshot/names.

Cobertos origem/editada/removida/recriada, universo autorizado/revogado/recriado,
clocks lore/privacidade, encarnação de clock/guard, adoção real preparando/ativada,
geração ausente/incorreta sem fallback, estado ligado à base errada, header
corrompido, C4 antes de dependências, reserva permanente com raiz reaparecida,
pedido malformado/mutado, metadata-only obrigatório e comparação precisa de nanos.

A primeira rodada passou 18/20. As duas fixtures foram corrigidas: preparar C3
altera a âncora, então o teste agora prova a recusa da fonte antiga e obtém a
atual antes de verificar o guard; exclusão de aventura usa a fixture existente
com nascimento conjunto por commit. A implementação de produção não foi
enfraquecida para fazer esses casos passarem. Nenhum teste antigo foi removido.

ESLint e sintaxe dos dois módulos, formato dos nove arquivos, check:docs e
git diff --check passaram com exit 0. Revisão sem bloqueadores; nenhum material
histórico lido antes dos gates. Servidor manual respondeu HTTP 200 com mesmo
PID 11192 e master permaneceu limpa em 522ccaa. Não foi repetida a suíte integral
ou a CI, conforme a política do operador. Este incremento adiciona só módulos
novos e documentação; suítes anteriores não validam a lógica nova.

## Pendências

O nascimento da origem anterior ao da base é compatibilidade dos produtores
privados v1, não prova genérica de cópia restaurada. A restauração exigirá
procedência/recibo explícitos e consumidores preparados antes de ativar bases.

Ainda faltam manifesto/atestado produzido pelo servidor, validação por recurso,
variantes/legadas/mídia e arquivo completo, persistência/cleanup, restauração/
UI/ciclo de P3/D/F2-09. Não recapturar a aventura atual como edição antiga nem
assinar manifesto/hash do cliente sem leitura/validação nativa integral.
P3, objetivo Writer V2, política final de perguntas de 199 e gates humanos/
comerciais permanecem abertos. Somente commits locais, sem push/PR/merge/deploy.
