# Personas de escrita por contexto de universo

- **Data**: 2026-11-02
- **Branch**: `codex/personas-contexto-universo`
- **Base**: `master a80dac5`, em worktree nova e isolada
- **Plano de origem**: plano aprovado na conversa; destino master e geração sem débito de créditos do Writer confirmados pelo operador

## Objetivo

Permitir criar uma voz de escrita com IA a partir de um universo próprio e do
lore escolhido, aproveitando a biblioteca e os vínculos existentes da V2.

## Funcionalidades entregues

- **Criar com IA** na biblioteca de personas: escolha de universo, até 25 fichas e intenção opcional, com prévia completa antes de gerar.
- **Revisão editável** no formulário existente: nome, descrição, instruções, oito atributos padrão e até oito próprios; geração não salva nem vincula automaticamente.
- **Aceite explícito e idempotente**: cria perfil privado e recibo na mesma transação, sem débito de créditos ou sobrescrita de perfis. Revisão enviada fica congelada durante confirmação incerta.
- **Contexto autorizado**: o servidor captura conteúdo e identidades nativas, verifica autoria e mudanças antes/depois da geração e no primeiro aceite.
- **Recuperação e descarte**: consulta de pedido incerto sem outra chamada ao modelo; descarte, expiração e coleta limitada de pedidos.
- **Geração da plataforma**: parâmetros públicos congelados por pedido, sem chaves no payload/histórico. Limite de dez gerações por hora; contexto até 65.536 bytes, sem truncamento.
- **Compatibilidade**: perfis novos usam o compilador e esquema atuais; atributos próprios recebem IDs independentes por proposta e preservam composição de base/complemento. Perfis restaurados e vínculos existentes permanecem intactos.

## Critérios de aceite

- [x] Selecionar somente contexto próprio e conferir conteúdo antes da geração.
- [x] Validar saída estruturada, limites, atributos obrigatórios e valor zero.
- [x] Revisar/editar antes do salvamento, sem alterar manuscrito, lore ou vínculos.
- [x] Repetir pedido/aceite sem nova geração ou duplicata; preservar preenchimento em falhas.
- [x] Bloquear fontes removidas, recriadas, alteradas ou de outra conta.
- [x] Bloquear SDK direto nos pedidos e quota; conferir aceite concorrente em transações reais.
- [x] Preservar criação manual, biblioteca, arquivamento, composição e disponibilidade de personas restauradas.
- [x] Validar teclado, foco, persistência, três temas, desktop/celular e 320 px.
- [x] Executar validação completa e revisar o diff sem novas dependências ou segredos.

## Arquivos alterados

| Área                 | Arquivos e finalidade                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Interface e contrato | PersonaGenerationDialog, PersonaManager, Personas.module.css e model/personaGeneration.ts em ai-assistant                         |
| Cliente              | services/personaGenerationService.ts, usando a callable autenticada                                                               |
| Servidor             | functions/src/personaGeneration.mjs e index.mjs: captura, geração, aceite, recuperação e coleta                                   |
| Regras e índice      | firestore.rules e firestore.indexes.json: pedidos server-only e índice de expiração                                               |
| Testes               | novos testes de serviço/interface/backend/regras e jornada visual; entry.test.mjs e seletor de navegação da regressão atualizados |
| Documentação         | ai-personas.md, architecture.md, testing.md, ADR 0271 e regra curta no AGENTS.md                                                  |

## Testes

| Teste                                                               | Cobertura observável                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| functions/test/personaGeneration.test.mjs                           | Autorização, limites, contexto alterado/recriado, falha do provedor, saída inválida, quota, descarte, retomada, aceite e composição sem colisão de atributos |
| PersonaGenerationDialog.test.tsx                                    | Seleção, prévia, revisão sem gravação, edição, resultado incerto, resposta tardia, vazio/erro/retry, revisão congelada e troca de conta                      |
| personaGenerationService.test.ts                                    | IDs/snapshot público enviados pela callable, sem corpo do lore ou credenciais                                                                                |
| persona-generation.rules.test.mjs                                   | Dono/intruso/anônimo, aceite concorrente real sem crédito e coleta sem remover personas                                                                      |
| personas.rules.test.mjs e personaRestoreAvailability.rules.test.mjs | Isolamento, revisões, atributos/vínculos e perfis restaurados protegidos                                                                                     |
| persona-generation.visual.ts                                        | Fluxo completo nos seis projetos de tema/dispositivo, 320 px, zero, edição, salvamento, foco e reload                                                        |
| personas.visual.ts                                                  | Criação manual, slider próprio, arquivamento e composição/contexto existentes                                                                                |

Extratos reais das execuções:

```text
Backend direcionado, personaGeneration.test.mjs:
tests 11
pass 11
fail 0

Cliente/interface direcionados, incluindo PersonaManager.test.tsx:
Test Files  3 passed (3)
Tests  12 passed (12)

Emulador Firestore, três arquivos de personas:
tests 10
pass 10
fail 0

Jornadas visuais repetidas após corrigir a navegação responsiva:
12 passed (1.4m)
```

Os 18 outros cenários visuais de composição/contexto passaram na execução
anterior. A rodada inicial de 30 cenários teve 27 passes e três timeouts na
navegação antiga de celular; a repetição final cobre os 12 cenários afetados,
incluindo as três falhas. Foram atualizados somente o rótulo real do menu e a
abertura da navegação responsiva; nenhuma asserção foi retirada ou snapshot
regenerado. Capturas desktop/celular foram inspecionadas.

## Validações executadas

| Comando/verificação                                 | Resultado                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| npm ci --ignore-scripts e npm ci --prefix functions | Dependências existentes instaladas, sem alteração dos manifests/lockfiles |
| npm run prepare                                     | Hooks normais e cópias de skills preparados na worktree                   |
| npm run typecheck                                   | Verde                                                                     |
| npm run validate, com VITEST_MAX_WORKERS=2          | Verde, código de saída 0                                                  |
| Regras no emulador demo local                       | Dez testes verdes, incluindo três novos com transações reais              |
| Jornada visual e regressões afetadas                | Seis projetos, três temas e desktop/celular, com 320 px                   |
| git diff --check                                    | Verde                                                                     |

Extratos da validação completa aprovada:

```text
Test Files  382 passed (382)
Tests  5152 passed (5152)
Statements   : 89.51% ( 36137/40368 )
Branches     : 85.86% ( 30923/36012 )
Functions    : 90.42% ( 8201/9069 )
Lines        : 92.64% ( 33313/35956 )

Scripts:
tests 116
pass 116
fail 0

Functions:
tests 4913
pass 4913
fail 0
cancelled 0
skipped 0

built in 4.36s
Smoke test do bundle OK.
```

### Achado fora do escopo

A primeira execução completa de frontend teve 5.151 passes e um timeout de
5.000 ms no teste legado de backup de capa de 16 MiB. O arquivo passou isolado
(nove testes, duração total de 3,83 s). A validação completa foi repetida com a
opção suportada VITEST_MAX_WORKERS=2 e passou integralmente; o arquivo de capa
terminou em 4.159 ms. Não foram alterados esse teste, seus timeouts, as asserções,
os limites de cobertura ou os scripts de validação. O build também informa
avisos de imports dinâmicos que já têm consumidores estáticos; não são erros.

## Fora do escopo

BYOK neste fluxo, avatares gerados, criação de personagens, geração em lote,
leitura de manuscritos/lore local e atualização automática de personas por
mudanças do universo. Não houve dependência nova ou migração de biblioteca.

## Limitações e pendências conhecidas

- Testes usam provedores/contas fictícios. Qualidade literária e acesso real ao modelo precisam de avaliação manual; a revisão explícita do autor é obrigatória.
- Seleção e ponteiro de recuperação ficam em memória, sem retomada após reload. Pedidos expiram em uma hora e a coleta remove até 100 por execução.
- Personas salvas são independentes da origem. Para gerar novamente após mudanças de contexto, é necessário conferir a prévia e criar outro pedido.
- Implantação não executada. A liberação requer frontend, personaGeneration, cleanupBookAssets, regras e índice, com o segredo de geração existente.
- Trabalho local: sem push, PR ou execução/acompanhamento de CI remota.

## Como verificar manualmente

1. Em Inteligência artificial → Personas, acione Criar com IA.
2. Escolha um universo e fichas próprias; escreva uma intenção e confira o contexto completo.
3. Gere a proposta e revise nome, instruções, explicação e sliders, inclusive zero.
4. Edite e salve; confirme que a biblioteca recebeu uma persona sem alterar os vínculos de projetos.
5. Escolha o perfil pelos vínculos existentes de livro/capítulo ou aventura/cena e consulte sua composição.
6. Confira erros/retry e a necessidade de nova prévia quando o contexto mudar; nenhuma falha deve gravar persona ou debitar créditos.
