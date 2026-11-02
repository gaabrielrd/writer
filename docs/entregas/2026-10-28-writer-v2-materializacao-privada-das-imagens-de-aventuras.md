# Writer V2 — materialização privada das imagens de aventuras

Data: 2026-10-28. Base: 14a9a72.
[Plano 182](../tasks/writer-v2/execucao/182-materializacao-privada-das-imagens-de-aventuras.md)
e [ADR 0204](../decisions/0204-adventure-private-image-storage-materialization.md).

## Implementado

Restauração interna reserva uma intenção nativa antes do upload de cada PNG.
Confere vínculos, heads, descritores, frames e SHA completos; decodifica a imagem
com Sharp sem alterar os bytes. O adaptador de capas passa a ser compartilhado
com alias histórico preservado. Dois usos da mesma origem continuam distintos.

Replay evita novo I/O; ACK perdido/rollback retoma a geração privada existente.
Cancelamento revoga personas e confirma um fence por intenção antes de descartar
fonte/frames. Também bloqueia upload retido antes ou depois da gravação externa.
Intenções/journals e seus recibos comprovam cada avanço; marcadores permanecem.
Não há biblioteca/usos/URL, ativação ou callable/UI.

## Testes dirigidos

17 Node novos positivos em seleção conjunta de 21.193,854 ms. O caso de limite
materializou e cancelou um PNG válido com exatamente 16 MiB e 256 frames em
19.965,418 ms. Demais casos cobrem reserva anterior a I/O, nulos, replay/CAS,
ACKs perdidos de Storage/Firestore, rollback, ordem revogação/fence/limpeza,
cancelamento antes/depois do upload, PNG inválido/truncado, falta de adaptador,
objeto estrangeiro, fonte/frame/intenção/head alterados entre observações,
registros recriados, metadados e pedidos fechados. As seleções finais dos campos
de cursor/contagem e cleanup também passaram após ampliar os invariantes.

Um Vitest novo passou com arquivo completo gerado pelo Writer: 3,51 s totais e
738 ms de testes. Três bindings (um nulo), dois PNGs reais distintos por recurso,
privacidade dos bytes, manuscrito preservado e cleanup dos dois ativos. 36 Node
de regressão dos protocolos antigos, incluindo sete casos GCS wire, passaram
em 660,785 ms. Comparação do adaptador compartilhado com a versão commitada
confirmou igualdade byte a byte exceto o nome da factory.

Um teste integrado de SDK Firestore e GCS reais passou em 145.753,570 ms.
Firestore demo 1.22.0 e servidor GCS HTTP local comprovaram reserva concorrente
idempotente, nascimento conjunto de intenção/journal/recibo, rollback após upload,
retomada da mesma geração, biblioteca ausente, Rules privadas, fence com ACK
perdido, preservação da fonte até confirmar fence e limpeza completa com marcador.
JVM dedicada encerrada no finally; processos já ausentes na conferência final.

Primeira seleção teve 10/11 positivos: uma asserção confundiu a substring
sourceIndex com resourceIndex. Foi corrigida para conferir a chave privada
completa. O primeiro Vitest não encontrou Sharp na raiz; passou a usar o gerador
das Functions, onde a dependência já existe. Sem nova dependência ou relaxamento
de testes. A consulta de cleanup passou a usar kind/cursor de nome, evitando
depender de índice composto não declarado.

## Fechamento do bloco

Formatação, ESLint/sintaxe dos arquivos alterados, docs/arquitetura/styleguide e
diff dirigidos passaram. A primeira execução integral passou os portões iniciais
e as 32 partições do lint, mas a coleta de bookLoreVisibilitySelection falhou:
digest indisponível durante inicialização de bookRestoreUploadContracts. A falha
foi reproduzida isoladamente. O helper restoredImageRemoval de 181 importava esse
contrato operacional e formava um ciclo com imageLibrary/sceneContracts.

Essa execução foi interrompida após comprovar a falha, encerrando apenas os
descendentes do processo verificado da validação. O wrapper terminou não verde
em 456,16 s, código 4294967295. Log/status originais foram preservados; não é uma
execução integral aprovada e as etapas seguintes não são consideradas executadas.

O leitor passou a validar IDs e nascimento nativo sem importar a orquestração,
preservando exatamente os limites anteriores. Os dez casos existentes da retirada
passaram em 108,475 ms, e um novo caso de IDs/nascimento inválidos passou em
104,606 ms. O arquivo de lore que antes não coletava passou com 20/20 casos,
80,61 s totais/79,08 s de testes. Nenhuma assertiva ou cobertura relaxada; o SDK
longo de retirada não foi repetido porque seu protocolo de I/O não mudou.

As duas tentativas não verdes acima/abaixo permanecem registradas; não são
atribuídas como aprovação ao código novo. A terceira execução e seu fechamento
local estão registrados ao final. CI remota ignorada conforme orientação;
nenhum push/PR/merge/deploy/agente.

## Limites

image-storage-ready não ativa aventura, imagens ou personas. Biblioteca/usos,
agregados/audit/ativação, aceitação/URL posterior, recuperação cifrada/UI/roundtrip,
P3/D/F2-09 e fases/gates seguintes permanecem obrigatórios. Macro 8/35 não muda.

## Segunda tentativa integral e compatibilidade das fixtures

A segunda execução integral encerrou naturalmente com código 1 em 1.076,46 s.
Passaram as verificações iniciais e 32 partições do lint. Frontend: 330 arquivos
positivos e um reprovado, 4.324 testes positivos de 4.325, em 800,17 s.
Cobertura permaneceu acima dos limites: statements 89,94%, branches 85,71%,
functions 91,12% e lines 93,24%. Scripts/Functions/build posteriores não foram
executados nesse comando, e essa tentativa também não é gate verde.

O único caso reprovado era owner-deleted original cover de
bookRestoreFinalizationViews: sua fixture ainda fornecia somente remove e não
o adaptador retireRestoreImage agora necessário. A reprodução isolada confirmou
a ausência do adaptador. A fixture passou a usar a retirada real de f.assets,
mantendo todas as verificações de indisponibilidade e sem alterar produção.
Os cinco casos do arquivo passaram juntos em 3,94 s totais/2,35 s de testes.

A inspeção de todos os consumidores de createImageLibraryService também encontrou
a mesma ligação antiga na fixture SDK bookRestoreArchive. Ela foi atualizada,
sem mudar suas assertivas de limpeza e preservação da capa excluída. O teste SDK
real dessa fixture passou no demo local em 191.629,233 ms, incluindo exclusão da
fonte autenticada, dados editados preservados e ausência de reconstrução da capa.
JVM dedicada encerrada no finally e ausência do processo reconferida. Os demais consumidores ou já ligam a
retirada real ou exercitam imagens legadas/métodos sem exclusão restaurada,
incluindo o caso negativo que exige recusa do adaptador ausente.

A terceira execução integral, após essas correções, está registrada a seguir.
Nenhum limite, cobertura, teste ou verificação foi reduzido ou desabilitado.

## Terceira execução integral e revisão final

Após corrigir as duas fixtures, npm run validate encerrou naturalmente com
código 0 em 1.509,18 s. Passaram skills, arquitetura, documentação,
styleguide, formatação integral e as 32 partições de lint. Passaram 4.325 testes
frontend em 331 arquivos, 90 scripts e 3.579 Functions.
Frontend: 796,12 s; cobertura statements 89,94%, branches 85,71%, functions 91,12%
e lines 93,24%, com todos os limites preservados. Sintaxe de 366 módulos das
Functions, typecheck, bundle e smoke positivos.

Os 24 hashes de código/testes congelados no início desta execução foram
reconferidos sem alterações. A revisão final examinou fases/recibos/journals,
ordem de revogação/fence/limpeza, privacidade, alias compartilhado e as correções
das fixtures. Sem novo achado bloqueador identificado. Checks documentais e
diff/preflight de escopo são reconferidos antes do commit local com hooks normais.

Essa execução fecha o grande bloco local de mídia 180–182. Não prova ativação,
UI/roundtrip, bucket produtivo ou lançamento da V2. Permanecem os limites e
pendências descritos nesta entrega; macro 8/35 inalterada.
