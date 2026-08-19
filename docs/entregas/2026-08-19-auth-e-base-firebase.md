# Entrega — Autenticação e Base Firebase

- **Data**: 2026-08-19
- **Branch**: `master`
- **Plano de origem**: [docs/tasks/01-auth-e-base-firebase.md](../tasks/01-auth-e-base-firebase.md)

## Objetivo

Configurar o cliente do Firebase (Auth e Cloud Firestore), implementar a feature `auth` com suporte a autenticação por Google e E-mail/Senha, gerenciar a sessão e o perfil do autor (incluindo saldo de 100 créditos iniciais de IA) e disponibilizar a rota `/login` e os controles de perfil no cabeçalho da aplicação.

## Funcionalidades entregues

- **Configuração do Firebase**: Inicialização do SDK do Firebase (`firebaseApp`, `auth`, `firestore`) em `src/shared/lib/firebase.ts` com variáveis de ambiente tipadas e defaults do projeto.
- **Modelo e Perfis de Usuário**: Tipagem de perfil (`UserProfile`, `credits`, `tier`) e criação automática de documento de usuário no Firestore no primeiro login com 100 créditos iniciais gratuitos.
- **Serviço de Autenticação**: Funções de login com Google (`signInWithGoogle`), login/cadastro com e-mail (`signInWithEmail`, `signUpWithEmail`), logout (`signOutUser`), sincronização de perfil no Firestore e atualização de saldo de créditos.
- **Contexto e Hook `useAuth`**: Provedor reativo de sessão (`AuthProvider`) e hook `useAuth` disponibilizando usuário logado, status de carregamento, erros e ações de autenticação.
- **Página de Login (`/login`)**: Formulário com alternância entre Entrar e Cadastrar, login rápido com Google, validação de campos e mensagens de alerta amigáveis.
- **Controles no Cabeçalho**: Componente `AuthButton` exibindo nome/avatar e botão "Sair" quando autenticado ou botão "Entrar" quando deslogado, além do componente `CreditsBadge` exibindo o saldo de créditos do autor.

## Critérios de aceite

- [x] Usuário não autenticado vê o botão "Entrar" na navegação e pode navegar para `/login`.
- [x] Ao autenticar (Google ou E-mail), a conta é criada no Firestore com 100 créditos iniciais (se for primeiro acesso) ou seu saldo existente é recuperado.
- [x] A barra superior exibe o avatar do autor, seu nome e seu saldo de créditos atualizado.
- [x] Ao clicar em "Sair", a sessão é encerrada e a interface atualiza para o estado deslogado.
- [x] Testes automatizados cobrem a criação de usuário, login, logout e renderização do `CreditsBadge`.

## Arquivos alterados

| Arquivo                                         | Mudança                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `package.json`                                  | Adiciona dependência `firebase`.                                 |
| `src/vite-env.d.ts`                             | Declara variáveis de ambiente do Firebase.                       |
| `src/shared/config/env.ts`                      | Adiciona leitura e configuração padrão do Firebase.              |
| `src/shared/lib/firebase.ts`                    | Inicializa app, auth e firestore.                                |
| `src/shared/lib/index.ts`                       | Exporta instâncias públicas do Firebase.                         |
| `src/features/auth/model/user.ts`               | Modelo de usuário e perfil padrão.                               |
| `src/features/auth/services/authService.ts`     | Serviços de login, logout e sincronização com Firestore.         |
| `src/features/auth/context/AuthContext.ts`      | Contexto de autenticação do React.                               |
| `src/features/auth/context/AuthProvider.tsx`    | Provedor de estado de autenticação.                              |
| `src/features/auth/hooks/useAuth.ts`            | Hook reativo para consumo da sessão.                             |
| `src/features/auth/components/AuthButton.tsx`   | Botão de login / perfil e logout.                                |
| `src/features/auth/components/CreditsBadge.tsx` | Badge de créditos do autor.                                      |
| `src/features/auth/components/LoginPage.tsx`    | Tela de login e cadastro.                                        |
| `src/features/auth/index.ts`                    | Interface pública da feature `auth`.                             |
| `src/app/App.tsx`                               | Integra `AuthProvider`, `CreditsBadge` e `AuthButton` no layout. |
| `src/app/routes/index.tsx`                      | Adiciona rota `/login`.                                          |
| `docs/tasks/01-auth-e-base-firebase.md`         | Atualiza status dos critérios e tarefas.                         |
| `tasks.md`                                      | Marca Tarefa 01 como concluída.                                  |

## Testes

| Teste                                           | Tipo                | O que cobre                                                        |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| `src/features/auth/tests/user.test.ts`          | Unidade             | Criação do perfil padrão e cotas iniciais.                         |
| `src/features/auth/tests/CreditsBadge.test.tsx` | Componente          | Exibição de créditos e tier.                                       |
| `src/features/auth/tests/AuthButton.test.tsx`   | Componente          | Estados deslogado, logado (nome, avatar e logout).                 |
| `src/features/auth/tests/LoginPage.test.tsx`    | Componente          | Renderização, alternância de formulário, validações e Google auth. |
| `src/features/auth/tests/AuthProvider.test.tsx` | Integração/Contexto | Fluxos de autenticação, atualização de créditos e erros.           |
| `src/features/auth/tests/authService.test.ts`   | Serviço             | Integração com SDK Firebase Auth e Firestore.                      |
| `src/shared/lib/tests/firebase.test.ts`         | Unidade             | Inicialização do cliente Firebase.                                 |
| `src/shared/config/tests/env.test.ts`           | Unidade             | Configuração de ambiente e defaults do Firebase.                   |
| `src/app/tests/App.test.tsx`                    | Smoke/Composição    | Rotas `/`, `/login`, `/rota-que-nao-existe` e layout.              |

Saída da suíte:

```text
✓ src/features/auth/tests/user.test.ts (1 test) 4ms
✓ src/shared/config/tests/env.test.ts (7 tests) 6ms
✓ src/features/auth/tests/authService.test.ts (8 tests) 63ms
✓ src/shared/lib/tests/firebase.test.ts (1 test) 3ms
✓ src/features/auth/tests/CreditsBadge.test.tsx (1 test) 25ms
✓ src/features/auth/tests/AuthButton.test.tsx (4 tests) 88ms
✓ src/features/auth/tests/AuthProvider.test.tsx (4 tests) 185ms
✓ src/app/tests/App.test.tsx (5 tests) 114ms
✓ src/features/auth/tests/LoginPage.test.tsx (7 tests) 507ms

Test Files  9 passed (9)
     Tests  38 passed (38)
```

## Validações executadas

| Comando            | Resultado                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run validate` | Verde (Skills, Arquitetura, Documentação, Styleguide, Prettier, ESLint, Testes com 95.72% cobertura, Build de produção e Smoke test HTTP). |

```text
Verificacao de skills OK: 12 skill(s) validada(s) e sincronizada(s).
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
Checking formatting... All matched files use Prettier code style!
ESLint: 0 warnings, 0 errors.
Coverage: Statements 95.72%, Branches 79.83%, Functions 95.83%, Lines 96.13%.
Build de produção: dist/ gerado e verificado com sucesso.
```

## Fora do escopo

- Gestão de livros, capítulos e compêndio de lore (Tarefas 02, 03 e 04).
- Gateway de pagamento real (sistema de créditos simulado via Firestore na V1).

## Limitações e pendências conhecidas

- As regras de segurança do Firestore (`firestore.rules`) devem ser implantadas no Firebase Console/CLI conforme o projeto evoluir.

## Como verificar manualmente

1. Execute `npm run dev` e acesse `http://localhost:5173`.
2. Observe o botão "Entrar" no cabeçalho superior direito.
3. Clique em "Entrar" para navegar até `/login`.
4. Teste a criação de conta ou autenticação com e-mail/Google.
5. Verifique que o cabeçalho passa a exibir o nome do autor, o botão "Sair" e o badge com 100 créditos iniciais.
