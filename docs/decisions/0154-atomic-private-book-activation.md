# ADR 0154 — Ativação atômica da cópia privada de livro

- Status: núcleo implementado/validado localmente; mídia/limpeza/host/P1 pendentes.
- Data: 2026-10-25.
- Plano: [133](../tasks/writer-v2/execucao/133-revisao-e-ativacao-do-livro.md).

## Decisão

activateBookRestore é serviço interno, com entrada fechada e CAS. Revalida
revisão final e itens autenticados, verifica a geração Storage fora da transação
e compara novamente a mesma revisão na transação de ativação. Mudança de acesso
ao universo exige uma nova revisão explícita; não descartar vínculo em silêncio.

No mesmo commit: raiz nova privada/draft com dados próprios literais, clocks e
barreiras nativas; countReady true; lote de personas active com recibo final;
vínculo/contador estritos de universo; registro/uso da capa quando presente;
remoção do marcador deletedBooks e da chave de recuperação; job activated e
recibo. A reserva permanente e provas anteriores permanecem. Não recontar nem
reescrever capítulos, lore, fontes, versões ou corpos.

Raiz preserva a persona declarada remapeada. Quando há vínculo de livro, confere
binding, definição e perfil instalado originais. Lote torna todos os perfis
preparados disponíveis juntos, sem modificar seus textos. Perfis continuam na
biblioteca após exclusão normal do livro, conforme contrato existente.

## Confirmação e autoridade

Descritor fechado de ativação fixa operação, fingerprint, revisão, checkpoint,
data e estado inicial de mídia. Job terminal fica imutável. Loader exige reserva
imutável do nascimento original, recibo imutável e updateTime do job igual ao
nascimento do recibo; recomputa o fingerprint e confere preparação/descritor.

Consulta e replay são históricos: não leem a raiz atual, não retornam conteúdo
e não recriam o livro após exclusão. Consumidores reautorizam o livro atual.
Preparação/cancelamento/limpeza anteriores recusam novos efeitos em activated.
Protocolos futuros de mídia e limpeza terão progresso próprio, sem regravar
job/recibo/reserva originais e quebrar essa prova.

restoreOrigin na raiz é metadata de procedência, não grant. Rules recusam forja
na criação cliente e preservam o campo nas atualizações. Alterações normais de
título continuam possíveis.

## Mídia e limites

A capa importada é registrada em imageLibrary como preparing, url null e
useCount 1, com uso do livro e prova nativa de Storage. Registro ou uso órfão
estrangeiro bloqueia o commit. Enquanto preparing, a imagem não pode ser
selecionada como ativa; accepted false e ausência de download token permanecem.

mediaState pending no descritor é o estado inicial, não uma certificação de mídia
pronta. Finalização deve liberar Storage com precondições e concluir registro/URL
após reautorização. Não existe transação distribuída Firestore/Storage.
Nenhum endpoint ou fluxo final de UI foi exposto neste núcleo.

Finalização da mídia, limpeza pós-ativação, host/roundtrip integral, inventários/
writers/exclusão/legados, rollout/validate de P1 e demais fases/gates continuam.
[Evidência](../entregas/2026-10-25-writer-v2-ativacao-atomica-de-livros.md).
