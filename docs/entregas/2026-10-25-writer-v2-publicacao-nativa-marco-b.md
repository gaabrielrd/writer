# Writer V2 — publicação nativa por inspeção incremental

- Data: 2026-10-25.
- Marco: P1 / M38c11 B.
- Plano: [130](../tasks/writer-v2/execucao/130-publicacao-com-lore-nativo.md).
- Decisão: [ADR 0150](../decisions/0150-native-book-publication.md).

## Resultado e alcance

O fluxo nativo do cliente prepara a publicação em unidades de até 64 KiB, sem
o teto de 32 MiB/512 partes do caminho anterior de cópia. Base v1 acima desse
orçamento e override v2 de nome acima de 32 MiB foram publicados nos testes
dirigidos. Nome com whitespace extenso nas extremidades é aparado somente na
projeção pública; o original continua literal. Limites públicos permanecem
200 caracteres no nome, 20 aliases de 200 e 140 caracteres no resumo.

A inspeção existente recebe publicationHash opcional. Cada avanço compara os
quatro campos públicos com um candidato fechado fornecido em RAM. O checkpoint
guarda sintaxe, SHA incremental e posições/contagens; não guarda o candidato,
detalhes ou notas. Overrides v2 são verificados uma parte por transação antes
da base; campos da base substituídos não entram na comparação. A base continua
inteiramente validada por parser/SHA, mesmo quando contém campos privados.

O certificado ready vincula o hash exato do candidato ao contexto nativo.
StageBookPublicationLore reautoriza a fonte original, prova do livro/universo,
header, token e consentimento, e copia somente esses valores certificados.
Certificado metadata antigo não concede essa capacidade. Não há releitura de
chunks durante a cópia certificada, nem grant para ler corpos por esse hash.

ID determinístico por UID/origem/candidato permite retomar a inspeção após
resposta perdida. Recibos/CAS, fence, cancelamento e inventário de exclusão são
os existentes: nenhum documento filho, namespace ou journal novo. Exclusão do
livro cancela também o cursor novo e elimina seu checkpoint. Auth original é
conferido em cada await. Nenhum rascunho da publicação é persistido no browser.

## Critérios verificados

- [x] Inline/v1/v2/criação com candidato certificado e cópia sem chunks.
- [x] Fonte v1 >32 MiB e >512 partes, inclusive nome aparável muito grande.
- [x] Override v2 >32 MiB e comparação ignorando valores substituídos da base.
- [x] Unicode, BOM, escapes JSON, whitespace interno e aliases vazios/duplicados.
- [x] Limites públicos, campo ausente, consentimento false e candidato inventado.
- [x] Certificado só de metadata ou de candidato diferente não autoriza cópia.
- [x] Retomada após resposta perdida, retry transacional, corrupção e rollback.
- [x] Origem/clock/certificado recriados ou revogados recusam staging.
- [x] Cancelamento em base/override e limpeza integrada à exclusão do livro.
- [x] Checkpoints privados por Rules, staging invisível e leitura anônima após ativação.
- [x] Auth tardio descartado antes de copiar ficha pública.
- [ ] Validate/cobertura global, rollout e demais requisitos de P1/V2.

## Arquivos

Backend: bookLoreSourceInspection, seus contratos/store e bookLorePublication;
novos bookLorePublicationValidation e bookLorePublicationInspection separam
comparação pura e a unidade nativa de override. Cliente: helper público de lore
BookLorePublicationInspection, DTO de progresso e BookLorePublicationClient.
Testes de publicação Node/SDK e bridge real; plano/ADR/AGENTS/arquitetura/testing
e registro de execução. Sem dependências, Rules ou tela novas.

## Evidência real

**139 testes Node distintos positivos:** lote de 136 nos arquivos
bookLorePublication, bookLoreSourceInspection, bookLoreDeletion e
bookLoreEditTransport; depois, três casos novos de consentimento, ausência e
controles nulos, todos positivos. Publicação soma 65 casos (26 novos de escala/
certificação/lifecycle mais três guardas finais, frente aos 36 do marco A).
Uma parte por tentativa transacional; retry pode reler a mesma parte em outra
tentativa. Estado pequeno verificado durante as fontes grandes.

**98/98 Vitest em três arquivos:** publicationService,
bookLorePublication.integration e bookLoreEditOperation. Incluem 13 jornadas
do publisher/C1/serviços reais com Firestore/Auth/RPC em fixtures, duas novas
para avanço confirmado cuja resposta se perde e troca de Auth durante inspeção.
Teste usa timestamps simulados; não substitui SDK nativo.

**5/5 SDK novos**, Firestore 1.22.0 verificado/demo/loopback. Fonte v1 >32 MiB,
recibo original repetido, checkpoint negado ao SDK proprietário, staging privado
e leitura anônima após ativação; v2/criação com provas nativas; cancelamento;
certificado recriado e origem revogada. Sem falhas/skipped. A execução terminou
em 172608.8344 ms; denegações esperadas das Rules não são falhas.
Runner externo writer-v2-portability-qa/m38c11b-sdk.mjs e log do emulador
m38c11b-sdk-emulator.log; resultados de teste observados na saída do runner.

Typecheck/build/smoke positivos: 2981 módulos, com avisos já conhecidos de
chunks/imports dinâmicos. Lint dirigido positivo. Formato, docs, arquitetura,
sintaxe/diff e hooks conferidos no fechamento local.

A primeira checagem de tipos recusou String.isWellFormed no alvo do cliente;
substituída pela verificação Unicode compatível, sem mudar tsconfig.
Lint removeu casts redundantes. Um teste de retry somava duas tentativas como
uma transação; corrigida a medição sem ampliar o limite por tentativa.
Dois caminhos .ts inexistentes em lotes iniciais foram corrigidos para o arquivo
.mjs existente, incluído no lote final de 98. Nenhuma regra suprimida.

## Limitações e continuidade

Captura inicial C1 no cliente continua integral, autorizada e em RAM; custo é
linear no texto, sem limite artificial de autoria. A preparação envolve várias
chamadas e não promete duração fixa. A chamada antiga sem certificado continua
compatível e limitada ao orçamento do marco A; o cliente novo sempre prepara
o certificado, sem fallback após erro. Sem retomada automática do staging público
inteiro; uma nova tentativa pode deixar revisão anterior invisível para cleanup.

O escopo técnico do plano 130 está implementado e validado localmente. Isso não
encerra toda a etapa 4 nem P1/F2-09/V2: demais consumidores, inventário de writers/
namespaces/exclusão, backup/restauração/drain/rollout/validate e fases 3–5 seguem
necessários. Gates humanos/comerciais permanecem pendentes.

Validate integral fica no fechamento de P1 conforme orientação do operador.
Sem browser/CI/push/PR/merge/deploy, provedor pago ou operação em produção.
Functions/Rules do marco A e contratos novos ainda exigem entrega coordenada
futura; o dev server Vite sozinho não altera o backend remoto. Master preservada.
