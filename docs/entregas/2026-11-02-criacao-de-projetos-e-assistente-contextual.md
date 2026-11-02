# Criação de projetos e assistente contextual — validação parcial

- **Data**: 2026-11-02
- **Branch**: `codex/criacao-projetos-chat`
- **Base**: `origin/master` em `a89fc385701d07b62d45883270ffc963c53a5c92`, capturada no início da implementação.
- **Plano**: [Criação de projetos e assistente contextual](../tasks/criacao-de-projetos-e-assistente-contextual.md).
- **Estado**: implementação local revisada; fechamento pendente da validação global. Sem commit, push, merge ou deploy.

## Objetivo

Unificar a criação de livros, aventuras e campanhas, começando pela escolha entre IA e manual, e manter a conversa da concepção até as primeiras escritas. Permitir propostas de ações pelos controles do contexto atual, preservando as confirmações normais do site.

## Funcionalidades implementadas

- Fluxo progressivo em `/studio/new`: método, tipo, ideia/contexto e conversa/revisão.
- Universo e persona opcionais antes da primeira geração, com acesso às interfaces existentes de criação/gerenciamento.
- Criação assistida dos três tipos por 2 créditos textuais; criação manual sem débito textual. Capa gerada de livro opcional por mais 5 créditos.
- Proposta inicial pequena e editável, sem criação automática de fichas não revisadas.
- Criação, vínculo de universo, persona, uso de imagem, recibo e débito na mesma transação. Replay continua funcionando após limpeza da sessão, sem recriar nem cobrar novamente.
- Conversa da concepção com sugestões de ações revisáveis, inclusive antes de o projeto existir. Conversar preserva alterações manuais não salvas.
- Continuidade da concepção ao abrir o projeto e navegar para o primeiro editor.
- Assistente contextual para campos, seleções, navegação, ações e diálogos. Ações usam os handlers originais, com confirmação explícita e rejeição de capturas desatualizadas.
- Reautorização do contexto no servidor e isolamento das respostas por conta/projeto. Perguntas próprias são preservadas quando respostas derivadas ficam indisponíveis.

## Critérios de aceite

- [x] Método precede a seleção de Livro/Aventura/Campanha.
- [x] Os seis caminhos de criação funcionam.
- [x] Universo e persona estão disponíveis desde a concepção.
- [x] Detalhes e capa têm apresentação progressiva.
- [x] Conversa pode propor ações durante a concepção e no projeto.
- [x] Jornada de livro chega ao primeiro capítulo e à escrita salva sem repetir a ideia.
- [x] Custos e confirmação são aplicados no servidor, sem débito duplicado.
- [x] Documentação, testes dirigidos, servidor e build conferidos.
- [ ] `npm run validate` integral verde. Os timeouts descritos abaixo impedem declarar este gate concluído.

## Arquivos e contratos

| Área                                                                | Alteração                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/features/project-creation`                                     | Nova experiência progressiva e revisão.                        |
| `src/features/page-assistant`                                       | Catálogo de controles, conversa, prévia e execução confirmada. |
| `functions/src/assistedBook.mjs`                                    | Sessão v2 aditiva e ativação dos três tipos.                   |
| `functions/src/projectCreationContext.mjs`                          | Autorização e identidade nativa de universo/persona.           |
| `functions/src/pageAssistant.mjs` e `pageAssistantCapabilities.mjs` | Proposta contextual e contrato puro compartilhado.             |
| `functions/src/functionDomains.mjs` e `domainServices.mjs`          | Ação no setor de geração, preservando as 30 Functions.         |
| Estúdio, rotas, universos e ai-assistant                            | Composição pelas APIs públicas existentes.                     |
| `e2e/visual`                                                        | Fixtures isoladas e jornadas adaptadas ao novo fluxo.          |

Decisões: [ADR 0271](../decisions/0271-project-creation-and-contextual-assistant.md).
Não foram adicionadas dependências nem alteradas regras do Firestore ou configuração de testes/cobertura.

## Testes e validações aprovados

| Verificação                                                                | Resultado observado                                                                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Frontend dirigido: criação, assistente, bridge, prévia, serviço e Estúdio  | 6 arquivos, 55 testes passando.                                                                     |
| Repetição final de PageAssistant após corrigir seletores de teste          | 4 testes passando.                                                                                  |
| Servidor dirigido de criação/assistente                                    | 39 testes passando.                                                                                 |
| `npm run test:setup`                                                       | 116 testes de scripts e 4.931 testes de Functions passando; sintaxe de 496 módulos conferida.       |
| Chromium: criação, ações em diálogo, primeira escrita e ações da concepção | 18 jornadas passando em desktop claro e mobile sépia após os ajustes finais.                        |
| Matriz visual inicial dos seis caminhos e diálogo contextual               | 42 jornadas passando nos três temas e dois tamanhos antes da extensão final das ações da concepção. |
| Arquitetura, documentação, styleguide, formatação e 37 lotes de lint       | Aprovados nas execuções completas; último ajuste de seletor também conferido por lint dirigido.     |
| `npm run build`                                                            | Typecheck, bundle e smoke test aprovados.                                                           |
| `git diff --check`                                                         | Sem erros.                                                                                          |

Trechos das saídas observadas:

```text
Test Files  6 passed (6)
     Tests  55 passed (55)

18 passed (2.4m)

ℹ tests 116
ℹ pass 116
ℹ fail 0

ℹ tests 4931
ℹ pass 4931
ℹ fail 0

Functions syntax checked: 496 modules
✓ built in 5.35s
Smoke test do bundle OK.
```

## Gate global pendente e achados separados

`npm run validate` **não está verde**. As execuções encontraram timeouts em testes existentes de lore e backup, cujos arquivos não fazem parte do diff desta entrega. Não foi executada uma comparação completa em checkout limpo da base; portanto, este registro não afirma que a falha foi comprovada no baseline.

A primeira execução integral com quatro workers terminou com 377 arquivos passando e seis falhando, com 11 timeouts. Repetições posteriores foram interrompidas após novos timeouts para diagnosticar consumo/concorrência; elas não constituem validação integral aprovada.

Com `NODE_OPTIONS=--max-semi-space-size=64`, o teste de backup de lore acima de 8 MiB passou em 73 segundos dentro de uma execução completa, mantendo seu limite de 120 segundos. Porém, a execução com dois workers apresentou dois timeouts de 5 segundos em `bookLoreVisibilitySelection.test.mjs`. A repetição isolada desse arquivo, com cobertura e um worker, terminou assim:

```text
Test Files  1 failed (1)
     Tests  1 failed | 19 passed (20)
```

O caso restante foi `lost local outcome ACK is flushed without producing the next member or replaying adoption`. A cobertura global atual não foi certificada. A cobertura parcial de uma execução dirigida não substitui esse gate.

Os testes e os limites não foram alterados para encobrir a falha. A correção desses protocolos foi mantida fora do escopo. O commit e o fechamento da entrega ficam pendentes, preservando a implementação revisável na worktree.

## Limitações

- Catálogo limitado a 80 controles visíveis/habilitados por captura, com uma ação confirmada por vez. Nomes dinâmicos são anonimizados antes do provedor; escolhas ambíguas exigem contexto explícito.
- Campos atuais, senhas e conteúdo rico não são capturados automaticamente. Escrita em texto rico segue pelo chat nativo do editor e seu próprio aceite.
- Arquivos e diálogos do sistema operacional exigem seleção humana. Não há execução de código ou RPC arbitrária.
- Conversa contextual fica em RAM; concepção usa a retenção existente de sete dias. Ações antigas não são reexecutadas ao retomar.
- As jornadas de navegador usam fixtures. Qualidade das respostas do provedor real e disponibilidade em produção não foram validadas.
- Sem push, merge ou deploy; o checkout original não recebeu alterações desta implementação.

## Como verificar

1. Abrir `/studio`, selecionar Novo projeto, escolher IA/manual e depois o tipo.
2. Informar a ideia e abrir Universo e persona, se desejado.
3. Na criação assistida, conversar, revisar a proposta e conferir o preço antes de criar.
4. Pedir uma ação como gerar proposta ou ajustar gênero; conferir a prévia e executar explicitamente.
5. Criar o projeto, continuar pelo assistente contextual e usar os controles nativos para começar o conteúdo.
6. Alterar um campo depois de capturar uma sugestão e conferir que a proposta antiga não o sobrescreve.
