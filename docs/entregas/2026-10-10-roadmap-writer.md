# Roadmap integrado do Writer

- **Data**: 2026-10-10
- **Branch**: `feat/complete-writer-roadmap`
- **Plano de origem**: tarefas 01–08 e preparação de workflows solicitada na conversa.

## Objetivo

Completar os critérios comprometidos que ainda não tinham implementação efetiva,
preservando o estúdio caramelo/café e a revisão humana antes de merge ou implantação.
A [matriz de aceite](../tasks/roadmap-acceptance.md) relaciona cada tarefa à evidência.

## Funcionalidades entregues

- Editor WYSIWYG com conteúdo legado preservado, destaques e ficha de lore, menções,
  sugestão inline, salvamento serializado e escolha explícita de recuperação local.
- Perfil e saldo reativos; créditos de produto debitados apenas no aceite; renovação
  Premium condicionada a direito administrativo separado do perfil legado.
- Fichas estruturadas compatíveis com texto livre e privacidade que revoga publicação.
- Publicação explícita em versão pública mínima, leitor anônimo com capítulos, temas,
  histórico, setas e balões, sem acesso aos documentos privados do autor.
- Markdown e DOCX reais, capítulo/livro e texto atual; impressão isolada para salvar PDF;
  backup JSON privado conforme RN-05.
- Workflows preparados e desabilitados: Hosting após validações do mesmo SHA e
  Firestore manual para regras, índices ou ambos. Nenhum acesso ou deploy foi ativado.

## Critérios de aceite

- [x] Critérios funcionais mapeados às suítes e regras na revisão de aceite.
- [x] Regras reais testadas no emulador, incluindo acesso privado, replay e créditos.
- [x] Validação integrada local verde, sem reduzir limiares de cobertura.
- [x] DOCX gerado, renderizado em duas páginas e inspecionado visualmente.
- [ ] CI do SHA publicado, navegador e artefatos PDF/visuais: acompanhar no PR.

## Arquivos alterados

| Área                   | Arquivos principais                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Autorização/publicação | `firestore.rules`, `AuthorBookRoute.tsx`, `publicationService.ts`, `publicBookService.ts`                |
| Editor/recuperação     | `RichEditor.tsx`, `EditorPage.tsx`, `useAutoSave.ts`, `chapterContentStorage.ts`, `localDraftStorage.ts` |
| Exportação             | `ExportButton.tsx`, `ExportDialog.tsx`, serviços `exportMarkdown.ts`, `exportDocx.ts`, `exportPdf.ts`    |
| Lore/IA/perfil         | formulário/ficha de lore, serviços transacionais, contexto de sessão e sugestão inline                   |
| Qualidade/implantação  | emulador verificado por SHA-256, testes unitários/E2E, workflows e `firebase-deploy-guard.mjs`           |

## Testes e validações executadas

Saída real de `npm run validate` (Node 22, npm 10.6):

```text
Test Files  62 passed (62)
Tests       404 passed (404)
All files   93.64 statements | 82.64 branches | 91.39 functions | 95.51 lines
# tests 64
# pass 64
# fail 0
Smoke test do bundle OK.
```

| Verificação                                             | Resultado observado                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Skills, arquitetura, docs, styleguide, formato e ESLint | Verde no validate                                                                        |
| TypeScript, build e smoke                               | Verde no validate                                                                        |
| Firestore real                                          | 26/26 testes de publicação e créditos passaram                                           |
| Auditoria do lockfile                                   | 0 high/critical; 6 moderate                                                              |
| Descoberta Playwright                                   | 6 testes Chromium e 108 cenários temáticos registrados                                   |
| DOCX                                                    | Conteúdo Unicode, hierarquia, listas e quebras revisados em duas páginas renderizadas    |
| Workflows de deploy                                     | 12 testes de guard/contratos, YAML e 23 blocos shell verificados; sem execução de deploy |

A descoberta de testes não equivale a execução. Chromium local foi bloqueado pelo
ambiente; CI precisa produzir as evidências de navegador. O teste de PDF captura o
documento isolado e renderiza um PDF real no Chromium, sem operar o diálogo nativo.

## Fora do escopo

Merge, implantação, publicação de obras reais, IAM/OIDC/secrets, migração de produção,
pagamentos e concessão/reconciliação de direitos de usuários reais.

## Limitações e pendências conhecidas

- O saldo de produto não é um gateway de cobrança das chamadas diretas à IA.
  Direitos Premium legados exigem auditoria; a renovação falha fechada sem direito administrativo.
- Publicação requer rollout coordenado de regras e aplicativo e republicação explícita;
  nenhuma obra antiga vira pública automaticamente.
- PDF usa impressão/salvar PDF do navegador. Layout final e navegador ficam pendentes
  de inspeção dos artefatos de CI nesta primeira publicação do PR.
- A meta de detecção abaixo de 50 ms não é garantia universal: mediana local aquecida
  de 8,13 ms em 15 mil palavras, com variação sob carga. Veja a matriz de aceite.
- Build conserva aviso de chunk acima de 500 kB e importação dinâmica ineficaz do
  exportador DOCX; nenhum limite de qualidade foi reduzido para ocultar avisos.
- Auditoria da aplicação não cobre a CLI global de deploy. Rever suas dependências
  antes de qualquer ativação, conforme [implantação](../deployment.md).

## Como verificar manualmente

1. Entrar como autor, editar um capítulo legado, formatar texto e conferir salvamento.
2. Simular desconexão e reabrir o capítulo; escolher conscientemente recuperar ou manter servidor.
3. Criar lore público e privado, publicar com nome público e abrir o link sem login.
4. Navegar capítulos e histórico; tornar lore privado e verificar indisponibilidade do leitor.
5. Exportar texto atual e livro completo em Markdown/DOCX; abrir impressão e salvar PDF.
6. Revisar workflows e documentação mantendo os gates de deploy desabilitados.
