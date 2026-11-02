# P1 / M25 — Escrita e versões de capítulos grandes

## Objetivo

Salvar texto lógico e manter versões manuais/anteriores à restauração sem
truncamento ou duas cópias de 8 MiB na mesma transação. Ativação P1 permanece
bloqueada até coleta/exclusão/conversão/chat e demais recursos integrados.

## Requisitos e solução

- Planejador de corpos por transação, criado dentro do callback de retry:
  referências agrupadas por geração e deltas somados antes de gravar.
- Texto novo acima de 512 KiB usa M23; texto idêntico reaproveita a geração.
  Escrita exige CAS pelo conteúdo lógico; recibo repetido não substitui texto
  posterior. Criação/replay devolvem conteúdo lógico, nunca null como vazio.
- Corpo tem pins positivos quando referenciado pelo capítulo ou versão.
  Soltar último pin muda para unreferenced/pins zero. Não expirar versões,
  ressuscitar geração sem referência nem apagar bytes nessa transação.
- Versão nova de capítulo com corpo externo usa manifesto v2 com referência
  e comprimentos dos segmentos UTF-8. Resumo/API permanecem lógicos; versões v1,
  cenas e blocos conservam seus formatos.
- Leitura de segmento usa até duas partes físicas, verifica contexto/hash/
  nascimento e decodificação estrita. Não depende de capítulo ainda existir.
- Restauração cria versão anterior e troca texto/ledger/referências/recibo juntos.
  Reutiliza geração da versão quando existente. Deltas compartilhados impedem
  perder pins quando captura anterior e escrita tocam o mesmo corpo.
- Exclusão explícita da versão solta pin uma única vez ao marcar deleting;
  excluir capítulo solta somente seu pin, preservando todas as versões.
- Nenhum novo grant SDK, transporte de mutação, dependência, limite reduzido ou
  mudança visual. Escritores de servidor existentes são a fronteira de escrita.

## Tarefas e aceites

1. [x] Planejador de corpos/pins e criação/escrita/replay com texto lógico.
2. [x] Histórico v2 por referência, leitura compatível e restauração atômica.
3. [x] Exclusões lógicas ajustam somente seus pins, com replay seguro.
4. [x] Testes dirigidos e SDK real, revisão/documentação e commit local.

## Suposições, riscos e pendências

A origem já é livro próprio ativo, autorizada antes do planejador. Manifesto
interno não concede acesso. Um planejador deve ser compartilhado por todas as
mudanças da mesma transação; não compartilhar entre retries ou pedidos.

Até 8 MiB de texto novo por escrita; versão anterior externa guarda referência,
evitando duplicação no limite transacional. Campos/livros legados continuam
sujeitos aos limites lógicos existentes. UTF-8 pode dividir caracteres nos chunks
físicos; comprimentos de segmentos textuais preservam a API do histórico.

Coleta física de unreferenced e inventário de exclusão de livro, conversão e
aplicação do chat são próximos passos obrigatórios antes da ativação, juntamente
de demais recursos/campos grandes, personas/mídia, autorização/host/UI/roundtrip.
Suite integral no fechamento P1; CI ignorada e somente commits locais.
