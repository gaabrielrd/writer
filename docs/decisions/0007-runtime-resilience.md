# ADR 0007 — Resiliência em tempo de execução

## Contexto

Três pontos deixavam a aplicação falhar de forma silenciosa ou confusa:

- O `ErrorBoundary` envolvia apenas o `<Outlet />`. Um erro no header ou no layout escapava e resultava em tela branca, e o `errorElement` do react-router — que cobre exatamente esse caso — não era usado.
- Não havia rota para endereços desconhecidos: qualquer URL fora das rotas conhecidas resultava em tela vazia.
- As variáveis de ambiente eram lidas direto de `import.meta.env`, sem tipo nem validação. Uma variável ausente virava `undefined` e só aparecia muito depois, como um erro sem relação aparente com a causa.

## Decisão

- Registrar `errorElement` na rota raiz, cobrindo falhas do layout e das rotas filhas. O `ErrorBoundary` foi removido de `App` para não sombrear esse mecanismo; ele permanece em `shared/components` para isolar widgets arriscados dentro de uma página.
- Adicionar uma rota curinga (`path: '*'`) que renderiza a tela de "página não encontrada" **dentro** do layout.
- Separar `routes` do `router` em `app/routes`, permitindo montar a mesma árvore com `createMemoryRouter` nos testes.
- Concentrar a leitura de ambiente em `shared/config/env.ts`: tipagem em `ImportMetaEnv`, validação no boot e mensagem que nomeia a variável a corrigir. `createEnv` é exportado à parte para ser testado sem depender do ambiente real.
- Migrar de `react-router-dom` para `react-router` v8. O pacote `react-router-dom` era um invólucro herdado da v6 e sua última versão carregava um aviso de segurança de alta severidade; a migração custou quatro linhas de import.

## Consequências

- **Positivas:** nenhuma falha de rota, endereço inválido ou configuração ausente resulta em tela branca. `npm audit` volta a zero. A composição passa a ter smoke test.
- **Negativas:** a árvore de rotas ficou um pouco mais verbosa, e quem adicionar rotas precisa lembrar que a curinga deve continuar por último. Projetos que já importavam de `react-router-dom` precisam trocar o especificador.
