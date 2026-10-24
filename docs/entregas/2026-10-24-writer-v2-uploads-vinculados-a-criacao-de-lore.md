# Writer V2 — Uploads vinculados à criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [90 / criação L2](../tasks/writer-v2/execucao/90-uploads-vinculados-a-criacao-de-lore.md).
- **Decisão**: [ADR 0105](../decisions/0105-native-creation-field-uploads.md).

## Objetivo e implementação

Preparar campos/páginas de uma nova ficha sem inventar uma cabeça ou inspeção
de origem existente, com cancelamento completo dos uploads antes de habilitá-los.
A ficha continua ausente; composição/ativação L3 ainda são necessárias.

Campos de criação usam reserva/livro/loreId/nascimentos nativos e um binding
imutável criado junto do job/lease/estado SHA. inventoryVersion 2 distingue
a origem nova, mantendo v1 para campos existentes. Parser/Merkle/SHA/selo/
recibos são reutilizados; texto literal, BOM e páginas ordenadas permanecem.

Com filhos, cancel fecha a reserva por intenção/prova/journal nativos antes
de limpar. Novas unidades e leitura selada perdem autoridade imediatamente;
recibos antigos continuam confirmáveis como metadata. Cancel vazio e anterior
ao start conservam o contrato de L1.

Advance cancela/limpa um filho por unidade, junto do checkpoint/recibo do pai.
Até 16 partes, header por último; audita leases/jobs e ausência de conteúdo
inesperado antes do evento terminal. Fences permanecem. Recursos desconhecidos,
controles/partes recriados e filhos reserved sem suporte de L3 ficam preservados
e bloqueiam concluir, sem namespace purge.

O inventário v3 do livro usa o mesmo fluxo. Filhos que fields já encerrou são
confirmados sem nova remoção. Cleanup próprio após revogação/deleting/raiz ausente
não concede leitura de prosa nem autoridade sobre uma raiz recriada.

## Critérios de L2

- [x] Fonte nativa privada sem cabeça/inspeção fictícias.
- [x] Binding/prova, job/lease/estado SHA atômicos antes do primeiro byte.
- [x] Compatibilidade v1 e campos/páginas literais em v2.
- [x] Intenção de cancel bloqueia novas unidades antes da limpeza.
- [x] Journal/CAS/recibos e filhos confirmados na mesma transação.
- [x] 141 partes, lotes limitados, metadata-only e header por último.
- [x] Auditoria/fences, isolamento de outras criações e proteção de recriados.
- [x] Exclusão do livro, revogação, rollback e retomada nativos.
- [x] Testes dirigidos, revisão e documentação.
- [ ] Composição/auditoria/ativação L3 e cleanup de tentativas reserved.
- [ ] Criação no cliente, demais integrações e validate integral de P1.

## Arquivos

Novos bookLoreCreationCancelRequest, Source, Uploads e Cleanup.
Integração de contratos/store/serviço da criação e dos campos. Nenhum endpoint,
Rule, dependência ou pacote novo; os descendentes já são privados.

Novo arquivo Node/helper de uploads de criação e quatro casos SDK.
A reserva vazia, os campos existentes e os compositores/exclusões têm regressões
diretas. Não houve mudança de UI/TypeScript.

## Evidência Node

**294 casos Node distintos positivos**, em rodadas dirigidas:

| Rodada                                       | Resultado real                                                |
| -------------------------------------------- | ------------------------------------------------------------- |
| Novo arquivo, reserva L1 e campos existentes | tests 104, pass 104, fail 0, skipped 0, duration_ms 1298.4099 |
| Dois casos adicionais de escopo/provas órfãs | tests 2, pass 2, fail 0, skipped 0, duration_ms 371.9226      |
| Seis arquivos de edição/exclusão afetados    | tests 186, pass 186, fail 0, skipped 0, duration_ms 6315.795  |
| Capacidade nativa e header sem binding       | tests 2, pass 2, fail 0, skipped 0, duration_ms 297.4917      |

A união é 32 casos novos de L2, 31 de L1, 45 de campos existentes e
186 de reserva/composição/materialização/adoção/exclusões. Sem somar repetições;
não houve uma rodada única dos 294.

Cobrem fonte sem cabeça, texto literal/BOM, relações ordenadas, 141 partes,
cancel antes/durante/depois do selo, revogação/raiz ausente, outro clock/
outra criação, CAS/concorrência/replay, rollback inicial e de cleanup,
provas órfãs e preservação de órfãos desconhecidos.

Contexto, marcador, binding/prova, job, lease, parte, header, intenção, estado
e evento recriados são recusados. DTO copiado/cross-TX não ganha capacidade.
Contadores dos filhos não são somados como um total fictício de conteúdo.

## Evidência SDK

Firestore 1.22.0 com SHA verificado, projeto demo e loopback dedicados:

```text
tests 4
pass 4
fail 0
skipped 0
duration_ms 223087.5621
```

1. Binding/prova/job/lease compartilham nascimento nativo. Fonte não tem cabeça;
   leitura privada selada funciona antes e perde autoridade após cancel.
   Intenção/estado são acoplados; SDK não acessa bindings ou payloads.
2. Campo de 141 partes é preparado/selado e limpo em lotes de até 16,
   preservando header até o fim. Livro fica intacto e ficha continua ausente.
   O teste não lê o corpo grande inteiro numa transação nativa.
3. Falha no checkpoint do pai reverte bytes/lease/job/progresso. Retry realmente
   concorrente avança uma vez; exclusão do livro retoma, limpa e conserva
   recibos históricos sem recriar raiz/ficha.
4. Binding ou parte com dados iguais recriados têm outro nascimento, ficam
   preservados e não são apagados pelo processo original.

Denies esperados usam assertFails. Sem produção, IA ou compras.

## Checks, revisão e limites

Arquitetura e sintaxe dos 217 módulos de Functions passaram. Lint dirigido
apontou dois imports não usados em testes; removidos, e os dois arquivos
afetados passaram na repetição. Os demais passaram inicialmente.

Formatação, links e diff finais conferidos antes do commit. Sem TS/UI novos,
não repetimos tipos/Vitest/build/browser; validate/coverage integrais ficam no
fechamento de P1, conforme a política do operador. CI remota ignorada.

O journal do pai guarda somente metadata; estado SHA técnico do campo é privado
e sai no EOF/cancelamento pelo protocolo existente. Coleta de payload não relê
bytes/proofs dos chunks. SHA/Merkle/selo não substituem autorização atual.

## Pendências

L3 deve congelar seleção de campos/páginas, reservar os uploads para a geração,
ampliar cancelamento de tentativas/filhos reserved, compor/auditar sem base e
ativar cabeça/geração/leases/clock/datas/recibo no mesmo commit. Adoção de criação
deve permanecer sucesso histórico e não admitir cancelamento.

Demais writers/consumidores/backup lógico/indexado, cliente/recuperação e
roteamento de preparações sem marca continuam antes de endpoint/UI.
Campos grandes restantes, certificação/ativação da restauração, capa/personas,
host/roundtrip/validate e fases posteriores permanecem pendentes.
P1/F2-09/Writer V2 continuam abertos. Somente commit local, sem push/PR/deploy.

## Como verificar

functions/test/bookLoreCreationUploads.test.mjs cobre o protocolo Node;
tests/firestore/bookLoreCreationUploads.rules.test.mjs exige emulador demo
dedicado em 127.0.0.1 conforme [testes](../testing.md).
Não há criação exposta na UI nem execução contra livro real.
