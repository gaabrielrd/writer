# P2 — leitura privada da estrutura de aventuras

Base: 66d5565. Após a fonte do plano 147, capturar raiz e partes por unidades
limitadas. Ainda não há arquivo/restaurador/UI completos de aventura.
Nova tentativa de index_repository fast em writer-v2 terminou com worker crash;
usar arquivos atuais conferidos, sem tratar grafo vazio como ausência de recurso.

## Descoberta e inventário

| Família                                         | Produção e relógio                                            | Captura prevista                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Raiz adventures                                 | studio; dados editoriais; cenas/narrativa/lore atualizam raiz | Metadata autoral fechada, sem dump operacional                                    |
| parts                                           | createSceneGroup/SceneJobs, writeProject e revisão de cenas   | Todas as partes, IDs próprios, ordem e texto legado se existir                    |
| scenes e body/planning/references               | scenes; alterações de texto/ordem e planejamento              | Ativas/arquivo/sem parte, texto e referências íntegros                            |
| sceneBlocks e body/current                      | adventureBlocks/Images; revisão da cena/estrutura             | Principal separado dos adicionais, audiência/tipo/ordem/imagem                    |
| sceneControls/sceneSources e índices            | scenes/sceneLoreIndex                                         | Reconstruir controles; preservar fontes próprias relevantes, sem duplicar índices |
| arcs/milestones, timelineEvents, narrativeLinks | narrativePlanning/Jobs; narrativeRevision                     | Conteúdo, ordem/data textual e referências, não labels de fallback                |
| lore local e body/current                       | adventureLore; loreVersion próprio na raiz                    | Todo lore local, inclusive não referenciado                                       |
| workProgress/checklist/ledger                   | workProgress e Ledger                                         | Metas/checklist autorais; reconstruir contagem/controles                          |
| workVersions/workVersionBodies                  | workHistory e historyRevision                                 | Todo histórico, inclusive recursos removidos                                      |
| persona raiz/cena e perfis                      | editorChatContext/Read                                        | Vínculos/definições por prova própria; cena pode mudar sem clock da raiz          |
| Imagens/universo                                | imageLibrary; universes                                       | Bytes autorizados e origem atual separada; nenhum grant do arquivo                |

A captura de campanha omite famílias e inclui apenas lore referenciado, portanto
não substitui esse inventário. O sourceToken 147 ancora somente raiz/progresso.

## Contrato antes do código

1. Extrair do módulo 147 o leitor transacional da mesma âncora, preservando seu
   getter/saída/hash. Leitura de estrutura reautoriza dentro da mesma transação;
   não chamar getter antes e depois de uma consulta desprotegida.
2. Serviço interno próprio de estrutura, sem callable/Rule/UI novo. Lista
   somente parts: sourceToken obrigatório, cursor fechado e canônico por ID,
   limit 1–50, consulta N+1 metadata. Cursor liga versão, domínio, aventura,
   fonte e último ID. Cada item leva token da origem nativa e do escopo.
3. Leitura de tipo adventure ou part exige fonte, ID, token do item e índice.
   Conferir fonte/autor, existência/nascimento/versão e ausência de exclusão/
   reorganização antes de devolver bytes. Token de outra conta, tipo ou ID
   não comprova nada. Raiz usa token de fonte; parte inclui identidade própria.
4. DTO puro próprio schemaVersion 1: raiz preserva título/sinopse/idioma,
   status/editorial, vínculo de universo como metadata e datas lógicas presentes.
   Proveniência authored/imported preserva tipo de mídia e hashes declarados;
   importId é referência operacional, não entra no arquivo nem concede confiança.
   Perfis/universo autorizado e demais famílias ficam nos seus contratos próprios.
5. Parte preserva presença e valor literal de título, ordem, contentMode, datas
   e texto legado content, mesmo que o editor use composição por cenas. Não
   aplicar trim/default silencioso. IDs/owner/schema/contadores/revisões/ranks/
   jobs são identidade/controle, não dump de conteúdo autoral.
   Dono ausente no legado segue raiz autorizada; dono presente diferente falha.
   Schema ausente pode ser legado; futuro/desconhecido falha. Não adotar órfão.
6. Serializer fechado gera JSON UTF-8 e SHA integral; leitura devolve até 64 KiB
   por índice, conferindo o mesmo item em cada chamada. Não juntar o projeto
   inteiro, nem retornar versão parcial como sucesso completo. Ausências
   continuam distintas de vazio; dados não representáveis falham sem truncar.
7. Uma leitura carrega somente um documento inline por vez. O limite físico do
   formato Document usado pela API nativa é documentado pelo
   [Firestore](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents).
   Isso não define limite global para arquivo/lore/histórico do projeto.
   Conteúdo externo/futuro exige seu leitor próprio, nunca fallback para stub.
8. Não certificar consistência das outras famílias só pelo token 147. Antes do
   selo completo haverá provas finais por recurso/binding/perfil e inventário.
   Mudança do código/contrato entre unidades deve ser detectada por hash integral.
9. Validar produtor real de partes, páginas, bytes/Unicode/vazios/ausências,
   ausência de prosa na lista, mudança/ABA/fonte/escopo, exclusão/rebalance,
   falha/rollback de leitura e zero writes. Conferir SDK real pertinente antes
   de habilitar transporte público. Testes dirigidos agora; validate no bloco P2.
10. Revisão, docs/ADR/evidência parcial e commit local. Sem CI/push/PR/merge/deploy,
    dependência nova ou subagente.

## Arquivos previstos

adventureBackupSource (extração interna compatível), adventureBackupStructure
(codec puro), adventureBackupRead (serviço), testes Node e fixtures pequenas
baseadas nos produtores existentes. Docs/ADR seguem o resultado real.
Sem mudar os writers ou o formato .writer de livros.

## Aceites

- [x] Fonte 147 preservada e autorizada no mesmo snapshot da leitura.
- [x] Páginas metadata e DTO raiz/partes por chunks com fidelidade literal.
- [x] Recusas de mudança/ABA/escopo e nenhum efeito de escrita.
- [x] Evidência dirigida e limites explícitos, P2 completo ainda aberto.

### Metadata de persona na raiz

personaId é preservado apenas como vínculo neutro, sem leitura automática de
perfil por coincidência. A disponibilidade/definição/prova de persona permanece
no contrato próprio posterior. A projeção de estrutura não é o schema do pacote
completo e não o habilita por si só.

A prova SDK acrescenta tests/firestore/adventureBackup.rules.test.mjs: emulador
demo somente em loopback, produtores reais, máscaras/cursors/bytes, Rules contra
outro/anônimo e escrita direta, ABA e falha/retry de leitura. Não testa callable
ou credenciais de produção.

### Revisão de intenção após os testes

Capturar também index antes do primeiro await, como IDs/tokens/tipo. A entrada
interna mutável não pode transformar uma unidade já validada numa faixa negativa
ou outro recurso durante uma espera. Acrescentar cenário de mutação após a
primeira leitura metadata; manter o resultado vinculado à intenção original.

## Resultado dirigido

64 Node positivos (384,1752 ms), com vetor da fonte anterior, e três SDK reais
positivos (8.166,2951 ms na versão final). Antes: 55 e depois 63 Node positivos,
mais primeira seleção SDK de três (8.013,3991 ms). As seleções se sobrepõem.
[ADR 0171](../../../decisions/0171-adventure-backup-structure-read.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-leitura-da-estrutura-de-aventuras.md).
A revisão congelou índice além dos demais primitivos antes de awaits.
P2 completo continua aberto; não houve novo transporte/arquivo/Rule ou frontend.
