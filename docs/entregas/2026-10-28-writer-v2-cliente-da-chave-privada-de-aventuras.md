# Writer V2 — cliente da chave privada de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; commit local.
- Base: d92197f.
- Plano: [191](../tasks/writer-v2/execucao/191-cliente-da-chave-privada-de-aventuras.md).
- Decisão: [ADR 0213](../decisions/0213-adventure-restore-private-key-client.md).

## Resultado

A camada cliente consegue obter a primeira autorização criptográfica de uma
restauração de aventura e revalidar a mesma chave nas retomadas. Exige conta,
guard, identidade e revisão corretas; o identificador conhecido é reenviado
como expectedKeyId. Retorna CryptoKey AES-GCM 256 não extraível e contexto,
sem devolver/persistir os bytes Base64.

POST privado usa Auth/App Check, no-store, credentials omit e redirect error.
Leitura limitada e UTF-8 estrito, envelope/identidade/algoritmo/Base64 fechados,
erros sem mensagem privada e buffers/reader encerrados inclusive após limite
ou perda de autorização. Entrada inválida nem carrega credenciais.
Proxy Vite e rewrite Hosting próprios preservam as rotas existentes.

Dois serviços TS novos e dois testes Vitest, exports públicos e configurações
Vite/Hosting. Sem novo backend, dependência, índice, Rules, secret ou env.
Não há ainda journal/cópia cifrada, controlador ou interface de retomada para
aventuras; esta entrega prepara esse fluxo, sem anunciá-lo utilizável pela UI.

## Testes e revisão

Seleção integrada **52/52 Vitest em quatro arquivos**, sem falhas/skips,
**2,17 s** totais. Inclui cliente/proxy de aventuras e regressões do cliente/
proxy de livros. Antes da revisão, **49/49**, **3,80 s**; a revisão acrescentou
dois casos que comprovam cancelamento do stream e limpeza do chunk recusado
e um caso com o handler/serviço reais de restauração.

A revisão final preservou UIDs Unicode, inclusive BOM inicial, conforme o
contrato real do servidor, sem mudar o limite de 128 caracteres. Acrescentados
três casos; retake somente do arquivo afetado: **38/38**, **1,38 s**, sem
falhas/skips. Os outros três arquivos não mudaram nem foram repetidos.
São **55 casos distintos** cobertos nas seleções, não uma rodada única de 55.

Cobertura dirigida: primeira obtenção/revalidação, cifra/decifra e chave
não extraível, corpo/headers, imutabilidade da identidade enquanto aguarda,
conta/guard em etapas assíncronas, entrada inválida antes do carregamento de
Firebase, alteração de cada campo, Base64 não canônico, envelope/esquema/
algoritmo, JSON/UTF-8/tamanho, erro sanitizado/status/reason, falha de rede
sem retry/fallback e limpeza de bytes após importação interrompida.

O teste de compatibilidade conecta o cliente ao handler HTTP real com banco
transacional de teste, Auth/App Check sintéticos e fetch adaptado em memória.
Confere os IDs reais emitidos no início, mesma chave após nova autorização,
AES-GCM útil e recusa state-conflict depois do cancelamento. Não é TCP,
Firestore nativo, atestação real ou teste de navegador. O SDK de 190 comprova
o backend daquele incremento; não é atribuído ao cliente novo.

Proxy/configuração conferem caminho exato, query descartada, recusa de sufixos,
destino/região corretos, ausência de sobreposição com livro/importação e
ordem da rewrite antes da SPA. Não houve chamada à função em produção.

Typecheck, ESLint dirigido e arquitetura passaram. Vite build transformou
**3028 módulos em 2,98 s** e smoke do bundle passou. Build emitiu avisos de
chunks grandes e imports dinâmicos sem separação; não houve erro.
Formatação/documentação/diff finais acompanham o commit.

Não repetidos suíte completa/coverage/Functions/SDK/E2E/visual: alteração de
serviço/configuração, sem mudança de interface ou backend. Validate integral
no fechamento do bloco do cliente conforme o operador; não tratar o baseline
186–188 como validação deste código.

## Continuidade

Revisão confere DTO próprio, nenhuma importação interna de livro, contexto
fechado/imutável, ausência de segredo nos exports/grant, reautorização a cada
chamada, falha sem exclusão de dados e rewrite específica.
Journal cifrado/bootstrap/controlador/UI/roundtrip, P2/P3/D/F2-09, fases 3–5,
gates e macro 8/35 permanecem abertos. Sem CI, push/PR, merge/deploy ou
subagentes. Somente commit local.

Conferência final: 15 arquivos no escopo, LF, sem segredo identificado, .env ou
artefato acima de 5 MiB. Tipos/arquitetura/docs finais passaram após a revisão
Unicode. Checkout principal limpo em 522ccaa; Vite em
127.0.0.1:5173/studio respondeu HTTP 200.
