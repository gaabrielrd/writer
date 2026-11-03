# Direção de suporte a plataformas

Decisão do operador em 2026-11-03: concentrar a experiência inicial do Writer em
**desktop/laptop**. Celulares e tablets saem da lista de suporte desta fase,
inclusive para leitura pública. Não há data definida para retomar esse suporte.

## Critérios de produto e aceite

Novas funcionalidades, correções e pilotos priorizam uso em computadores, com
mouse e teclado. Claro, Escuro, Sépia, foco visível, navegação por teclado,
rótulos, contraste e estados de dados continuam nos critérios de qualidade.
A adaptação a janelas de desktop continua relevante.

Esta decisão substitui os requisitos anteriores de mobile/tablet e de largura
mínima de 320 px nos planos e contratos, inclusive Writer V2 e primeiro acesso.
Descrições de comportamento existente e evidências datadas permanecem históricas.
CSS responsivo, componentes, arquivos e asserções de teste são preservados; esta
mudança não bloqueia o acesso por dispositivo nem cria uma tela de incompatibilidade.

## Automação

`playwright.visual.config.ts` usa somente os três projetos desktop por padrão.
CI e publicação de Hosting herdam essa seleção. `WRITER_VISUAL_MOBILE=1` permite
reativar explicitamente os projetos mobile para investigação, sem reinseri-los
no suporte inicial. Comandos em [testes](testing.md#plataformas-na-execução-automatizada).

O E2E de produção já usa somente desktop. Testes funcionais mistos que reduzem
a viewport durante o caso são preservados e continuam executando. Portanto,
esta mudança remove a matriz mobile padrão, não toda etapa de tela estreita.
Unidade, componentes, segurança, cobertura e os três temas mantêm seus gates.

A automação atual usa Chromium. A lista de navegadores do PRD não equivale a
validação em Firefox/Safari; a mudança de plataforma não amplia essa evidência.

Decisão registrada na [ADR 0274](decisions/0274-desktop-initial-support.md).
