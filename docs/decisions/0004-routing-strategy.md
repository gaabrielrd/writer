# ADR 0004: Estratégia de Roteamento

## Contexto

Projetos web frequentemente requerem navegação entre múltiplas páginas ou visões. Havia uma decisão inicial de manter o template agnóstico e sem roteador padrão para simplificar. No entanto, constatamos que a maioria dos projetos reais precisa rapidamente de um roteador, e a configuração manual atrasa o setup inicial, além de fragmentar padrões de injeção e data loading (loaders/actions).

## Decisão

Decidimos **incluir** um roteador por padrão no template, configurado com as APIs modernas de Data Router (`createBrowserRouter`) no diretório `app/routes/`, com o layout raiz injetando os componentes através do `<Outlet />`.

> **Atualização:** o pacote adotado é `react-router` (v8). A escolha inicial, `react-router-dom` (v7), era um invólucro herdado da v6 e foi substituída — veja o [ADR 0007](0007-runtime-resilience.md). Importe sempre de `react-router`.

## Consequências

- **Positivas:** Temos navegação, deep-linking, e padrões de data loading resolvidos _out-of-the-box_. A estrutura já suporta crescimento orgânico para múltiplas features e páginas. O helper de testes já inclui o roteador.
- **Negativas:** Adicionamos uma dependência pesada de roteamento no bundle base da aplicação, mesmo que o projeto inicial seja de página única. Aumentamos ligeiramente a curva de aprendizado para testar componentes isolados (necessidade do `MemoryRouter`).
