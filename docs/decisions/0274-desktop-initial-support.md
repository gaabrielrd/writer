# ADR 0274 — Suporte inicial em desktop

Data: 2026-11-03. Estado: aceita por decisão do operador.

## Contexto

O foco inicial do produto passa a ser a experiência desktop. Os contratos
anteriores exigiam celular/tablet e 320 px, e a matriz visual repetia todos os
casos em emulação mobile nos três temas.

## Decisão

Adotar desktop/laptop como plataforma inicial, inclusive na leitura pública.
Retirar mobile/tablet dos critérios de suporte e aceite desta fase. Preservar
implementação responsiva e arquivos/casos de teste existentes. Manter os três
temas, acessibilidade, teclado e segurança.

Executar apenas os três projetos desktop da configuração visual por padrão,
inclusive nos consumidores CI e deploy. Permitir emulação mobile somente por
`WRITER_VISUAL_MOBILE=1`. Preservar etapas estreitas embutidas em testes
funcionais compartilhados para evitar perda de cobertura de seus fluxos.

## Consequências

Mobile deixa de ser gate inicial, sem prazo de retomada. Evidências anteriores
continuam históricas. O acesso por dispositivo não é bloqueado. Descoberta de
testes não comprova comportamento nem suporte a outros navegadores.

Política vigente: [direção de suporte](../platform-support.md).
Comandos e limitações: [testes](../testing.md#plataformas-na-execução-automatizada).
