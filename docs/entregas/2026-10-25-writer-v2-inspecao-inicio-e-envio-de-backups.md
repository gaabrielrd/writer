# Writer V2 — inspeção, início e envio retomáveis

## Resultado parcial

Arquivo atual e JSON legado podem ser inspecionados localmente por bytes,
independentemente do nome/MIME, para revisão metadata congelada sem prosa.
Controle inicial sobrevive a uma resposta perdida antes da existência da chave;
confirmação/fence nativos encerram somente sua tentativa.

Upload usa partes de até 64 KiB, IDs determinísticos e checkpoints originais
provados com serviço real. Pedido sem resposta é repetido exatamente; recarga
reconfere arquivo e prefixo autorizado. Conta/arquivo divergentes ou cancelamento
bloqueiam envio. Getters/listas públicas projetam metadata, sem retornar respostas
brutas. A raiz do livro ainda não nasce nessa etapa.

## Escopo e arquivos

Sete arquivos de modelo/serviços de revisão, bootstrap, sessão, transporte,
leitor de job e driver; cinco testes novos e interface pública. Sem dependência,
contrato de servidor ou Rule novos.
[ADR 0160](../decisions/0160-local-review-and-resumable-book-transfer.md),
[plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md).

## Vitest — 46 casos distintos positivos em seleções

- Inspeção: oito casos iniciais, 1.25 s; arquivo atual, JSON v1/v6, hash estável
  ao renomear, ausência de título/nome/prosa, intervalos limitados para conteúdo
  grande, corrupção, conta/abort e descarte do índice temporário.
- Bootstrap: sete casos; registro metadata fechado/imutável, stamp novo, conta/ID,
  recusa de segredos/campos extras, plataforma indisponível e limites.
- Um caso adicional fixa guard/signal capturados contra alteração das options.
  Foi selecionado junto dos sete de bootstrap: 8/8, 1.42 s, oito não selecionados.
- Sessão inicial: 11 casos, 1.72 s; persistência antes do RPC real, resposta perdida,
  fence antes do commit, resolução depois do commit sem falso cancelamento,
  conflito de nonce, recibos/contadores/origem inválidos, CAS, conta e concorrência.
- Dois casos de páginas: 2/2, 1.61 s (11 não selecionados); dois de getters públicos
  e respostas tardias: 2/2, 1.55 s (13 não selecionados).
- Upload: oito casos, 1.91 s; bytes exatos/final curto/hash, chave sem alterar
  checkpoint, repetição, novo driver, corrida de duas cópias, confirmação inválida,
  conta e cancelamento durante espera. Serviço real chega a bytes-verified.
- Transporte: seis casos iniciais, 1.81 s; um novo método list, 1/1, 1.39 s
  (seis não selecionados). Defaults adiam Firebase e preservam erro sem retry.

Não houve rodada global única de 46. Mapas de armazenamento usados nos testes
unitários não substituem a prova nativa abaixo.

## Chromium nativo — oito cenários distintos positivos

Bootstrap: 7/7, sem falhas. IndexedDB real prova CAS anterior à chave,
reinício completo, comparação do pedido inteiro mesmo com stamp igual,
paginação limitada/conta, aborto da escrita, recusa de registro malformado sem
apagá-lo e concorrência entre abas com uma única criação.

Fluxo integrado: 1/1, sem falhas. OPFS/IndexedDB/Web Locks/WebCrypto reais,
arquivo de 15408 bytes, inspeção local, start com resposta perdida, reinício,
retomada original, append com resposta perdida, segundo reinício e preparação
real até activation-ready. Raiz ausente, revisão privada válida e journals locais
vazios. Não chamou activateBookRestore.

O fixture percorreu 194 unidades de preparação, checkpoint 195, 397 chamadas RPC
e 389 pedidos HTTP de chave. São contagens locais, sem medição de latência ou
custo de produção. Não alterar requisitos de autorização para reduzir números
sem evolução explícita e validada do contrato.

Services/handler HTTP de chave reais contra banco em memória com timestamps
nativos; identidade e SDK callable simulados em perfil isolado, sem chamadas
de produção. O handler de chave confere headers de teste e a recuperação original.
Não comprova Auth/App Check/Firestore/Storage de produção.

Runners/JSON QA externos m48-bootstrap-browser e m49-file-to-review-browser.
Perfis e artefatos fora do Git, sem arquivos reais de manuscrito no repositório.

## Checks e limites

Formato, lint dirigido, typecheck, arquitetura, documentação e diff verificados
no fechamento. Lint inicialmente apontou uma asserção de tipo redundante no
cursor; removida, e só o arquivo afetado foi repetido. Nenhuma correção alterou
contrato do servidor ou relaxou teste. Revisão conferiu origem, persistência antes
de RPC, CAS, fórmula de checkpoint e preservação na perda de resposta.

É o núcleo de inspeção/início/upload. Cancelamento de job existente,
revisão/ativação/mídia/limpeza duráveis no cliente e UI do Estúdio continuam.
Um job confirmado na resolução inicial não é job cancelado.

Roundtrip integral/consumidores/inventários/writers/exclusão/legados/rollout/
validate de P1, fases 3–5 e gates humanos/comerciais continuam. Modo indexado
padrão false. Build/validate global não repetidos; suíte global no fechamento de P1.
Só commits locais, sem CI, push, PR, merge, deploy ou subagentes.
