# ADR 0016 — Criação em etapas e geração com créditos

- **Status:** Aceito
- **Data:** 2026-10-10

## Contexto

A criação exige etapas para título/gênero, sinopse e capa, usando IA do aplicativo com 1 crédito por sinopse e 5 por capa aceita. O cliente de texto existente não oferece geração/persistência de imagens e não garante controle de custos no servidor.

## Decisão

- Interface e persistência de livros em `books`; contratos e hook públicos de geração em `ai-assistant`. Edição e importação continuam independentes.
- Backend Node 22 em `functions/`, com callables autenticadas e App Check obrigatório. Segredos só no Secret Manager; BYOK não participa do wizard.
- Sugestões e custos em `users/{uid}/bookGenerations/{id}`, sem acesso direto pelo navegador. Débito e aceite na mesma transação, idempotente por ID. Custos vêm do servidor.
- Limite de dez solicitações por usuário por hora, incluindo falhas/descartes. Cotas globais e limites de orçamento do provedor devem ser configurados antes da ativação.
- Arte frontal plana, sem texto, em 2:3; normalização para PNG de 1200 × 1800. `sharp` valida/normaliza imagens; `firebase-functions` expõe funções e `firebase-admin` permite transações/persistência confiáveis. Dependências e lockfile isolados no backend.
- Capas no Storage, com escrita exclusiva do backend. `coverUrl` guarda um link com token: quem possui o link pode ler a imagem. A capa não entra automaticamente na publicação pública.
- Sugestões expiram em uma hora; capas aceitas sem livro em sete dias. Limpeza horária remove órfãos; exclusão de livro remove sua capa gerada.
- Criação com capa aceita associa o arquivo e grava o livro na mesma transação de servidor. Criação manual usa ID estável e transação no cliente, disponível sem IA. Leitura autenticada de ID inexistente é permitida; livros existentes continuam privados.

## Consequências

Geração real exige Functions, Storage, regras, índice, segredo, App Check e conta/cota habilitada no provedor. O editor mantém a integração anterior; esta mudança não migra toda a IA nem acrescenta pagamentos.

Aceitar uma sugestão cobra mesmo se o livro for cancelado depois. Descartes/falhas não debitam créditos, mas podem consumir recursos do provedor. Cancelar uma espera invalida a resposta e descarta o resultado quando chegar; não garante interromper a chamada iniciada no servidor.

## Referências

- [Callables](https://firebase.google.com/docs/functions/callable)
- [App Check](https://firebase.google.com/docs/app-check/cloud-functions)
- [Geração Gemini](https://ai.google.dev/gemini-api/docs/image-generation)
- [Operação da criação](../book-creation.md)
