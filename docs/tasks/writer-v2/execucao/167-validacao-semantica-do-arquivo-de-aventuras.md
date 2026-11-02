# P2 — validação semântica independente do arquivo de aventuras

Base: d937c96. Captura implementada; wrapper integral de 166 ainda pendente após
timeout individual corrigido. Este bloco executará o próximo fechamento integral.
Validar dados inertes antes de qualquer reserva, upload utilizável ou ativação.

## Descoberta e limites

Grafo consultado, resultados insuficientes. bookBackupContent/bookContentMachine,
bookRestoreContentRead, bookValidationIndex, codecs de aventura e todos os
manifestos atuais conferidos. Não importar internals de book-portability nem
adaptar relatório de livro por cast.

Índice temporário existente é OPFS cifrado (AES-GCM e nomes HMAC), com chaves
efêmeras e entrada de 16 KiB; não IndexedDB. Reutilizar somente primitive neutra
demonstrada, preservando namespace/comportamento de livro. Índice guarda identidade/
hash/referência limitada, nunca projeto/prosa inteira em RAM ou entrada gigante.

Framer/envelope só conferem bytes/ordem de seções. Arquivo externo não concede
ownership, acesso a universo/lore, perfil existente ou uso de imagem. Validação
semântica também não concede autorização remota.

## Implementação sequencial

1. Contratos puros de dados fechados, limites e erros próprios da aventura.
   Lista de campos de resources deve ser compartilhada como configuração pura,
   sem importar módulos Node/transações no navegador. Preservar codecs/writers.
2. Reader/máquina com JSON limitado por unidade, partes contíguas de 64 KiB,
   hash independente, manifesto por seção e estado limitado/checkpoint explícito.
   Texto histórico fixed64k pode cortar UTF-8: validação incremental deve preservar
   estado de continuação entre partes/checkpoints. Draft utf8-parts é distinto.
   SHA retomável usa hash-wasm 4.12.0 já instalado em Functions; conferir engine
   nova/interleaving e tamanho do checkpoint, sem dependência ou I/O novos.
3. Validar estrutura e 17 tipos de recursos, IDs/endereço por tupla, presença/
   ausência, corpo/hash, ordens/ranks, planeamento e referências. Resolver vínculos
   obrigatórios por índice; separar avisos de referências antigas/externas e
   formerParentId, sem ressuscitar recurso removido.
4. Lore local completo com tombstones, pares head/body e relações; persona
   raiz/cena com perfil fechado ou null explícito, herança e overrides preservados.
   Origem de universo deve combinar com raiz e continuar hint sem grant.
5. Histórico: cabeçalho original, manifesto de corpo vinculado por headerHash,
   bytes/quantidade/SHA/UTF-8 completos, vazio e snapshots de recurso removido.
   Contagem nativa é distinta da portátil e será reconstruída no restore.
6. Draft explícito: referência/hashes dos JSONs salvos, metadata e texto íntegro.
   Nenhum journal/pedido/credencial. Imagens: binding para toda cena/bloco,
   metadata/PNG/SHA e coerência com heads, cada grant independente.
7. Validar manifestos/digests/counters e todas as relações pendentes em etapas
   limitadas. Relatório content-only, sem ativar nada. Erro/abort não deixa
   relatório positivo; não aceitar cursor de arquivo como checkpoint confiável.
8. Wrapper público no cliente com hash incremental e índice temporário protegido;
   dispose após sucesso/falha, preservando erro primário e eventual falha de limpeza.
   Sem novos endpoints, alteração de Rules, UI ou restauração neste recorte.
9. Testes por arquivo real gerado no fluxo 166, comparação independente e arquivos
   adulterados com checksums válidos: campo extra, origem/ID, corpo/pai/hash,
   persona/lore, histórico/UTF-8, draft, PNG, manifestos, repetição/omissão/ordem,
   truncamento, falha/abort/limpeza e retomada da máquina. Importação nativa e
   conteúdos arquivados permanecem no corpus; arquivo privado não é grant.
10. Checks dirigidos após mudanças; validate integral no fechamento deste bloco
    com worker local limitado se necessário. Manter cobertura/regras inalteradas
    e encerrar a pendência formal de 166 somente com resultado real verde.
11. Revisão, ADR/docs/evidência e commit local. P2/P3/D/F2-09 permanecem abertos
    até transporte/UI/restauração/roundtrip/consumidores e seus próprios gates.

## Não escopo

Mesclar projeto, importar grants/conversas/chaves, duplicar universo, publicar,
habilitar vendas/deploy/CI, inferir licença comercial ou carregar PDF original.

## Aceites

- [x] Oito seções com DTOs/bytes/manifestos e relações conferidos independentemente.
- [x] Memória/checkpoints/índice limitados e protegidos; abort/erro sem aprovação.
- [x] Corpus positivo e adversarial com arquivos de framing válido.
- [x] Regressões de livro preservadas onde houver primitive compartilhada.
- [x] Checks/validate/revisão/ADR/evidência e commit local, sem concluir P2/P3/D.

## Fechamento — 2026-10-27

38 Vitest/66 Node distintos dirigidos e Chromium positivos. Validate integral
exit 0: 4.259 frontend, 90 scripts, 3.379 Functions, 323 módulos de sintaxe,
tipos/build/smoke. Cobertura acima dos limites, com um worker só no subprocesso.
Primeira tentativa interrompida sem resumo foi preservada, nunca aprovada.
Esta execução fecha a pendência formal de 166; código permaneceu igual ao snapshot.
[Revisão e evidência](../../../entregas/2026-10-27-writer-v2-validacao-semantica-de-aventuras.md).
P2/P3/D, F2-09, gates e contagem 8/35 permanecem sem mudança.
