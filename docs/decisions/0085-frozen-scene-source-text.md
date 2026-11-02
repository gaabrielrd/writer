# ADR 0085 — Texto lógico das fontes de conversão

- Status: aceito para fontes congeladas
- Data: 2026-10-23
- Contexto: P1 M37a, depois da ADR 0084

## Problema

O formato admite itens de até 8 MiB. original.content de sceneSources ainda
dependia de um documento único, mesmo com capítulos grandes já representados
por partes. A restauração não podia preservar uma fonte acima do limite nativo,
e lista/backup não reconheciam um corpo físico externo.

## Decisão e armazenamento

Uma fonte congelada é um snapshot de capítulo. Reutilizar bookTextBodies,
resource chapter com ID da fonte/capítulo remapeado, pins 1 e geração imutável
de partes de 64 KiB. Acima de 512 KiB, original.content fica null e
original.contentStorage contém o manifesto existente de capítulo.

BookSceneSourceText prepara essa representação e resolve texto lógico,
conferindo hash e preservando ausência de conteúdo inline. Null sem manifesto,
ponteiro físico fornecido como fonte portátil e hash divergente são recusados.
Leitura verifica escopo, partes, nascimento nativo, integridade, UTF-8 e BOM
pelo contrato compartilhado de capítulo.

advanceBookRestoreResources cria corpo/partes/fonte/journals e avança
cursor/contador/recibo juntos. Até 128 partes e 130 artefatos por fonte; sem
truncamento nem novo limite menor para o item lógico. Colisão não é adotada.
Clones locais à tentativa mantêm retry/CAS/replay atômicos.

Não há namespace/inventário novo: text-body/text-chunk já pertencem ao inventário
v5, e fontes são preparadas sob v7. Cancelamento limpa filhos antes do manifesto
por prova nativa/journals. Delete-book v2 e coletor de capítulo já reconhecem
essa mesma família/resource chapter; o pin próprio conserva a fonte enquanto
o livro existir. A fonte não depende de um capítulo atual.

## Reconciliação e backup

BookRestoreCountEffects confere o manifesto como artefato próprio e compara o
recurso lógico completo com o item validado; não compara um ponteiro físico com
texto portátil. BookBackupResourceRead reautoriza o livro e resolve a fonte
antes de validar/projetar JSON. contentStorage nunca aparece no backup.

O leitor de backup existente recompõe e serializa um item por página de saída.
Instrumentação Node da fonte com 19 partes registrou 19 páginas e 361 leituras
de partes. O SDK comprovou o resultado, não uma meta de desempenho. A otimização
para evitar recomposição quadrática continua obrigatória antes da habilitação
completa de P1; não apresentar essa implementação como exportação já otimizada
para o limite de 8 MiB.

## Leitura privada e cliente

listSceneSources conserva conteúdo inline legado. Para uma fonte externa,
retorna texto null, descriptor e sourceToken opaco, sem ponteiro em original.
Token liga UID/livro/fonte, encarnação nativa do livro, identidade nativa da fonte,
nascimento do corpo e manifesto.

readSceneSourceText é callable privado: reautoriza dono/estado e sceneRevision
do livro em cada unidade, reconfere o token atual e devolve somente uma parte.
Não aceita caminho físico ou abertura interna do cliente. Origem reservada sem
raiz, raiz/fonte/corpo recriados, revisão alterada ou parte corrompida falham.

O serviço cliente monta até oito partes em paralelo, confere forma/tamanho/base64,
manifesto/token/revisão, hash e UTF-8/BOM e confirma a primeira parte de novo antes
de devolver. Mudança de conta ou falha final descarta o resultado. Não persiste
texto ou descriptor. Sua interface pública continua retornando SceneSource com
texto completo; consumidores antigos não recebem null como fonte vazia.

SDK direto continua bloqueado para corpos/partes, inclusive com raiz própria
existente. Sem alteração de Rules ou componentes visuais.

## Sequência, limites e continuação

Implantar leitor/callable/cliente compatíveis antes de habilitar fontes externas.
Não foi feito deploy nem ativação pelo restaurador. Raízes dos testes de leitura
são harnesses sintéticos, sem evidência de ativação.

M37 ainda exige lore, demais campos de cenas/planejamento/narrativa, metadados de
livro/ato/capítulo e rótulos/metadata de versões/rascunho. Metadados grandes da
própria fonte também continuam pendentes. Escrita autoral de cenas/conversão
mantém seus limites atuais.

Também faltam disponibilização da capa/biblioteca, certificação/ativação,
limpeza pós-ativação e host/UI/roundtrip/validate integral. P1/F2-09 e Writer V2
permanecem abertos. Sem dependência, subagentes ou CI/push/PR/deploy novos.
