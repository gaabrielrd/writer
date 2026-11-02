# P1 / M26 — Coleta e exclusão dos corpos

## Objetivo

Remover fisicamente gerações que M25 deixou sem referências e ampliar a exclusão
integral do livro antes de habilitar restauração/escrita em produção.

## Requisitos e solução

- Helper de limpeza limitado a um corpo do livro por transação, até 50 partes.
  Confere identidade/dono/livro/recurso/manifesto, estado/pins e metadados nativos
  das partes por máscaras, sem baixar prosa. Filhos sempre antes do cabeçalho.
- Coleta normal só aceita unreferenced com pins zero e raiz própria ativa.
  Gerações referenciadas não expiram. Raiz ausente ou em exclusão não é coletada
  pelo worker: o protocolo de exclusão integral é responsável por esse caso.
- Worker onDocumentUpdated próprio para bookTextBodies, com retry. Evento fixa
  nascimento do corpo; troca de encarnação recusa remoção. Reautorizar estado atual
  em cada execução, sem confiar no conteúdo antigo do evento.
- Cada lote atualiza gcRevision no cabeçalho na mesma transação, gerando o evento
  seguinte. Evento repetido/atrasado continua com segurança ou encerra se ausente;
  nunca ressuscitar geração nem depender do navegador para drenar a fila.
- Exclusão de livro adiciona inventário v2 com fase text-bodies, drenando filhos
  e cabeçalhos mesmo com pins remanescentes, somente após revogação da raiz.
  Jobs v1/sem versão retomam no mesmo cursor e atualizam inventário; finish antigo
  também confere corpos antes de excluir raiz/tombstone/vínculo.
- Versões/fases desconhecidas falham sem exclusão. Não apagar outro livro,
  publicação, universo ou corpo sem prova válida. Sem delete recursivo novo.

## Tarefas e aceites

1. [x] Helper de limpeza física com máscaras e guardas nativas.
2. [x] Worker por evento com continuidade/retry e proteção de encarnação.
3. [x] Inventário v2 de exclusão de livro e retomada compatível.
4. [x] Testes dirigidos/SDK reais, revisão, documentação e commit local.

## Suposições e riscos

Referências e a transição para zero são atômicas conforme M25. Nenhum escritor
reabre geração unreferenced; manutenção Admin respeita reserva e inventários.
Não é coleta forense de órfãos arbitrários criados fora do protocolo.

A prova SDK testa transações reais e o handler, sem comprovar entrega Eventarc
produtiva. Trigger precisa ser implantado junto dos escritores e da exclusão;
este incremento não autoriza deploy. Campos novos não exigem índice de consulta.

Continuam conversão e chat aplicador, demais recursos/campos grandes, personas/
mídia, autorização/ativação e host/UI/roundtrip. P1/F2-09 seguem abertos. Suite
integral apenas no fechamento P1; CI ignorada e somente commits locais.
