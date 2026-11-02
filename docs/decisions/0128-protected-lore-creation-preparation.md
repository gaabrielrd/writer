# ADR 0128 — Preparação protegida da criação de lore

- Data: 2026-10-24.
- Estado: implementado e validado localmente; checkpoint produtor/host pendentes.
- Plano: [113 / M38c5o](../tasks/writer-v2/execucao/113-preparacao-e-copia-protegida-da-criacao-de-lore.md).

## Decisão

Criar ticket próprio de criação antes da primeira RPC. IDs da reserva/ficha
derivam somente de UID/livro/writeId; hash da intenção e número de uploads são
preenchidos uma única vez após validar o input congelado. Ticket descobrível
mesmo durante hashing, reserva ou chave sem resposta permite cancelar por
metadados sem esperar produtor, rede ou crypto. Não guarda nome, prosa ou chave.

O banco writer.book-lore-journal passa a v3 com stores adicionais
creationTickets e creationFrames. Não reescrever formatos/keys dos stores
heads/frames/preparations de edição. Versão antiga recusa downgrade.
Compartilhar somente abertura/transação e provider HTTP da chave existente.

## Consistência e recuperação

Ticket tem schema fechado, escopo imutável, stamp de posse e estados
monotônicos. Claim fenceia instância anterior. Gravação do frame e progresso
ocorrem na mesma transação curta com Web Lock; crypto/rede ficam fora dela.
Confirmação depende de oncomplete. Metadados de reserva/chave/cancel/cleanup/
revoke são persistidos antes de cada chamada, conservando wire incerto exato.
Hash ainda nulo prova que uma reserva de chave própria não foi iniciada.

Draft inicial é imutável, em frames AES-GCM de até 64 KiB, com nonce e AAD
incluindo identidade/requestHash, seção, geração, tamanho e índice. O digest
também fica cifrado. Prefixo já gravado exige decrypt/comparação antes de
append; não sobrescrever frame existente. Cópia só confirma após todas as
partes e grant fresco. Leitura confere cifra, tamanho, SHA, UTF-8, schema e
intenção, além de autorização fresca antes/depois, sem persistir CryptoKey.

Reserva aceita com resposta perdida reconcilia a mesma intenção após recarga.
Sem primeira cópia completa, anunciar awaiting-draft e exigir input original;
não reconstruir texto do servidor nem inventar documento vazio.
A sessão Auth captura actor/host, obtém UID da conta e protege todas as lanes.
O provider compartilhado mantém HTTP privado com Auth/App Check, fingerprint,
AES-256 não extraível e limpeza do buffer temporário da chave.

## Cancelamento e descarte

Cancel conserva cópia e chave. Release explícito primeiro confirma o criador
cancelado e só depois revoga a chave própria, incluindo fence para reserva
incerta. Failed-precondition de cleanup leva a get antes de usar outra revisão.
Adoção conflitante não é jobsClosed e impede liberar chave/purgar.

Discard fixa geração e intenção monotônica antes da limpeza. Após jobs e
chave fechados, deletes, contador, remoção do header e fase compartilham a
transação; cada lote remove até 50 frames. Não tocar stores de edição ou
outra operação/conta. Estrutura/geração desconhecida aborta e preserva tudo.
Tombstone permanente impede novos frames; conclusão reconfere ausência real,
inclusive ao reabrir um marcador complete.

## Limites

Bootstrap só oferece initialize/snapshot/readDraft/cancel/release/discard.
Não oferece advance/apply. Cópia inicial não é checkpoint persistido do
coordenador de produção: integrar write-ahead privado, controles paginados e
ponte de resultado antes de dirigir produção ou habilitar host no compêndio.

Exclusão/lifecycle de chaves, outros writers/consumidores/backup, drenagem/
rollout e validate integral de P1 continuam pendentes. Chromium comprova
armazenamento/WebCrypto/Web Locks; backend usa serviços reais sobre fixtures
de banco/identidade, sem certificar Auth/App Check/SDK reais.
P1/F2-09/V2, fases 3–5 e gates humanos/comerciais permanecem abertos.
Sem dependência nova, backend/Rules alterados ou envio remoto.
