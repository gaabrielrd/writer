# Sincronização das melhorias de lore e publicação do Hosting

- **Data:** 2026-11-05
- **Branch:** `master`
- **Origem:** solicitação de sincronizar o remoto, registrar as mudanças locais e publicar Hosting; autorização adicional para `loreApi` se necessária.

## Integração

A branch local avançou de `b666233` para `5ff30b8` por fast-forward, incorporando
14 commits. As mudanças locais, inclusive arquivos novos, foram guardadas em
stash antes da atualização e reaplicadas depois. Seis conflitos de interface
foram conciliados, preservando a anatomia de página e o assistente inicialmente
minimizado do remoto, com os ajustes locais de foco e posição nos modais.

O conjunto versiona a listagem leve do lore de livros, a navegação lateral dos
campos da ficha, ajustes do assistente e a análise paralela da importação de
universos, além das evidências locais anteriores. A navegação dos campos foi
adaptada ao `Tabs` compartilhado após o novo guardrail do remoto recusar a
implementação própria. As jornadas do compêndio passaram a conferir também o
inspetor de resumos antes de abrir a ficha completa.

Durante o fechamento surgiram arquivos de Impeccable e alterações de emuladores
em outra atividade no mesmo checkout. Eles foram preservados fora destes commits;
o artefato publicado já estava congelado antes dessas alterações.

## Validação executada

- Node `24.21.0`, npm `10.6.0`.
- `npm run validate`: skills, arquitetura, documentação, styleguide/anatomia,
  formatação e os 38 grupos de lint aprovados. A etapa de cobertura parou por
  um lock abandonado do PID 452336. A ausência desse processo foi conferida
  antes de remover somente seu lock temporário e retomar as etapas restantes.
- Cobertura completa: 5.254 testes passaram e dois falharam em asserções que
  antecediam atualizações assíncronas das páginas de livro/aventura. As esperas
  foram corrigidas sem alterar o produto ou remover expectativas; os 42 testes
  desses dois arquivos passaram na reconferência.
- Limites de cobertura atingidos: statements 89,4%, branches 85,69%, functions
  90,11% e lines 92,55%.
- Reconferência completa do frontend sem instrumentação: **396 arquivos e
  5.256 testes aprovados**, em 719,16 segundos.
- Scripts: 119 testes aprovados. Functions: 4.957 testes aprovados; sintaxe de
  497 módulos conferida.
- `npm run build`: typecheck, bundle de produção e smoke aprovados.
- Chromium de produção: sete cenários aprovados. Referência Windows do
  styleguide regenerada para a anatomia de página incorporada e inspecionada.
- Chromium dirigido: 18 cenários de lore/formulários/compositor aprovados,
  mais três de posição, foco e movimento do assistente reconferidos após
  aguardar sua medição inicial. Três temas desktop; dados/serviços fictícios.

O comando agregado `validate` não foi repetido integralmente após essas
correções: a validação foi concluída por etapas e reconferências descritas acima.
Os logs locais ficam em `.firebase/sync-*.log`, ignorados pelo Git.

## Publicação e limites

O pacote da `loreApi` em produção foi baixado pela geração Storage fixada
`1793647719435667`. O arquivo implantado não continha `readSummaries`, confirmando
a necessidade de publicar essa Function antes do novo frontend. As 30 Functions
consultadas estavam ACTIVE em Node 24.

A publicação autorizada limita-se a `loreApi` e Hosting. O ganho paralelo de
`universeImportAnalysisApi` fica versionado, mas seu rollout não faz parte desta
publicação. Rules, índices, Storage e outras Functions têm implantação própria.

O Hosting foi publicado com Firebase CLI `15.33.0`, configuração exclusiva do
site `writer-44cd5`, bundle congelado, marcador do commit e manifesto SHA-256.
Conferência de arquivos, rotas SPA e Chromium anônimo ficam separadas da
verificação autenticada real, que não foi executada nesta entrega.

### Conferência da publicação

- Código/bundle: `c24e0a28bcd41210cd1b385f5e0512b2660d724e`.
- `loreApi` ACTIVE em `nodejs24`, hash de implantação
  `c8c934e0d94841dc732d736a94efabf50d1d61e3`. As outras 29 Functions conservaram
  seus hashes. Os dois módulos alterados da leitura foram comparados com o
  pacote implantado da geração Storage `1793915052009950` e coincidiram.
- Canal live: release `1793915288748000`, versão `9ecd290be51cbbc1`, FINALIZED,
  publicada às 18:48 de 2026-11-05, no fuso America/Sao_Paulo.
- Os 17 arquivos do artefato servidos coincidiram por SHA-256 com o manifesto.
- Seis rotas SPA retornaram HTTP 200 com o mesmo index: `/studio`,
  `/studio/projects`, `/studio/import`, `/studio/operations`,
  `/books/new/assisted` e `/styleguide`.
- Chromium anônimo: HTTP 200, título Writer Assistant e nenhum `pageerror`.
  Captura da página inicial inspecionada; login e operações autenticadas não
  foram exercitados.

Configuração, bundle, manifesto, conferência por arquivo, canal live e captura
ficam em `.firebase/hosting-sync-2026-11-05/`, ignorado pelo Git.

## Achados anteriores fora do escopo

O Hosting remoto da base `5ff30b8` já havia falhado na execução
[42101728640](https://github.com/gaabrielrd/writer/actions/runs/42101728640),
incluindo a referência Linux antiga do styleguide, de 1280 × 3078 px, frente ao
catálogo novo de 1280 × 3683 px. A CI anterior também tinha falhas de jornadas
visuais. A referência Windows revisada nesta sessão não substitui a referência
Linux nem comprova aprovação da CI remota. Esses achados permanecem separados
da conferência do artefato publicado.
