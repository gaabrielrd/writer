# ADR 0200 — disponibilidade de personas restauradas de aventuras

Data: 2026-10-27. Estado: implementado; instalação/ativação de aventura pendentes.

## Contexto

O lote de disponibilidade de personas restauradas era específico de livros:
restoreOrigin v1 contém bookId e exige recibos de bookRestoreOperations.
A restauração de aventuras já guarda perfis e bindings privados, mas não pode
instalá-los identificando a aventura como livro ou ignorando o gate da biblioteca.

## Decisão

Manter origem/lote v1 sem migração para livros existentes. Acrescentar origem
v2 fechada com target {kind: adventure, id: restore-a-<64 hex>}, restoreId e
jobToken. Lote v2 tem a mesma origem, ownerId, estado, quantidade e IDs de
operações. Proibir aliases bookId em v2, campos extras e outros tipos de target.
Projeções clonam target para não compartilhar referência mutável de entrada.

A prova no servidor consulta o lote pelo ID do projeto e escolhe namespace/
ações pelo discriminante validado. Aventura usa adventureRestoreOperations,
advanceAdventureRestorePersonaLibrary, activateAdventureRestore e
advanceAdventureRestoreCleanup; livro mantém seus nomes. Exigir conta, geração,
estado/ações, mesmo nascimento de batch/primeiro recibo, operações imutáveis e
versão da última atualização do batch correspondente ao último recibo.
Somente active permite disponibilidade. Perfis manuais sem restoreOrigin
continuam com sua disponibilidade atual.

Cliente resolve projectId pelo contrato compartilhado. Listagem e inscrição
consultam/deduplicam observadores por projeto, ocultam pendentes/revogados e
descartam callbacks de observadores removidos. Edição relê perfil/lote, mantém
origem original, CAS de revisão e createdAt. O perfil devolvido não expõe a origem
operacional; serialização portátil permanece sem ela.

Rules aceitam as duas origens e exigem o lote correspondente para editar/vincular.
Preservar permissões atuais: dono lê sua biblioteca; terceiros/anônimos não;
cliente não cria origem de restauração, muda/apaga sua marca ou escreve lotes.
Leitura direta privada não significa disponibilidade para uso. Consumidores no
servidor continuam conferindo provas nativas antes de ler instruções.

O SDK encontrou o limite de 1.000 expressões na edição válida com o contrato
ampliado. A validação dos atributos foi simplificada: tamanho calculado uma vez,
oito posições obrigatórias e até oito opcionais. Todas as posições presentes
mantêm mapa/inteiro/faixa 0–100 e tamanho 8–16. A validação de restoreOrigin foi
mantida integralmente. Nenhum limite ou checagem de origem foi removido.

## Consequências e limites

Contrato é dependência da instalação, não um instalador/ativador novo. Lotes
ativos dos testes são harnesses sintéticos; futuro instalador deve criar perfil/
journal/recibo e manter preparing até ativação atômica auditada. Cleanup deve
revogar o lote antes de limpar perfis e provar suas origens, sem adotar existentes.

Prova nativa no servidor protege contra recriação administrativa dos documentos;
Rules e cliente confiam nos lotes escritos pelo servidor e não substituem essa
prova. Não prometer atomicidade de toda restauração ou conclusão de P2.
Sem dependências, endpoint, regras implantadas ou envio remoto.
