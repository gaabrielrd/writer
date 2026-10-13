# W2-F2-04 — Acompanhar estados, metas e retomada

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F2-01](../fase-02-criar-e-preparar/01-projetos-e-navegacao.md), [W2-F2-02](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md)
**Áreas propostas:** books, editor; propostas adventures e campaigns. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Mostrar o próximo trabalho útil ao autor e ao mestre e acompanhar progresso sem confundir estados editoriais com publicação.

## Entradas e resultado

Entradas: estados aprovados, meta, atividade persistida e próxima sessão. Resultado: painel Continuar meu trabalho e progresso verificável.

## Escopo e comportamento

- Definir rascunho/em revisão/pronto conforme contrato; estado editorial não publica nem cria oferta.
- Registrar metas de palavras para escrita e preparação/tarefas de sessão para mestre.
- Usar contagem de texto visível e política aprovada para reescrita, restauração e fuso horário.
- Retomar o último recurso autorizado; item removido retorna ao projeto com aviso.

## Passos de execução

- [ ] Implementar modelo de estados/metas sem modificar status público legado.
- [ ] Persistir atividade por usuário e projeto atrás de serviço.
- [ ] Montar painel de retomada e progresso com estados claros.
- [ ] Validar limites, mudança de período e conflito entre dispositivos.

## Critérios de aceite

- [ ] Autor e mestre têm ação de retomada apropriada ao seu trabalho.
- [ ] Marcar pronto não publica ou revela materiais.
- [ ] Texto de marcação HTML não inflaciona palavras; regra de reescrita é explícita.
- [ ] Meta inexistente ou inválida tem feedback e não bloqueia escrita.

## Validação

- Modelo: contagem, período e restauração.
- Componentes/E2E: retomar livro/campanha, item removido, temas e mobile.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Métricas de produção não devem ser convertidas em ranking público.
- Meta numérica é configurável, sem quota inventada.

## Não escopo

Gamificação pública, notificações agendadas e cobrança por produtividade.
