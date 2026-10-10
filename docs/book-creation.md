# Criação de livros e geração por IA

## Fluxo

1. **Livro:** título e gênero obrigatórios, com limites de 300 e 120 caracteres.
2. **Sinopse:** texto editável de até 4000 caracteres ou sugestão baseada em título/gênero. **Usar sinopse** confirma a substituição.
3. **Capa:** URL opcional ou geração baseada em título, gênero e sinopse. Gerar exige sinopse preenchida. Prévia/listagem em 2:3; PNG de 1200 × 1800.

Voltar preserva campos. Alterar contexto descarta sugestões pendentes; conteúdo aceito permanece. **Criar Livro** grava na última etapa, com ID estável em retentativas. Edição e importação preservam seus fluxos.

Custos aprovados: **1 crédito por sinopse aceita** e **5 por capa aceita**. Aceite repetido do mesmo ID não debita novamente. Cancelar o livro/remover resultado aceito não devolve créditos. Criação manual funciona em falha da IA ou saldo insuficiente.

## Backend e retenção

`functions/src/index.mjs` publica as callables `bookGenerationQuote`, `generateBookAsset`, `acceptBookAsset`, `discardBookAsset` e `createBookWithCover`, em `us-central1`, com Auth e App Check obrigatórios.

Custos, limites e registros são controlados pelo servidor. Até dez gerações por usuário por hora; falhas também contam. Sugestões expiram em uma hora; capas aceitas sem livro em sete dias. `cleanupBookAssets` remove até 100 registros expirados por hora. `cleanupDeletedBookCover` remove capas de livros excluídos. Capas associadas permanecem enquanto o livro existir.

A prévia retorna sem URL persistente; o link só é entregue no aceite. O token permite acesso a quem o possui. Regras Storage impedem escrita pelo navegador e restringem leitura normal ao dono. Não há publicação automática dessas capas no leitor público.

## Preparação e validação

```sh
npm ci
npm ci --prefix functions
npm run test:book-generation
npm run validate
npm run test:rules
```

Backend com lockfile próprio. Testes cobrem contratos, transações, limites, propriedade e normalização real de imagens. `test:rules` usa só emulador Firestore demo e exige Java 21. Suíte visual usa serviços/dados fictícios e nenhuma chave real.

## Ativação no destino

Nenhum serviço de produção é implantado automaticamente pela implementação.

1. Verifique projeto, Storage, faturamento, cotas globais e modelos disponíveis.
2. Configure `BOOK_GENERATION_GEMINI_KEY` no Secret Manager via Firebase CLI, fora de arquivos versionados. Nunca use variável `VITE_` para essa chave.
3. Confira os parâmetros de servidor: `BOOK_SYNOPSIS_MODEL` (`gemini-3.7-flash`), `BOOK_COVER_MODEL` (`gemini-3.1-flash-image`), `BOOK_SYNOPSIS_CREDITS` (1), `BOOK_COVER_CREDITS` (5). Confirme disponibilidade dos modelos na conta antes da implantação.
4. Configure App Check para o domínio. Em desenvolvimento, use o mecanismo oficial de debug com token autorizado; mantenha a exigência nas funções.
5. Após autorização para o destino verificado, publique somente as funções do codebase `book-generation`, regras Storage, regras Firestore e índices, definidos em `firebase.json`. Workflows existentes não passam a implantar Functions/Storage automaticamente.
6. Faça uma geração controlada, aceite, retentativa e criação. Confira saldo, armazenamento e limites antes da liberação.

## Escopo

Sem upload manual, edição avançada, galeria, BYOK no wizard ou alterações do editor. IA produz arte plana sem texto incorporado. Sinopse/capa opcionais na criação manual.
