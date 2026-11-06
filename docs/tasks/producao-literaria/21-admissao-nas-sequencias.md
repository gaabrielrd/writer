# Incremento 21 — Admissão por unidade nas sequências

Implementado em código, sem testes ou validações executados neste incremento.
O objetivo integral permanece aberto, sem commit, integração de volta, push ou deploy.

## Comportamento

advanceLiterarySequence recebe admissionInspectionId e, na primeira unidade do lote,
previousWorkflowId explícito. Nas unidades seguintes conserva a predecessora concluída
pela própria sequência. As condições pertencem à entrada, sem filho já registrado.

A exigência sem inspeção produz parada publication sem criar filho, gerar ou debitar.
O driver encaminha a prova ao scope e ao registro nativos do ciclo. A seleção integra
fingerprint, pedido e ação congelados; replay não troca a inspeção. A retomada consulta
somente a referência privada original, valida formato e fingerprint e repete os IDs
originais, sem reconstruí-los a partir da tela atual. Pedidos antigos conservam o formato.

O painel recebe o contrato salvo e apresenta a inspeção do capítulo corrente. A escolha
é vinculada a índice, origem da sequência e revisão do contrato. Uma entrada posterior
no livro permite escolher o ciclo externo da predecessora e a integração do ato.
Ao registrar o filho ou mudar índice/origem, limpa a escolha em RAM sem apagar a
intenção metadata persistida. A próxima unidade sem prova interrompe o loop autorizado.

Nenhuma ação, coleção, Function, dependência ou preço novo: 435 ações nos 16 setores.

## Casos preparados

- Parada de publicação sem filho, geração ou débito.
- Primeira unidade admitida pela inspeção e recusa de substituir a prova em replay.
- ACK perdido após registro do filho, recuperando a mesma ação e inspeção congeladas.
- Entrada no meio do livro com ciclo predecessor externo explícito.
- Host bloqueado antes da escolha e conservação do ID no avanço incerto.

Nenhum teste, tipo, lint, formato, build, navegador ou cobertura foi executado neste
incremento. A fixture salva a política antes de capturar o scope do lote. O teste do
host simula a seleção; não substitui o painel real ou a prova de navegador.

## Pendências do plano integral

A auditoria em leitura confirmou que a análise de lore ainda não usa o contexto
editorial comum; o inventário de impacto não cobre ciclos, sequências e inspeções e
não há visão de impacto no painel; o pacote .writer não inclui o processo editorial
completo. Continuam aceites E1–E4, fechamento E5, revisão/formatação e gates integrais,
incluindo cobertura de funções de pelo menos 90%, sem redução do limiar.

Antes dos testes finais, conferir/incorporar a principal conforme solicitação do autor.
Última base incorporada identificada: 16d8af5. Resultados antigos não comprovam as
alterações posteriores. A falha anterior ao registrar este incremento foi de cota da
revisão automática de aprovação; não houve avaliação de insegurança.
