# W2-F2-04 — Acompanhar estados, metas e retomada

**Estado:** Implementado; gates locais verdes, Git e CI do novo SHA pendentes.
**Dependências:** [W2-F2-01](../fase-02-criar-e-preparar/01-projetos-e-navegacao.md), [W2-F2-02](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md)
**Áreas propostas:** books, editor; propostas adventures e campaigns. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Mostrar o próximo trabalho útil ao autor e ao mestre e acompanhar progresso sem confundir estados editoriais com publicação.

## Entradas e resultado

Entradas: estados aprovados, meta total, checklist privado e atividade persistida. Resultado: painel Continuar meu trabalho e progresso verificável.

## Decisões confirmadas pelo operador

- Medir o tamanho atual do manuscrito, com meta total por projeto. Reescrita, remoção e restauração ajustam o total; não acumular produção diária.
- Preparação do mestre por checklist privado do projeto, com conclusão, reabertura e retomada; sessões continuam na entrega própria.
- Fuso configurável por usuário, inicialmente o do dispositivo. Outro dispositivo não substitui uma preferência já salva; a meta total não reinicia por período.

## Escopo e comportamento

- Definir rascunho/em revisão/pronto conforme contrato; estado editorial não publica nem cria oferta.
- Registrar metas de palavras para escrita e preparação/tarefas de sessão para mestre.
- Usar contagem de texto visível e política aprovada para reescrita, restauração e fuso horário.
- Retomar o último recurso autorizado; item removido retorna ao projeto com aviso.

## Passos de execução

O [contrato executável](../execucao/10-estados-metas-e-retomada.md) fecha estados,
contagem canônica, preparação retomável, APIs privadas e integrações deste incremento.

- [x] Implementar modelo de estados/metas sem modificar status público legado.
- [x] Persistir atividade por usuário e projeto atrás de serviço.
- [x] Montar painel de retomada e progresso com estados claros.
- [x] Validar limites, mudança de período e conflito entre dispositivos.

## Critérios de aceite

- [x] Autor e mestre têm ação de retomada apropriada ao seu trabalho.
- [x] Marcar pronto não publica ou revela materiais.
- [x] Texto de marcação HTML não inflaciona palavras; regra de reescrita é explícita.
- [x] Meta inexistente ou inválida tem feedback e não bloqueia escrita.

## Validação

- Modelo: contagem, período e restauração.
- Componentes/E2E: retomar livro/campanha, item removido, temas e mobile.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

Validate local: 151 arquivos/1.361 testes frontend, 77 scripts e 220 Functions;
SDK real 83/83; Chromium 90/90 nos seis projetos, sem retries/skips/flaky, teclado
e 320 px. Produção local: seis passaram e um skip preexistente Windows. Git e CI
do novo incremento ainda condicionam a conclusão técnica. Ver
[entrega](../../../entregas/2026-10-15-writer-v2-progresso.md).

## Riscos e decisões necessárias

- Métricas de produção não devem ser convertidas em ranking público.
- Meta numérica é configurável, sem quota inventada.

## Não escopo

Gamificação pública, notificações agendadas e cobrança por produtividade.
