# Tarefa 01 — Autenticação e Base Firebase

## Contexto

O **Writer Assistant** necessita de persistência segura em nuvem e identificação de autores para associar seus livros, entidades de lore e saldo de créditos de IA.

## Objetivo

Configurar o cliente Firebase (Firebase Auth e Cloud Firestore), implementar a feature `auth` com suporte a login com Google e E-mail/Senha, e gerenciar a sessão e perfil do autor (incluindo cota inicial de créditos).

## Escopo

- Configuração do SDK client do Firebase em `src/shared/lib/firebase.ts` com validação de variáveis de ambiente.
- Implementação da feature `src/features/auth`:
  - `model/user.ts`: Tipagem de usuário (`UserProfile`, `credits`, `tier: 'free' | 'premium'`).
  - `services/authService.ts`: Funções de login (Google, E-mail), logout, observação de estado de autenticação (`onAuthStateChanged`) e criação/recuperação do documento de perfil no Firestore (`users/{uid}`).
  - `components/AuthButton.tsx`: Botão de login/logout com exibição do nome e avatar do usuário.
  - `components/CreditsBadge.tsx`: Exibição do saldo de créditos do autor na barra de navegação.
  - `components/LoginPage.tsx`: Página de login e boas-vindas.
  - `hooks/useAuth.ts`: Hook para acesso reativo à sessão, usuário logado e saldo de créditos.
  - `tests/`: Testes de unidade e componente cobrindo login, logout e carregamento de créditos.
- Integração da barra de navegação principal (`src/app/App.tsx`) exibindo o status do autor logado e saldo de créditos.

## Não escopo

- Gestão de livros ou escrita de capítulos (Tarefas 02 e 04).
- Processamento de pagamento real de créditos (simulado via Firestore na V1).

## Critérios de aceite

- [x] Usuário não autenticado vê o botão "Entrar" na navegação e pode navegar para `/login`.
- [x] Ao autenticar (Google ou E-mail), a conta é criada no Firestore com 100 créditos iniciais (se for primeiro acesso) ou seu saldo existente é recuperado.
- [x] A barra superior exibe o avatar do autor, seu nome e seu saldo de créditos atualizado.
- [x] Ao clicar em "Sair", a sessão é encerrada e a interface atualiza para o estado deslogado.
- [x] Testes automatizados cobrem a criação de usuário, login, logout e renderização do `CreditsBadge`.

## Tarefas

- [x] 1. Declarar as variáveis do Firebase em `src/vite-env.d.ts` e configurar em `src/shared/config/env.ts` (ou fallback seguro para desenvolvimento/testes).
- [x] 2. Criar o cliente inicializado do Firebase em `src/shared/lib/firebase.ts`.
- [x] 3. Gerar a feature `src/features/auth` (`npm run generate:feature -- --name="auth"`).
- [x] 4. Implementar a modelagem de usuário e perfis em `src/features/auth/model/user.ts`.
- [x] 5. Implementar o serviço de autenticação e persistência de perfil em `src/features/auth/services/authService.ts`.
- [x] 6. Implementar os componentes de interface (`LoginPage`, `AuthButton`, `CreditsBadge`) utilizando o kit `@vitru/styleguide`.
- [x] 7. Criar a rota `/login` em `src/app/routes/index.tsx` e integrar no cabeçalho em `src/app/App.tsx`.
- [x] 8. Escrever testes unitários e de integração da feature em `src/features/auth/tests/`.
- [x] 9. Executar `npm run validate` e garantir 100% de sucesso.

## Riscos

- Ausência de credenciais do Firebase em ambiente de teste local: mitigar com emulador ou mocks nos testes de unidade.
