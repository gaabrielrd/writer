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
3. Copie `functions/.env.example` para `functions/.env.<project-id>` e confira os parâmetros de servidor: `BOOK_SYNOPSIS_MODEL` (`gemini-3.7-flash`), `BOOK_COVER_MODEL` (`gemini-3.1-flash-image`), `BOOK_SYNOPSIS_CREDITS` (1), `BOOK_COVER_CREDITS` (5). A CLI exige valores explícitos no deploy não interativo. Confirme disponibilidade dos modelos na conta antes da implantação. O arquivo do destino é ignorado pelo Git e não contém a chave privada.
4. Configure App Check para o domínio. Em desenvolvimento, use o mecanismo oficial de debug com token autorizado; mantenha a exigência nas funções.
5. Após autorização para o destino verificado, publique somente as funções do codebase `book-generation`, regras Storage, regras Firestore e índices, definidos em `firebase.json`. Workflows existentes não passam a implantar Functions/Storage automaticamente.
6. Faça uma geração controlada, aceite, retentativa e criação. Confira saldo, armazenamento e limites antes da liberação.

## Escopo

Sem upload manual, edição avançada, galeria, BYOK no wizard ou alterações do editor. IA produz arte plana sem texto incorporado. Sinopse/capa opcionais na criação manual.

## Verificação no destino em 2026-10-10

O deploy local foi autorizado para `writer-44cd5`. Hosting, regras Firestore/Storage e índice de expiração foram publicados. O bucket padrão foi criado em `us-central1`; o índice chegou a `READY`. O HTML e três assets de entrada servidos correspondem byte a byte ao build validado do commit `65cc686`. A configuração existente do App Check foi confirmada.

As sete funções do codebase `book-generation` foram verificadas em estado `ACTIVE`, com custos de 1/5 créditos. Após a rotação abaixo, a geração usa a versão 3 do segredo. A limpeza horária está `ENABLED`; imagens de build no Artifact Registry têm retenção de 30 dias. As duas falhas iniciais de criação (Cloud Run 500 e propagação do agente Eventarc) foram resolvidas por retentativa somente das funções afetadas.

A chave fornecida em `.gemini-api-key` foi cadastrada no Secret Manager sem exibir seu valor. Esse arquivo e `functions/.env.<project-id>` são ignorados pelo Git. Os modelos responderam à consulta de metadados da conta.

O teste real de sinopse identificou truncamento com 1000 tokens. O backend passou a usar 2048 tokens e raciocínio `low`, rejeitando respostas com `MAX_TOKENS`. A nova requisição retornou 158 palavras e término `STOP`. A chave inicial retornou HTTP 429 para capa, com cota gratuita de imagens igual a zero. Essa pendência foi resolvida pela substituição registrada abaixo. O faturamento ativo do projeto Firebase não comprova a cota do projeto da chave Gemini.

Os testes do provedor não criaram livros nem debitaram saldo do aplicativo. O fluxo completo autenticado de gerar/aceitar/criar ainda precisa ser verificado no aplicativo. As chamadas sem Auth/App Check aos endpoints publicados foram rejeitadas com HTTP 401.

### Rotação da chave e liberação de capas

O usuário substituiu `.gemini-api-key` por uma chave habilitada. A consulta ao modelo de sinopse retornou HTTP 200. A geração real de capa retornou HTTP 200 e foi normalizada em memória para PNG de 1200 × 1800. A primeira checagem local da imagem precisou ser corrigida para usar a exportação pública do pacote sharp; a segunda verificação confirmou formato e dimensões.

A nova chave foi cadastrada como versão 3 de `BOOK_GENERATION_GEMINI_KEY`. Somente `generateBookAsset` foi reimplantada. A consulta remota confirmou estado `ACTIVE`, vínculo à versão 3 e custos 1/5. O endpoint manteve a rejeição HTTP 401 sem Auth/App Check. Nenhum valor de chave foi exibido ou versionado.
