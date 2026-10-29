# Writer V2 — captura incremental dos próprios de campanha

- Data: 2026-10-29.
- Base: 17f073b, branch codex/writer-v2.
- Escopo: [plano 204](../tasks/writer-v2/execucao/204-captura-incremental-dos-proprios-de-campanha.md),
  continuação do passo 2 de P3. Evidência parcial; macro 8/35.

## Resultado

A seção própria já pode ser percorrida como fluxo provisório de partes:
raiz/progresso, notas, sessões, checklist, pistas/missões, corpos e referências/
vínculos. O host valida respostas e hashes e repete todo o inventário antes de
retornar own-data-only. Essa prova não é selo nem autorização da campanha completa.

O fluxo limita memória à página atual, partes, hashes e contadores. Controles,
tombstones e vínculos de pais inativos são omissões explícitas, sem payload
operacional. Pressão de consumo impede novos RPCs até o consumidor retomar.

Contas, cancelamento e encerramento são conferidos durante a captura; respostas
tardias não concluem. Definições puras foram extraídas para cliente/servidor
compartilharem famílias e limites, preservando os DTOs/tokens existentes.
Decisão na [ADR 0234](../decisions/0234-campaign-own-stream-and-replay.md).

## Critérios deste incremento

- [x] Dois singleton e nove famílias, com páginas vazias/término e omissões.
- [x] Chunks limitados e SHA-256 integral, sem buffer do projeto.
- [x] Segunda passagem completa e âncora final; mudanças S2/S3 detectadas.
- [x] Entrada/respostas/cursor/base64/manifestos cruzados ou corrompidos recusados.
- [x] Abort, fechamento, troca de conta, resposta tardia e pressão de consumo.
- [x] Leitores/escritores reais e 57 regressões de Functions preservadas.
- [ ] Arquivo completo, procedência/base/variantes/mídia, restauração/UI/ciclo P3.
- [ ] Validate integral do novo grande bloco.

## Arquivos e validação

Nova folha src/features/campaign-portability com index, contratos, stream e teste.
Definições/declaração puras em functions/src/campaignBackupOwnDefinitions.mjs e
.d.mts, reutilizadas no inventário e no limite do conteúdo.

Vitest dirigido terminou **exit 0: 21 testes, um arquivo positivo, 2,55 s**
(teste 872 ms). Inclui criação/captura de campanha e escritores reais S2/S3,
inserção atrás de cursor com várias páginas, 61 notas em páginas de 25,
partes Unicode, corpo permitido acima de 2 MiB sem buffer do projeto,
omissões, troca de conta, fechamento/abort em RPC pendente, pressão de consumo,
página desprendida antes do await, manifestos variáveis e respostas inválidas.
A primeira rodada de 18 casos também passou.

As três suítes backend afetadas passaram **57/57, exit 0, 1.052,7104 ms**,
sem falha/cancelado/ignorado/todo. Não foram substituídas por testes só de parser.
O banco de teste tem relógios nativos simulados; não prova concorrência Firestore.

Typecheck passou após corrigir um import de tipo não utilizado. Arquitetura passou.
ESLint ignorou a declaração .d.mts por configuração; ela é conferida pelo
typecheck. A rodada final de lint nos sete arquivos configurados passou sem
avisos/erros. Sintaxe dos quatro MJS, formato dos 16 arquivos, check:docs e
git diff --check passaram com exit 0. Revisão sem bloqueadores; servidor manual
HTTP 200 com mesmo PID 11192 e master limpa em 522ccaa.
Validate integral não foi repetido conforme a política do operador; a suíte
anterior de P2 não valida este código novo.

## Limites e continuidade

Não cria índice persistido, job, chave, pin, endpoint, rota, UI ou arquivo final.
Não altera Rules, dependências/lockfile ou inventário C4 v1–v4. Composição final
precisa destino temporário e todas as seções/autorizações/provas de P3, com
cobertura conferida no servidor ao restaurar. Não converter proof cliente em grant.

Base congelada/procedência, variantes/legadas/mídia, restauração/UI/ciclo,
P3/D/F2-09, política final de perguntas de 199 e gates humanos/comerciais
permanecem abertos. Somente commits locais, sem CI/push/PR/merge/deploy;
servidor manual preservado.
