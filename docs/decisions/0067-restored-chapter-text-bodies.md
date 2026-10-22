# ADR 0067 — Corpo imutável de capítulo e limpeza v5

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M23](../tasks/writer-v2/execucao/56-texto-grande-na-preparacao.md).

## Decisão

A rejeição nativa de content demonstrada em M22 não altera o limite lógico de
8 MiB. Acima de 512 KiB UTF-8, prepareRestoredChapterText projeta texto em
bookTextBodies/bodyId e até 128 chunks binários de 64 KiB. O capítulo guarda
content null e contentStorage explícito, com versão, identidade, hash e tamanho.
Abaixo ou no limiar permanece inline. Strings inválidas e excesso são recusados.

bodyId deriva de dono/livro/capítulo/operação/hash em domínio versionado. Corpo
nasce ready com um pin do capítulo. A geração imutável permite que integração
futura do histórico referencie bytes existentes, sem copiar dois textos grandes
na mesma transação. Pins de versões, troca de texto e coleta ainda não existem.

advanceBookRestoreStructure grava corpo/partes/capítulo/ledger e journals junto
do cursor/recibo, em até 136 documentos nativos e seus journals. Ledger recebe o
texto original, sem contar null como manuscrito vazio. Não cria a raiz nem expõe
o método no transporte público. A unidade que usa corpo atualiza cleanupVersion
para 5; preparações pequenas continuam em v4. validationCheckpoint é fixo em
ambas as versões. Guardas preservam jobs e inventários v1–v4.

## Leitura

readBookChapterText é um leitor interno transacional. O chamador precisa
autorizar e ler o projeto/recurso antes de usá-lo. Não é uma API de autorização.
Confere representação única, dono/livro/capítulo, manifesto fechado, estado e
pins positivos. Cada parte confere índice, contexto, tamanho, SHA-256, nascimento
com o corpo e imutabilidade nativa. Confere hash total e UTF-8 estrito, preservando
BOM e caracteres divididos entre partes. Conteúdo externo inválido, ausente ou
ambíguo falha; content null sem manifesto nunca produz string vazia.

O SDK cliente continua negado para os novos corpos. Ainda não há hidratação
no editor, exportação ou outros consumidores do livro ativo. Nenhuma restauração
com esse esquema pode ser ativada antes dessa integração.

## Limpeza

V5 cancela entrando em body-artifacts. Seleciona um cabeçalho por vez, valida
seu journal/recibos nativos e remove até o limite de pares parte+journal. Somente
quando não há filhos remove cabeçalho+journal. Certifica ausência de corpos e
journals tipados antes de seguir para artifacts e demais fases existentes.
A certificação final também inclui o namespace dos corpos.

A limpeza lê máscaras sem prose. Contexto diferente, alteração, ABA, journal
ausente ou pai ausente com journal restante interrompem sem apagar a página.
Não é coleta forense de órfãos arbitrários criados fora do protocolo por Admin:
manutenção administrativa deve respeitar reserva, inventário e atomicidade.

## Evidência e limites

114 testes Node dirigidos passaram. SDK real comprovou a jornada de fonte de
1.100.000 bytes, limpeza de 22 artefatos e bloqueio de leitura cliente. Uma prova
isolada de capacidade gravou/leu 8.384.512 bytes e 133 artefatos nativos/journals
na mesma transação. Essa prova não percorre validação de arquivo ou UI de 8 MiB.

Outros campos grandes continuam sujeitos ao limite nativo: o teste de falha
atômica agora usa título de 1.100.000 bytes, preservando fonte/estado sem truncar.
Faltam consumidores completos, edição/pins/coleta, demais recursos, perfis/mídia,
reautorização/ativação e host/UI/roundtrip. P1/F2-09 seguem abertos. Validate
integral fica no fechamento P1; CI ignorada e commits somente locais.
