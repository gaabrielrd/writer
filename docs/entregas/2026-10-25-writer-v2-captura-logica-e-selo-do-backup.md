# Writer V2 — captura lógica do lore até o selo do backup

- Data: 2026-10-25.
- Marco: P1 / M38c12 C3.
- Plano: [131](../tasks/writer-v2/execucao/131-backup-logico-indexado-do-lore.md), aberto para D.
- Decisão: [ADR 0151](../decisions/0151-incremental-portable-lore-index.md).

## Resultado e alcance

O arquivo completo usa writePortable C1 para lore inline/v1/v2/criação nativa.
Os demais recursos conservam o produtor atual. O ramo físico de lore recusa
payloadStorage, sem fallback para serializar um stub como conteúdo completo.

A prova privada de recursos guarda apenas loreDigest, um hash encadeado de
ID/token C1 v1 por ficha. A conferência final recompõe esse digest por metadata,
além de conferir os tokens nativos de itens/pais/coleção/livro existentes.
Não guarda catálogo integral de fichas/provas nem inclui tokens no arquivo.
PortableMetadata força v1 mesmo quando o cliente do editor usa v2.

O stream compartilha um port de lore entre captura e conferência. O adaptador
padrão resolve a feature pela API pública no primeiro uso, fixa uma sessão/actor
SDK exato e conserva o guard. Import/construção não abrem essa sessão. O produtor
standalone mantém o vínculo do port à sua prova por WeakMap em RAM.
Port injetado e isCurrent/signal do host continuam disponíveis.

Guarda de ator cobre leituras/escritas posteriores, retorno do encoder, escrita
do selo e resposta após close. Troca durante a escrita do selo aborta antes de
confirmar o destino. Troca durante close não devolve sucesso; um close já
confirmado pode ter gravado o arquivo e não pode ser desfeito pelo abort.
O adaptador preserva o arquivo confirmado anteriormente quando aborta a escrita
temporária antes do commit, comprovado no Chromium.

C3 conecta captura ao arquivo/selo e à validação C2. D ainda deve consumir o
ponteiro grande, remapear e materializar por unidades. Não é entrega da UI final,
restauração grande completa, rollout ou ativação de P1.

## Critérios verificados

- [x] Lore lógico completo em arquivo selado: inline/v1/v2/criação.
- [x] Fonte >8 MiB, base/overrides/deleções, datas ausentes e relações literais.
- [x] Uma leitura de cada unidade nativa por captura e conferência final sem prosa.
- [x] Prova pequena por digest, tokens físicos fora do arquivo, sem catálogo em RAM.
- [x] Mudança de token C1 detectada mesmo com tokens genéricos de recursos iguais.
- [x] Mutação do objeto de prova durante I/O não muda a expectativa congelada.
- [x] Conta/ator original, erro, abort e pressão do destino impedem confirmação.
- [x] Janela de ator durante selo/close coberta, com limite do commit explícito.
- [x] Arquivo capturado real passa upload/integridade/validação servidor.
- [x] Captura incompleta é rejeitada pelo servidor sem criar raiz restaurada.
- [ ] Leitor/remap/materialização grandes e roundtrip: D.
- [ ] Inventários/legacy/drain/rollout/validate de P1, fases/gates e UI final.

## Evidência real

**27/27 Node**, lote final dirigido: 12 de BookBackupResourceRead (um novo bloqueio
de stub) e 15 de BookLoreContentValidation, também conferindo a extração do helper
de upload dos bytes selados. Namespaces, origem, cleanup e raiz ausente preservados.

**75 Vitest distintos positivos em seis arquivos**: 27 produtor C1, 13 bridge do
arquivo, 17 recursos, três port adiado, dez stream/sink e cinco recordCaptureStream.
Lote inicial final de seis arquivos: 72/72. A revisão acrescentou duas regressões
de selo/close, confirmadas vermelhas sem a guarda; após corrigir, os dois arquivos
afetados passaram 22/22. Um caso adicional de base/overrides/deleções levou o
bridge a 13/13. Não é alegação de um lote único de 75.

O bridge usa C1 e serviços de produção com stamps nativos simulados. Captura
grande → bytes selados exatos → upload/integridade/validação servidor, e captura
sem selo → rejeição durável. Não ativa/restaura a cópia. Histórico do fixture é
deliberadamente vazio, com source/list conferidos pelos serviços reais.

**Três SDK distintos positivos**, emulador Firestore 1.22.0 verificado/demo/loopback,
Admin e serviços reais, cliente/orquestrador compilados em memória.
Primeiro lote de dois: arquivo >8 MiB até validação servidor e clock alterado
antes do selo, 131284.8946 ms. Após corrigir a guarda tardia, somente o caso de
clock e a nova regressão de ator em selo/close foram executados: 2/2, zero skipped,
17003.4729 ms. O caso grande é evidência da rodada anterior; seus bytes/protocolo
de dados não mudaram. Cinco casos SDK anteriores do produtor não foram repetidos.
Sem login/Callable/Auth/App Check ou operação em produção.

**Cinco jornadas Chromium reais**, port C1/serviços de produção em memória,
arquivo OPFS e índice cifrado reais, só loopback, sem Buffer:

1. Base v2 grande/overrides/deleções → arquivo de 10184266 bytes/164 registros,
   163 unidades nativas distintas, selo e validador público positivos. Ausências
   e texto substituído conferidos no arquivo; índice temporário limpo.
2. Ator substituído pelo mesmo UID depois do lore: abort preserva arquivo anterior.
3. Pressão no destino impede novas leituras; abort preserva arquivo anterior.
4. Troca durante escrita do selo: abort antes do commit e arquivo anterior intacto.
5. Troca após close confirmado: erro sem sucesso, arquivo novo permanece gravado.
   Cinco jornadas repetidas após a correção e com a base/overrides/deleções.
   Não é piloto, login real ou UX final de backup/restauração.

Build/typecheck/smoke finais positivos: **2990 módulos**. Avisos de chunks/imports
dinâmicos permanecem; o novo import público adiado de lore não divide bundle
porque essa feature já é importada estaticamente na aplicação.
Lint/sintaxe/formato/docs/arquitetura/diff e hooks conferidos no fechamento.
Validate/coverage globais ficam para o fechamento de P1 conforme orientação.
Sem CI/push/PR/merge/deploy, Rule, endpoint, dependência ou namespace novos.

## Ajustes e revisão

Fixtures corrigidos sem relaxar o produto: Uint8Array da mesma instância jsdom
em vez de Buffer; datas v2 fora dos descritores de campos; tipo literal do mock.
A primeira execução SDK nem iniciou casos por sintaxe da configuração de
imports externos; corrigida e conferida por node --check antes do novo lote.
A revisão encontrou a janela real durante selo/close; os dois testes reproduziram
sucesso indevido antes da correção e rejeição depois dela.

Origem e expectativa de digest ficam congeladas antes de await. Leituras/
escritas seguintes guardam o ator. Dados lógicos e tokens opacos continuam
separados; reautorização metadata não certifica de novo todos os corpos.

Scripts/logs externos writer-v2-portability-qa/m38c12c3-sdk.mjs,
m38c12c3-sdk-retake.mjs, logs correspondentes e m38c12c3-browser.mjs.
Os testes permanentes compilam o código atual e não dependem desses artefatos.

## Continuidade obrigatória

A/B/C estão integrados e validados neste plano. Próximo é D: leitor interno
verificado por spans, remapeamento de relações/IDs, materialização de campos/
páginas grandes e crescimento do JSON após remap, com provas originais,
inventário, rollback/retomada e raiz ausente até a ativação completa.

A API integral pequena ainda tem o orçamento anterior; não aumentar esse cap
como substituição de D. Inventário de namespaces/writers/exclusão/coleta,
fontes antigas, roundtrip/drain/rollout e validate de P1/F2-09 continuam.
Plano 131 e Writer V2 abertos; fases 3–5 e gates humanos/comerciais preservados.
Master e dev server preservados. Somente commit local.
