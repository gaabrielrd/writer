# P2 — materialização privada das imagens de aventuras

Base: 14a9a72. Sequência de 180/181, dentro da restauração aprovada.

## Requisitos e sequência

1. Extrair o adaptador existente para restoredImageStorage.mjs com alias de
   createBookRestoreCoverStorage preservado. Mesmo contexto sem bookId, paths,
   erros, provas decimais, metadata, fences, retirada e aceitação; sem duplicar
   protocolo nem mudar limites/dependências.
2. Acrescentar fases image-storage/image-storage-ready e seus contadores/cursor
   privado aos metadados/recibos. advanceAdventureRestoreImageStorage interno
   alterna reserva de um binding e materialização de um ativo; nulos não fazem
   I/O. Na reserva, fonte/head/binding/descritor comprovados e intenção durável
   em preparedRoot/image-storage-ID confirmam com journal/checkpoint/recibo.
3. Ler frames privados com provas nativas e arrays fechados; alocar somente o
   buffer de uma imagem de até 16 MiB. Conferir bytes/SHA completos e decodificar
   PNG inteiro com Sharp metadata/stats, sem recompressão. Revalidar todas as
   provas e pedido antes de stage/verify, e novamente antes do ACK transacional.
   Replay deve preceder I/O; resposta perdida não troca geração nem duplica ativo.
4. Ampliar endereço/journals e protocolo de cleanup antes das primeiras escritas.
   Primeiro revogar personas (179); depois um fence permanente por intenção,
   inclusive reservada sem ACK. Somente após todos os fences confirmados permitir
   o cleanup anterior de fonte/frames/targets. Não apagar marcadores Storage.
   Journals atualizados pelo cleanup preservam criador e confirmam recibo próprio.
5. Testes Node e arquivo nativo: dois usos de mesma origem, nulos/zero, bytes e
   PNG válidos/inválidos/truncados, replay/CAS/retry/rollback, provas alteradas/
   recriadas, falta de adaptador, ACK perdido e cancelamento em cada espera.
   SDK Firestore confirma intenção/fence/journal reais e limpeza; GCS wire já
   existente cobre CAS e geração, com novos casos se a integração justificar.
6. Revisão/ADR/docs/evidência/checks; fechar o grande bloco de mídia 180–182 com
   npm run validate local e commit somente local com hooks normais. Nenhuma CI.

## Suposições e não escopo

Nenhuma decisão nova de produto. PNG até 16 MiB e frames de 65.536 bytes mantidos.
Biblioteca e usos ainda não existem: serão criados com a ativação auditada da raiz,
e a aceitação/URL será posterior com respeito a mudanças do usuário. Não confundir
image-storage-ready com disponibilidade, nem criar imageLibrary preparing/useCount0
que o fluxo de exclusão poderia retirar antes da ativação.

A autorização do universo continua sendo revalidada na futura ativação. Não
mudar manuscrito, originais, acesso, permissões ou endpoints públicos. Permanecem
agregados/auditoria/ativação, recuperação cifrada/UI/roundtrip, P3/D/F2-09,
fases seguintes e gates humanos/comerciais. Macro 8/35 permanece.

## Aceites

- [x] Reservas nativas precedem I/O; PNGs exatos, privados e remapeados por recurso.
- [x] Replay/retomada e falhas não duplicam ou publicam imagens.
- [x] Cancelamento fecha uploads atrasados antes de descartar as provas.
- [x] Testes dirigidos/SDK e validate integral positivos; evidência e revisão final.
- [x] Fechamento por commit local com hooks normais e preflight de escopo.
