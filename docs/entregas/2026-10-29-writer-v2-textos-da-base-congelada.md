# Writer V2 — itens e textos da base congelada

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 206](../tasks/writer-v2/execucao/206-itens-e-textos-da-base-congelada.md);
  P3/D/F2-09 e macro 8/35 permanecem abertos.
- Decisão: [ADR 0236](../decisions/0236-campaign-backup-frozen-fields.md).
- Somente commit local, sem CI/push/PR/merge/deploy.

## Implementado

- Listagem de itens com 25 resultados, lookahead, cursor vinculado e prova nativa.
  Arquivados e indisponíveis não somem da listagem.
- Cabeçalho lógico para partes, cenas, blocos, arcos, marcos, eventos e lore,
  com hierarquia, campos/ausências, ordem e imagens lógicas preservados.
- Gate individual de ficha global/local e encarnação, sem leitura de prosa live.
  Revogada/recriada não revela texto/nome/hash antigo; relação indisponível
  conserva somente a chave lógica e o estado.
- Leitura por campo/índice determinístico, metadata antes de content, prova
  nativa e limite de 65.536 bytes; vazio/BOM/Unicode/espaços literais.
- Principal compartilha content somente da própria cena, com manifesto idêntico.
- Fluxo público da feature campaign-portability com API injetada, SHA/tamanho
  integrais, backpressure, guard, abort e descarte de resposta tardia.

## Testes e validações

- Node: 20 testes novos do leitor e 11 regressões do leitor existente passaram,
  31/31, saída 0, 586,6612 ms. A definição compartilhada preservou o leitor antigo.
  Após reforçar deleted false no gate local, os 20 testes novos foram conferidos
  novamente: 20/20, saída 0, 615,3433 ms. A revisão também explicitou baseId
  no cursor e conferiu a identidade nativa da query; 20/20 passaram de novo,
  saída 0, 542,5901 ms.
- Vitest dirigido: 29/29 passaram, saída 0; duração 3,68 s (404 ms de testes).
  Captura real e readers reais são usados via API injetada, com adulteração de
  envelope/texto, diferenças de bytes, pedidos desprendidos e interrupções.
- Typecheck e lint inicial: tipos passaram; lint apontou sete assertions
  redundantes, removidas com fix dirigido. Lint final dos arquivos afetados e
  check:architecture passaram, saída 0.
- Testes iniciais do fixture recusaram envelope com schemaVersion adicional e
  projeção de image null por folhas. Corrigidos o pedido do fixture e a máscara
  lógica image, preservando DTO fechado. O teste de SHA multichunk passou a
  adulterar ASCII válido, pois a primeira adulteração era recusada antes por
  UTF-8 inválido. Nenhum limiar ou gate foi reduzido.
- Typecheck final independente: saída 0. Check:docs: saída 0. Formatação
  dirigida aplicada e diff sem erro. Revisão conferiu scope, provas nativas,
  DTOs fechados, gates antes de prosa, erros/interrupções e ausência de nova
  persistência. Nenhum achado bloqueador pendente.

## Revisão e limites

Leitores são privados, sem ligação de HTTP/UI. Não foram criados novos recursos
persistentes, permissões, dependências ou segredos. Mantidos próprios separados
de conteúdo derivado. Prova de campo não é arquivo/manifesto integral nem
procedência portátil. O inventário físico e a validação servidor completa
continuam obrigatórios, inclusive corpos órfãos, vínculos, imagens, variantes
e legadas; depois vêm arquivo/restauração/UI/ciclo.

Não rodou npm run validate neste incremento: por orientação do operador, a suíte
integral fica no fechamento de grandes blocos. O resultado anterior de P2 não é
atribuído a este código P3. Emulador/produção, credenciais reais, pilotos humanos
e condições comerciais não foram verificados aqui.
