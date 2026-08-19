# Writer Assistant

Assistente para escritores de ficção com compêndio de lore contextual, auxílio de escrita por IA e publicação interativa.

## Objetivo

Centralizar o planejamento de universo narrativo (personagens, locais, conceitos e relações) e a escrita em um editor de texto rico com detecção automática de termos. O projeto oferece assistência de IA contextualizada com controle de créditos, exportação em múltiplos formatos (PDF, DOCX, Markdown) e publicação online para leitores em uma interface interativa.

## Quando usar

Indicado para:

- Autores de ficção que desejam manter a consistência de seus personagens, locais e conceitos ao longo dos capítulos.
- Escritores que buscam assistência de escrita criativa por IA com autocomplete preditivo e sugestões de estilo.
- Criação e organização de livros com múltiplos capítulos e contagem de palavras.
- Publicação de histórias online em página pública interativa com balões informativos de lore.
- Exportação rápida de manuscritos para Markdown, DOCX e PDF.

## Quando NÃO usar

- Edição colaborativa simultânea multiusuário (estilo Google Docs com cursores múltiplos ao vivo).
- Marketplace de venda de livros ou cobrança por leitura de capítulos com paywall.
- Geração automática e desassistida de livros inteiros por IA.
- Diagramação profissional de pré-impressão gráfica com controle milimétrico (InDesign).

## Pré-requisitos

- Node.js 22 (o arquivo `.nvmrc` indica a versão; com `nvm`, rode `nvm use`)
- npm 10.6.0 (a versão exata declarada em `packageManager`)
- git

## Instalação

```bash
npm install
```

## Execução

```bash
npm run dev
```

O Vite mostra no terminal o endereço local (algo como `http://localhost:5173`).

## Validação

Antes de considerar qualquer alteração pronta, rode:

```bash
npm run validate
```

Esse comando executa, em sequência: verificação de skills, conformidade arquitetural, validação de documentação, regras do styleguide, checagem de formatação com Prettier, lint com ESLint, suíte de testes com cobertura e build de produção com smoke test do bundle gerado.

## Verificação automática

| Onde                | O que roda                              |
| ------------------- | --------------------------------------- |
| `pre-commit`        | `lint-staged` nos arquivos alterados    |
| `commit-msg`        | Convenção da mensagem de commit         |
| `pre-push`          | `typecheck` e `test:unit`               |
| CI (GitHub Actions) | `validate`, auditoria e E2E no Chromium |

O CI está configurado em `.github/workflows/ci.yml`.

## Comandos

| Comando                      | O que faz                                                        |
| ---------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                | Sobe o servidor de desenvolvimento com recarga automática        |
| `npm run build`              | Gera a versão de produção                                        |
| `npm run lint`               | Verifica problemas de código com ESLint                          |
| `npm run check:architecture` | Impede imports que atravessam as fronteiras das features         |
| `npm run check:docs`         | Valida links, comandos e referências da documentação             |
| `npm run check:toolchain`    | Confere a versão do npm declarada pelo projeto                   |
| `npm run format`             | Formata os arquivos com Prettier                                 |
| `npm run format:check`       | Confere se os arquivos estão formatados                          |
| `npm run typecheck`          | Verifica os tipos do TypeScript                                  |
| `npm run test`               | Roda a suíte de testes com limites de cobertura                  |
| `npm run test:unit`          | Roda apenas os testes Vitest, sem cobertura                      |
| `npm run test:coverage`      | Roda os testes Vitest aplicando os limites de cobertura          |
| `npm run test:setup`         | Testa o setup e as regras de arquitetura em projetos temporários |
| `npm run test:e2e`           | Executa o fluxo crítico no Chromium com Playwright               |
| `npm run test:e2e:update`    | Regera as imagens de referência do styleguide                    |
| `npm run test:watch`         | Roda os testes em modo contínuo                                  |
| `npm run setup`              | Personaliza identificadores e opções do projeto                  |
| `npm run update:template`    | Aplica migrações conhecidas do template                          |
| `npm run generate:feature`   | Gera a estrutura inicial de uma nova feature                     |
| `npm run smoke:build`        | Serve e verifica o conteúdo gerado em `dist/`                    |
| `npm run sync:skills`        | Sincroniza as definições de skills para os agentes               |
| `npm run check:skills`       | Verifica se as cópias das skills estão sincronizadas             |
| `npm run check:styleguide`   | Avisa sobre desvios dos tokens e componentes visuais             |
| `npm run validate`           | Roda todos os portões de qualidade em sequência                  |

## Estrutura resumida

```
src/
├── app/          # composição geral (providers, rotas, layout) — sem regra de negócio
├── features/     # capacidades do produto em pastas isoladas (auth, books, lore, editor, ai-assistant)
├── shared/       # utilitários reutilizáveis e neutros (config, hooks, lib, types)
├── test/         # setup.ts e render.tsx
└── main.tsx      # ponto de entrada da aplicação
docs/             # documentação técnica e de produto (prd.md, architecture.md, etc.)
```

Detalhes em [docs/architecture.md](docs/architecture.md) e requisitos em [docs/prd.md](docs/prd.md).

## Como usar agentes

As regras que os agentes devem seguir ficam em dois arquivos na raiz:

- `AGENTS.md` — regras gerais válidas para qualquer agente
- `CLAUDE.md` — instruções específicas para o Claude Code

Veja [docs/agents.md](docs/agents.md) para a lista de skills disponíveis e orientações de uso.

## Como criar uma feature

1. Peça ao agente um plano: "Use a skill plan-feature para planejar a funcionalidade X".
2. Revise o plano apresentado.
3. Peça a implementação: "Use a skill implement-feature para executar o plano".
4. Gere a base se necessário com `npm run generate:feature -- --name="minha-feature"`.
5. Rode `npm run validate`.
6. Peça o registro da entrega: "Use a skill document-delivery para registrar a entrega". O histórico fica em [docs/entregas](docs/entregas/README.md).

Regras de arquitetura em [docs/architecture.md](docs/architecture.md); regras visuais em [docs/styleguide.md](docs/styleguide.md).

## Como registrar uma decisão

Decisões relevantes de arquitetura ou tecnologia viram um ADR (Architecture Decision Record) em `docs/decisions/`. Use o formato do primeiro registro, [docs/decisions/0001-initial-architecture.md](docs/decisions/0001-initial-architecture.md), como modelo.

## Limitações conhecidas

- A autenticação e a persistência em nuvem dependem da configuração das credenciais do Firebase.
- O autocomplete de IA preditivo depende de conexão ativa e saldo de créditos (ou chave de API BYOK informada).
- A exportação em PDF utiliza o motor de renderização e diálogo de impressão do navegador.
