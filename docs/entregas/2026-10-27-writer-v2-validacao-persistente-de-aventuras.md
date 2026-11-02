# Writer V2 — validação persistente de aventuras

Data: 2026-10-27. Base: 6ac71f5.
[Plano 170](../tasks/writer-v2/execucao/170-validacao-semantica-persistente-de-aventuras.md)
e [ADR 0192](../decisions/0192-adventure-persistent-content-validation.md).

## Implementado

O serviço interno advanceAdventureRestoreValidation conecta os bytes/provas do
transporte à máquina semântica por etapas. Fixa intenção/conta/job/checkpoint
antes do I/O, prepara efeitos fora da transação final e reconfere as observações
antes de confirmar índice, itens, snapshot e recibo atomicamente.

Fonte por ranges tem cache limitado a 160 chunks por passo. Chunks e provas
conferem contexto, operação criadora, nascimento/hash/versão nativos. Na confirmação,
metadata nativo e provas são relidos; não reler base64 grande quando o token
nativo prova que o mesmo documento permaneceu intacto.

Índice privado imutável tem até 384 observações e 96 novos efeitos por passo.
Cada entrada/ponteiro é limitado a 16 KiB. Os itens apontam ao arquivo.
Snapshot atual fica em validationState/current, até 64 KiB, preservando nascimento
e autenticando criador e último atualizador por operações imutáveis/hash/updateTime.
Não acumula uma cópia de estado a cada frame. Buffers SHA são sensíveis e privados.

EOF/semântica iniciam reconferência integral em lotes de até 16 novos chunks,
com membership de chunks/provas e cadeia. Só depois o servidor cria reportHash e
summary fechado de contagens/avisos. Não aceita certificados ou fase do cliente.
A raiz continua sem ownerId, invisível e sem ativação.

Rejeição conhecida de formato/conteúdo preserva o último estado confirmado e
descarta os efeitos da tentativa. Falha de I/O/identidade não vira arquivo inválido.
Replay devolve recibo histórico e progresso atual. Cleanup cobre os três novos
namespaces inclusive em jobs antigos, recusando órfãos/faltas/artefatos alterados.

## Testes dirigidos e revisão

13 Vitest novos distintos positivos em seleções, depois também positivos na
rodada integral. Arquivo nativo com 53 cenas coincide com o leitor independente,
retomando cada operação numa nova instância. Arquivo com dois assets de 1,2 MB
percorre múltiplos lotes, preserva o snapshot final durante recheck e confere
2,4 MB totais. Inclui replay/corrida/leitura atrasada, cancelamento durante I/O,
corrupção/recriação de snapshot, índice/recibo alterados, membership extra,
órfãos e limpeza com item esperado ausente.

Cinco Node novos positivos (307,859 ms total dirigido), mais 22 de regressão
do transporte (698,250 ms). Incluem arquivo mínimo de contrato, rejeição semântica
com framing íntegro, rollback da transação final, fonte alterada antes de confirmar
e recusa de campos de certificado/fase enviados pelo cliente.

Cinco SDK novos distintos positivos em seleções e uma regressão de cleanup
legado, somente emulador Firestore 1.22.0 demo em 127.0.0.1. Comprovam birth
preservado do snapshot, transações concorrentes reais, retry/replay, rollback,
estado recriado/índice alterado, rejeição semântica e negação de leitura/listagem/
escrita dos namespaces para dono, terceiro e anônimo. As JVMs próprias foram
encerradas e sua ausência foi conferida; servidor Vite do usuário preservado.

Revisão encontrou uma corrida: durante leitura atrasada, outro trabalhador podia
confirmar a mesma operação, mas o primeiro propagava erro de pin em vez do recibo.
Agora tenta resolver a operação exata antes de propagar falha de armazenamento/
identidade. O teste de trabalhador atrasado passou; concorrência SDK foi repetida.

Primeira seleção SDK teve quatro passes e falhou na consulta de listagem do teste,
que omitia o limit obrigatório. Corrigida para limit(50); o caso passou
(24.931,908 ms total). A fixture de imagens tem dois assets: corrigidas quantidade
de lotes e expectativa de bytes, sem mudar produção ou afrouxar asserções.
A seleção SDK final de concorrência passou em 9.691,998 ms; cleanup legado
em 5.130,081 ms. Não representam uma suíte global de Rules.

## Validação integral

npm run validate terminou com exit 0 em 2.205,62 s, no Node 24.21.0:

- 324 arquivos / 4.292 casos de frontend positivos, com cobertura, em 1.487,90 s.
- Cobertura statements/branches/functions/lines: 89,94/85,71/91,12/93,24%.
  Limites preservados em 85/75/90/85%.
- 90 scripts positivos em 18.674,668 ms.
- 3.406 casos de Functions positivos em 334.387,175 ms; sintaxe de 334 módulos.
- Skills, arquitetura, docs, styleguide, formatação, lint e tipos positivos.
- Build de 3.028 módulos em 2,38 s e smoke do bundle positivos.

VITEST_MAX_WORKERS=1 apenas no ambiente do subprocesso da rodada integral,
sem alterar a configuração do repositório ou os limites. Os 12 arquivos de código/
teste alterados mantiveram hashes idênticos entre início e fechamento da rodada.
A tentativa de check:functions inexistente foi substituída pelo script check
no pacote functions, positivo. Build mantém avisos de imports estáticos/dinâmicos;
nenhuma configuração de bundle foi alterada por este incremento.

Documentação final foi reconferida depois da evidência. Sem nova prova de interface,
a11y, Node 22 ou produção. HTTP local 5173 respondeu 200; não é teste de restauração.

## Limites e continuidade

content-verified é conteúdo observado, não projeto restaurado utilizável nem
autorização de origens externas. Recheck em várias transações não equivale a
snapshot atômico contra alterações administrativas externas; consumidores futuros
ainda revalidam cada unidade, prova e origem antes de escrever.

Faltam leitura autenticada para consumidores/remap, revisão, stager de estrutura/
lore/personas/mídia, universo autorizado, histórico/draft como versão separada,
contadores/audit/ativação, recuperação cifrada/UI e roundtrip. P2/P3/D/F2-09,
gates humanos/comerciais e contagem 8/35 (22,9% de tarefas) seguem abertos.

Somente commit local e hooks normais. Sem CI/push/PR/merge/deploy ou subagentes.
Checkout master E: preservado em 522ccaa; nenhuma alteração alheia foi incorporada.
