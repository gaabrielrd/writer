# Writer V2 — Lore e personas no backup (P1 M6)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2; desenvolvimento em commit local.
- **Plano:** [contrato 39](../tasks/writer-v2/execucao/39-lore-e-personas-no-backup.md).
- **Decisão:** [ADR 0050](../decisions/0050-book-lore-and-personas.md).
- **Estado:** marco interno com checks dirigidos; P1/F2-09 continuam abertos.

## Comportamento entregue

- [x] Capturar lore próprio com texto exato, aliases, estrutura, relações e datas presentes.
- [x] Descartar labels/available globais e campos desconhecidos sem consultar universo.
- [x] Capturar perfis usados pelo livro, capítulos e originais de conversão.
- [x] Preservar presets e perfis arquivados ainda referenciados.
- [x] Não ler biblioteca inteira ou personas alheias/não usadas.
- [x] Detectar edição/recriação de perfil mesmo com raiz do livro imóvel.
- [x] Percorrer mais de 100 proprietários, incluindo vínculos ausentes, sem truncar.
- [x] Revalidar prova antes do selo, sem copiar tokens/UID/credenciais.
- [ ] Pacote integral, sink persistente e restauração P1 completos.

Lore é o décimo segundo tipo do protocolo interno M5. Duas callables novas
leem vínculos/perfis; produtor cliente guarda uma página e um item, aguarda sink
e reenumera a prova. Perfis repetidos são emitidos por vínculo para evitar Set
ilimitado; deduplicação semântica fica para o schema/restaurador integral.

Arquivos: projeção/leitor/testes de recursos M5, bookBackupPersonas puro,
bookBackupPersonaRead, dispatcher/check Functions, bookPersonaCapture/Callables,
interface pública e testes cliente/SDK. Sem dependências, Rules ou coleções novas.

## Resultados e correções reais

Functions inicialmente **17/18**: o teste antigo ainda tratava lore como tipo
desconhecido. Atualizado para campaign-lore, conservando a asserção de rejeição.
Lote seguinte **18/18**, 145 ms. Dois casos adicionais conferem ausência legada,
escopo externo e alteração nativa de lore sem clock Admin; final **20/20**,
138 ms, sem skips/falhas/cancelamentos.

Cliente primeiro **24/24** em personas/recursos, 1,53 s. Acrescentados transporte
padrão e IDs repetidos/descendentes: **30/30** em três arquivos, 1,59 s.
Inclui 107 proprietários, perfis repetidos/ausentes, corrupção de hash/envelope,
campos privados inesperados, prova malformada, pressão do sink, abort e falha
de transporte sem retry. Lint detectou quatro usos any inferidos nos mocks:
anotações explícitas corrigidas, sem mudança de comportamento.

SDK novo primeiro **5/6**: o cenário assumia exclusão de persona pelo cliente,
mas a Rules vigente a proíbe. Corrigido para exigir permission-denied do SDK
e usar Admin na recriação. Repetição somente desse cenário **1/1**, 2,65 s.
Os seis cenários têm evidência positiva composta, sem afirmar um lote 6/6.
A família M5 afetada passou separadamente **6/6**, 7,72 s.
SDK confirma edição válida de perfil com raiz imóvel, encarnação diferente na
recriação, namespace próprio, máscaras/timestamps reais e writer de lore
atômico com localLoreVersion. Nenhuma Rules relaxada.

Chromium com Firestore real no emulador: **11 cenários em um probe**, 19,62 s,
155 registros M2 e arquivo de fixture de 874.105 bytes. Contém 58 versões,
216.003 bytes históricos/61 partes (máximo 65.536), um lore próprio multipartes,
todos os tipos M5 e três perfis por vínculo (livro/capítulo/fonte).
Confere prosa Unicode/BOM, ordem B, referências neutras, versão removida,
hash/catálogo/abort, mutação nativa de filho e edição/recriação de persona
externa sem mudança na raiz. Prova antiga impede selo. Zero runtime errors
e zero requisições externas bloqueadas.

## Checks e revisão

Build/typecheck/bundle/smoke passaram. Lint dirigido após correção,
arquitetura e sintaxe Functions passaram. Formato, links e diff conferidos
antes do commit, com hooks normais. Avisos conhecidos de chunks grandes e
imports estáticos/dinâmicos de workHistoryCallables/exportDocx permanecem.
Dependências não mudaram; auditoria M4 com três achados moderados preexistentes
continua registrada, sem nova auditoria nem alegação de audit verde.

Revisão conferiu seleção por vínculo, ausência de Set/catálogo ilimitados,
token externo nativo, isolamento, projeções fechadas, cancelamento e soma de
contagens. Validate completo fica para fechar P1, conforme orientação do operador.
Nenhuma CI acompanhada/disparada, push, alteração de PR, merge ou deploy.

## Limites e próximos passos

Transporte HTTP do probe fixa UID de teste; autorização é prova SDK distinta,
sem alegar Auth/App Check produtivos. Fixture acumula frames/Blob pequenos para
asserções e não prova memória do sink final, disco, UI/temas ou restauração.
Projeção fonte preserva dados; o schema semântico integral ainda não foi entregue.
JSON v1–v6 continuam inalterados.

Faltam vínculo de universo com autorização/encarnação, rascunho explícito,
mídia autorizada, schema/leitor legado, arquivo persistente, revisão,
preparação/remapeamento/ativação/cleanup e recuperação. Nenhuma tarefa ampla
adicional da V2 concluída por este marco.
