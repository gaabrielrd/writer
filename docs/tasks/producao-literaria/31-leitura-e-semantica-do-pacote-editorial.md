# Incremento 31 — Leitura e semântica do pacote editorial

Estado: implementação local e testes preparados; nenhum teste ou check executado neste incremento. Não habilita exportação nem restauração editorial.

## Contrato do pacote

O leitor passa a aceitar explicitamente `writer-book-archive` v1 (sete seções) e v2 (oito, com `editorial` ao final). A versão do contêiner permanece 1; a dos DTOs editoriais também é 1. A versão padrão do produtor continua 1.

Cabeçalho canônico, ordem das seções, contagens físicas por seção, footer, selo e EOF são conferidos para a versão efetivamente lida. V2 com cabeçalho/contagens v1 é inválido; não há fallback. Checkpoints do parser preservam a versão e suas contagens. `envelope-only` continua sem autorização semântica ou de restauração.

## Núcleo semântico compartilhado

A máquina usada pelo navegador e pelo validador incremental do servidor recebe a versão real do manifesto. O estado v1 mantém sua forma anterior; somente v2 acrescenta contadores e estado editorial. A seção tem artefatos, links e controle terminal obrigatório com contagens lógicas exatas e `presence: captured`.

Artefatos e links são normalizados pelos DTOs fechados do incremento 30. IDs duplicados, IDs de frame divergentes, referências locais registradas ausentes, evidências com tipo errado, revisão de artefato divergente, substituições conflitantes e ciclos são rejeitados. O papel de cada referência é determinado por sua posição declarada, impedindo que o mesmo ID passe como decisão substituída e evidência.

Referências são processadas em lotes de até 64, vinculados ao hash e identidade do item original. A continuação normaliza o mesmo DTO aceito inicialmente. A conferência de ciclos avança um elo por unidade, com cursor constante, sem conjunto ilimitado de visitados no checkpoint de 16 KiB. Cadeias extensas podem exigir várias unidades de validação.

O índice temporário contém tipos, identidades, revisões, hashes e arestas; não retém prosa, citações ou justificativas dos artefatos. Fontes externas não são abertas. Descritores indisponíveis permanecem explícitos; referências nativas observadas e hashes lógicos ainda não comparados produzem aviso, sem certificar a versão citada. Disponibilidade de fonte e autorização são verificações distintas.

## Portões preservados

O servidor compara a declaração nativa do upload com o manifesto lido, tanto na entrada quanto na conclusão semântica. Declarar v1 e enviar bytes v2 corretamente selados não contorna o portão de versão.

A UI de restauração rejeita v2 antes do fingerprint/revisão de confirmação; nunca o reclassifica como v1. A reserva de upload ainda aceita somente archive v1. Preparação e ativação têm recusas explícitas adicionais para v2. Esses portões só poderão ser removidos após captura consistente, inventário/cleanup, materialização utilizável e ativação completos.

Não foram criadas Functions, ações, Rules ou recursos de restauração novos. A exportação atual permanece com sete seções. Um relatório semântico de v2 não autoriza preparar ou ativar cópia.

## Casos preparados

25 casos adicionais, todos sem execução: 8 de framing/versão/selo/EOF, 15 de conteúdo editorial e paridade com o parser incremental do servidor, 1 de upload nativo v1 com bytes v2 e 1 do bloqueio da UI com descarte do índice temporário. A fixture compartilhada aceita versão explícita, mantendo v1 como padrão.

Ainda faltam as validações finais e a prova em SDK real. As métricas da rodada anterior não cobrem os incrementos 24–31. O objetivo integral permanece ativo, com 0/5 etapas formalmente encerradas.

## Continuação

Capturar cada família editorial com prova consistente e reautorização das fontes derivadas. Coordenar os writers que alteram checkpoints sem tocar a raiz; o token atual do backup não cobre sozinho essas alterações. Depois ampliar inventário/cleanup, preparar contrato e fichas utilizáveis, preservar histórico privado e ativar atomicamente com revisão explícita. Só então habilitar os produtores e a restauração v2.

Antes dos testes finais, buscar e incorporar novamente a principal preservando as alterações da worktree. Não há commit, merge de retorno, push ou deploy deste incremento.
