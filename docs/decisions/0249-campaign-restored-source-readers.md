# ADR 0249 — Identidade das fontes nos leitores de campanhas restauradas

- Data: 2026-10-29.
- Estado: aceita para leitores internos; produtor persistente ainda ausente.
- Relacionada: [0244](0244-campaign-backup-origin-review.md),
  [0248](0248-campaign-derived-semantics-and-review.md).

## Contexto

Restaurar cria uma base privada com nascimento novo. Comparar o nascimento das
fontes com o nascimento dessa cópia poderia liberar conteúdo antigo depois de
excluir e recriar uma aventura, universo ou ficha sob o mesmo ID. A evidência
autenticada do arquivo deve acompanhar a base e seus itens.

## Decisão

A base usa sourceMode=restored e sourceEvidence fechada com schemaVersion 1,
archiveHash e testemunha portátil de base. Ausência dos dois campos conserva
capturas nativas existentes; presença parcial, nula ou malformada falha fechada.
A testemunha conserva o ID antigo da base e os nascimentos originais; o endereço
privado usa os IDs novos da campanha/base. capturedAt e fontes devem concordar.

Cada item restaurado exige testemunha disponível do mesmo arquivo/base antiga,
sourceKey e origem. Projeções que não selecionam a prova privada relêem somente
metadata para conferir o vínculo. DTOs públicos não recebem discriminantes/provas.
A verificação usa o mesmo núcleo de autorização exata da revisão de arquivos,
extraído sem ciclo com leitores/inventário de backup.

Exigir dono, versão, ausência de exclusão/reserva C4 e nascimento nativo exato
da aventura; lore global exige também universo/ficha originais; lore local exige
a ficha original e vínculo à encarnação autorizada da aventura. Nanosegundos
participam da identidade. Edições posteriores legítimas não substituem o conteúdo
congelado. As verificações antecedem snapshot/corpos nos leitores alterados.

A marca é da base e não da campanha inteira: uma captura candidata nativa pode
ser adotada normalmente depois da restauração. Âncoras retidas carregam a prova
da sua própria base privada. O universo organizacional da campanha não muda a
fonte congelada. Notas próprias permanecem independentes da revogação das fontes.

## Consequências e limites

Não há escrita persistente de restauração, migração, endpoint ou novo formato
público. Somente o produtor servidor futuro poderá gravar as provas, extraindo-as
da revisão autenticada do mesmo arquivo; campos do cliente não são autorização.
O arquivo assinado isoladamente não é grant. Antes de habilitar esse produtor,
integrar a prova aos leitores de backup/reexportação, fechar referências opacas
e ampliar inventário/cleanup C4 v1–v4. Upload/retomada, remapeamento/materialização,
ativação, Estúdio e ciclos continuam pendentes. A semântica legada nativa não
é alterada para inferir novas provas a partir do nascimento da cópia.
