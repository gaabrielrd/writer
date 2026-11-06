# ADR 0295 — cópia editorial literal e confirmação nativa por unidade

- Estado: implementação local interna; testes preparados sem execução.
- Data: 2026-11-04.
- Complementa a [ADR 0294](0294-editorial-restore-inventory-and-projection.md);
  substitui sua posição do cleanup editorial em relação à barreira da capa.

## Contexto

Um DTO histórico próximo de 8 MiB pode ultrapassar o limite ao expandir IDs. A
validação nativa de arquivos novos usa ponteiros e índice semântico próprios,
sem o valueHash do ponteiro legado. A cauda editorial também altera a posição
do rascunho relativa ao EOF. A limpeza v15 precisa respeitar a exigência já
existente de fechar a capa antes das fases que removem recursos.

## Decisão

Preservar o JSON original em partes de 64 KiB, com identidades projetadas nos
descritores. Reservar antes dos bytes; consumir provas nativas na transação;
fechar SHA/corpo/registro após confirmar a última parte e confirmar o nascimento
do registro na unidade seguinte. Separar hash semântico certificado e hash do
wire. Não reescrever um DTO grande nem ampliar limites para acomodar expansão.

Admitir preparo v2 apenas por opção interna desligada por padrão, mantendo
retomada de reservas nativas independente da admissão. Métodos internos não
entram na lista pública. Localizar o rascunho pela ordem e pelos totais da fonte
certificada, conservando tipo/ID e verify(tx).

No cancelamento v15, revogar personas e fechar a capa antes da limpeza editorial;
esta certifica partes/headers vazios e avança para resource-children. Preservar o
verificador do job e os inventários antigos sem relaxamento.

## Consequências

Materializado não significa ativado. Ainda são necessários estados editáveis,
projeção dos vínculos no consumidor/exportador, censo físico, revisão, ativação,
recaptura e exclusão. Não restaurar consentimentos, débitos ou execução antiga.
O novo caminho de bytes não resolve sozinho a portabilidade de ciclos repetidos.
Ver o [incremento 47](../tasks/producao-literaria/47-materializacao-editorial-privada.md).
