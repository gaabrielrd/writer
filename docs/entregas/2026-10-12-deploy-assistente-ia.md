# Deploy completo do Assistente IA

- **Data**: 2026-10-12
- **Projeto/site**: `writer-44cd5` — [Writer](https://writer-44cd5.web.app)
- **Branch**: `master`
- **Fonte do backend**: `4ca7046`
- **Fonte do frontend final**: `02dd187`
- **Plano**: [Assistente IA em 12 tarefas](../tasks/assistente-ia-conversacional-no-editor.md)

## Objetivo e autorização

O usuário solicitou implantação completa, incluindo callable e regras, com
validação autenticada do chat em produção e preservação das alterações paralelas.
Autorizou explicitamente as tentativas automáticas das três novas rotinas de
limpeza: falhas podem gerar repetições faturadas por até sete dias.

## Recursos publicados

| Recurso                     | Resultado observado                                             |
| --------------------------- | --------------------------------------------------------------- |
| `chapterChat`               | Criada; Node 22, GEN_2, us-central1, ACTIVE.                    |
| `cleanupDeletedChapterChat` | Criada; GEN_2, ACTIVE.                                          |
| `cleanupDeletedUserChat`    | Criada; GEN_2, ACTIVE.                                          |
| `cleanupDeletedAccountChat` | Criada; GEN_1, ACTIVE.                                          |
| `cleanupDeletedBookCover`   | Atualizada para incluir o histórico; GEN_2, ACTIVE.             |
| Firestore rules             | Compiladas/publicadas; conteúdo remoto igual ao local.          |
| Hosting                     | Versão final FINALIZED; quinze arquivos conferidos por SHA-256. |

As outras 21 funções conservaram seus horários de atualização e o estado ACTIVE.
Não houve alteração de índices nem de regras Storage nesta funcionalidade.
O segredo existente permaneceu no servidor, sem nova chave ou dependência.

Release final: `sites/writer-44cd5/releases/1791822602485000`.
Versão: `sites/writer-44cd5/versions/e798d4e53800c09b`.
Horário da API: `2026-10-12T16:30:02.485Z`.

Hash normalizado das regras Firestore:
`e54a5f869358360890a6b09ec0ebfa0b3e4d312905436ff5d310199ea5cd1b0d`.
Hash do index final:
`9caca133082db02878bd94ce28a0fe2eb0dc33c28616445fc45dda6dcd6a69c3`.

## Validação autenticada em produção

Foi criado um livro privado denominado **[Validação] Assistente IA 12/10/2026**,
com dois capítulos e uma ficha de lore sintéticos. A aba original do usuário e
seus manuscritos não foram editados. Nenhum texto de um manuscrito real foi
enviado ao provedor durante os testes.

- [x] Callable autenticada carregou o histórico do capítulo.
- [x] `/coerencia` usou a ficha local de Lia e citou a passagem correspondente.
- [x] Conversar e gerar prosa mantiveram o saldo em 92 créditos.
- [x] Contexto de seleção foi capturado e conservado com a mensagem.
- [x] Catálogo `/` funcionou com setas/Tab, sem geração ao escolher o comando.
- [x] Histórico e rascunho retornaram depois de recarregar.
- [x] Outro capítulo apresentou conversa independente, vazia.
- [x] Compêndio e chat tiveram os mesmos x/y, largura 360 px e altura 785,6 px.
- [x] Primeiro aceite salvou prosa e contagem; saldo passou de 92 para 91.
- [x] Desfazer restaurou o texto anterior; reaplicar conservou o saldo em 91.
- [x] Streaming mostrou texto antes de concluir; Parar conservou 1864 caracteres
      parciais, estado `stopped`, sem sugestão aplicável, débito ou alteração do texto.
- [x] Chamada sem autenticação foi recusada com HTTP 401.
- [x] Leitura anônima de uma conversa privada foi recusada com HTTP 403.
- [x] Browser não apresentou erros de JavaScript durante a validação.
- [x] Hash do manuscrito original permaneceu igual nas verificações executadas.

## Correção encontrada na validação

Uma resposta interrompida mostrava o marcador interno de sugestão. O frontend
passou a ocultá-lo durante streaming, no histórico e na cópia, sem alterar os
registros, o conteúdo aplicado ou a cobrança. A resposta real já salva foi
reaberta na versão final e não mostrou os marcadores.

O teste de viewport apresentou uma corrida entre preenchimento e posicionamento
do cursor. A preparação agora aguarda dois frames e confirma, pelo Range do DOM,
que o cursor está no início antes de rolar. Os seis projetos passaram depois da
estabilização, sem modificar a regra de contexto automático.

Arquivos desta correção: `ChapterChatPanel.tsx`, `ChapterChatPanel.test.tsx`,
`e2e/visual/chapter-chat.visual.ts` e [contrato do chat](../chapter-chat.md).

## Testes e validações

```text
Test Files  102 passed (102)
     Tests  714 passed (714)
All files: statements 92.63%, branches 85.91%, functions 91.01%, lines 94.77%
scripts: tests 69; pass 69; fail 0
functions: tests 73; pass 73; fail 0
Smoke test do bundle OK.
Navegador: 12 passed (43.8s)
```

| Comando/verificação                                                                          | Resultado                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run build`                                                                              | Verde antes da implantação inicial.                                            |
| `npm run validate`                                                                           | Verde para a correção publicada.                                               |
| `npx vitest run src/features/ai-assistant/tests/ChapterChatPanel.test.tsx --reporter=dot`    | 14 testes passaram.                                                            |
| `npx playwright test --config playwright.visual.config.ts e2e/visual/chapter-chat.visual.ts` | 12 testes passaram nos três temas, desktop/celular.                            |
| CLI Firebase 15.24.0                                                                         | Deploy direcionado das cinco funções, Firestore rules e Hosting completo.      |
| APIs Google/Firebase autenticadas                                                            | Funções ACTIVE, regras equivalentes, release FINALIZED.                        |
| HTTP público                                                                                 | Quinze arquivos e três rotas responderam 200 com hashes corretos.              |
| Edge autenticado                                                                             | Conversa, contexto, histórico, saldo, aceite, undo, reaplicação e interrupção. |
| `git diff --check`                                                                           | Sem erros de whitespace.                                                       |

A descoberta de funções exigiu 60 segundos em vez do limite local de 10 segundos.
Os avisos existentes de regiões diferentes dos triggers, tipo `null` nas regras,
chunk grande e importação dinâmica/estática de `exportDocx` não impediram a
publicação nem as verificações.

## Evidências e preservação

Logs redigidos, snapshots de metadados, conferência SHA-256, registros sintéticos,
medidas de interface e captura ficam em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a13056-30ca-77b3-aabe-9bdfa885c189/assistente-ia-producao`.
A captura final é `chat-producao.png`.

O arquivo paralelo `2026-10-12-deploy-estudio-fluxos-diretos.md` ficou fora dos
commits e conserva SHA-256
`0E9CF3E374CDAEDFBFF810947E703823F820C110B5C56ECEAB73D63EDB050E7A`.

## Limites e pendências

- A validação autenticada utilizou o provedor da plataforma. Chaves BYOK não
  foram acessadas; OpenAI/Gemini BYOK permanecem cobertos pelos testes locais.
- Não foram excluídos perfis ou contas reais para testar os respectivos triggers.
- O aceite da fixture consumiu um único crédito. Reembolso e remoção exclusiva
  dos dados sintéticos foram autorizados e concluídos, conforme o registro abaixo.
- O rollout em produção foi verificado diretamente; este registro não afirma
  resultado de CI remoto que não tenha sido consultado.
- Abas que já estavam abertas precisam recarregar para usar o frontend final.

## Como conferir

1. Recarregue [Writer](https://writer-44cd5.web.app) e abra um capítulo.
2. Alterne Compêndio/Assistente IA e confirme o mesmo espaço lateral.
3. Envie um pedido, confira contexto/histórico e pare uma resposta em andamento.
4. Aceite uma sugestão somente quando desejar modificar o capítulo; o primeiro
   aceite da plataforma custa 1 crédito, e a reaplicação da mesma sugestão é gratuita.

## Encerramento da validação — 2026-10-12

O usuário autorizou explicitamente o reembolso de 1 crédito e a remoção exclusiva
do livro privado de validação, seus capítulos, lore e conversas. A restrição da
revisão automática sobre a alteração do saldo foi resolvida por essa autorização.

- Reembolso atômico de exatamente 1 crédito, com marcação no recibo para evitar
  duplicação e incremento que preserva alterações concorrentes do saldo.
- Saldo observado após o reembolso e na conferência final: **92 créditos**.
- Remoção restrita aos quatro documentos criados nesta validação: livro, dois
  capítulos e uma ficha de lore. Os documentos retornaram HTTP 404 na conferência.
- A exclusão do primeiro capítulo acionou a rotina publicada, que removeu suas
  conversas e recibos antes da exclusão do livro.
- Conferência final: zero capítulos, lore, conversas, mensagens e recibos nos
  caminhos da fixture; sem documentos de capítulos no histórico privado do livro.
- Hash do manuscrito original igual ao registrado antes da validação. O arquivo
  paralelo conserva o SHA-256 descrito acima e continua fora dos commits.
- A aba criada para validação foi fechada antes da exclusão, evitando autosave
  posterior; a aba original do usuário não foi alterada.

Conclusão da limpeza: `2026-10-12T19:23:02.430Z` (16:23 em São Paulo).
Conferência final: `2026-10-12T19:23:44.524Z`.
Evidências adicionais no diretório já indicado: `refund.json`, `cleanup.json`
e `cleanup-verification.json`.
