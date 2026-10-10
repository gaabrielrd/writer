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
- [x] CI de integração e navegador em `1499337`: 108 cenários verdes e PDF inspecionado; consultar checks do PR para o SHA final.

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
Test Files  63 passed (63)
Tests       406 passed (406)
All files   93.65 statements | 82.69 branches | 91.41 functions | 95.51 lines
# tests 66
# pass 66
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
| Workflows de deploy                                     | 14 testes de guard/contratos, YAML e 23 blocos shell verificados; sem execução de deploy |

A descoberta de testes não equivale a execução. Chromium local foi bloqueado pelo
ambiente; as evidências de navegador vieram do CI, registradas abaixo. O teste de PDF captura o
documento isolado e renderiza um PDF real no Chromium, sem operar o diálogo nativo.

## Fora do escopo

Merge, implantação, publicação de obras reais, IAM/chaves/secrets, migração de produção,
pagamentos e concessão/reconciliação de direitos de usuários reais.

## Limitações e pendências conhecidas

- O saldo de produto não é um gateway de cobrança das chamadas diretas à IA.
  Direitos Premium legados exigem auditoria; a renovação falha fechada sem direito administrativo.
- Encerramento forçado do navegador ou revogação externa da autenticação não
  oferece atomicidade entre débito de crédito e inserção do texto no desenho
  atual client-side; guards cobrem a navegação e saída controladas pela aplicação.
- Publicação requer rollout coordenado de regras e aplicativo e republicação explícita;
  nenhuma obra antiga vira pública automaticamente.
- PDF usa impressão/salvar PDF do navegador. Layout final e navegador foram inspecionados nos artefatos de CI; o diálogo
  nativo continua sob controle do usuário.
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

## Revisão após o primeiro CI do PR

No commit `401b200001177d44070af7367e8e96d40b9a8d0b`, validação Node 22/24,
auditoria, emulador Firestore e os seis testes Chromium básicos passaram. A
suíte ampliada terminou com 91 passagens diretas, 11 passagens após retry e seis
falhas; isso **não** foi tratado como aceite completo.

Os traces identificaram hooks compartilhados que não eram registrados para
cada arquivo no mesmo worker, relógio artificial congelado incompatível com a
heurística de foco do editor, animação lateral que ampliava temporariamente o
viewport mobile e Escape sem efeito em tooltip aberto apenas por hover.
A correção mantém os 108 cenários, usa fixture automática por teste e relógio
que avança, verifica seleção antes da formatação, fortalece o limite real de
viewport e permite fechar tooltip por Escape independentemente do foco.
O próximo SHA precisa passar integralmente pelo CI; não houve redução de
cobertura, retirada de cenários ou alteração das referências visuais existentes.

### Inspeção dos artefatos de exportação

Os 24 cenários de exportação passaram no primeiro CI. Os seis PDFs reais do
Chromium têm três páginas A4 cada; as 18 páginas renderizadas são idênticas entre
os temas/viewports. A inspeção confirmou margens de 22 mm, acentuação, títulos
longos e quebras por capítulo, sem texto cortado ou páginas vazias. A inspeção
visual também encontrou contraste insuficiente no aviso de backup privado em
tema escuro; a correção usa os tokens semânticos existentes, sem alterar a paleta.
O diálogo nativo de impressão continua simulado no teste, enquanto o PDF é
produzido pelo renderizador real do navegador.

## Opção de autenticação de deploy escolhida

A preparação foi adaptada, por solicitação posterior, para chaves JSON de duas
service accounts guardadas em GitHub Environment Secrets separados. OIDC não
é necessário nesta opção e os jobs não recebem `id-token: write`. A chave só
é materializada no job protegido depois das validações e verificações de
SHA/destino; nenhum conteúdo de chave foi criado, recebido ou configurado neste PR.
Os gates continuam desabilitados e as condições de master, projeto, artefato,
concorrência e confirmação manual foram preservadas. A documentação detalha
rotação/revogação e as permissões mínimas a revisar antes de qualquer ativação.

## Resultado da correção de navegador

O [CI de 1499337483a84dc0ad373cb18732e5152c914bb1](https://github.com/gaabrielrd/writer/actions/runs/38075580290)
passou em Node 22/24, auditoria e navegador: seis testes Chromium básicos e
**108/108 cenários visuais/produto, sem falhas ou retries**. O workflow separado
de regras também passou. Os cenários agora verificam contraste real dos três
avisos de exportação, além de seleção, Escape e viewport mobile corrigidos.
A validação local consolidada com a opção JSON também passou, com 406 testes
unitários e 66 de scripts. O resultado dos mesmos gates no SHA final, incluindo a preparação de
credenciais, fica nos checks do PR; autenticação e deploy reais permanecem
não executados. Não se deve confundir configuração informada
pelo usuário com credenciais ou permissões testadas em produção.
