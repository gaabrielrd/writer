# ADR 0233 — leitura do conteúdo próprio de campanha por partes

- Data: 2026-10-29.
- Estado: leitor interno implementado; P3 aberto.
- Base: edaf21e; complementa a [ADR 0232](0232-campaign-backup-own-inventory.md).
- Plano: [203](../tasks/writer-v2/execucao/203-conteudo-proprio-da-portabilidade-de-campanhas.md).

## Decisão

Reutilizar a mesma prova nativa/dependências do inventário para ler uma unidade
por ID. Conferir C4, dono, âncora e itemToken antes de consultar qualquer campo
de texto. Texto passa por máscara fixa e identidade nativa igual à unidade
provada, na mesma transação. Pedido e valores escalares são capturados antes
de await. Não usar getter/listagem de usuário que depende da origem derivada.

A raiz e progress/current usam a âncora dos dois singleton, inclusive ausência
do progresso. O progresso não cria metas/controles ausentes. Seu DTO guarda
somente campos próprios aplicáveis à campanha, sem os contadores/checkpoints.

Definir nove DTOs fechados: campaign, progress, note, session, checklist,
preparation-item, preparation-body, session-reference e session-preparation-link.
Envelope portátil contém schemaVersion 1, kind, id, present e data. ID é
coordenada para remapeamento; owner/revisão/tokens/controles/caminhos físicos
não são conteúdo portátil. Campos permitidos e projeções nested são fixos.

A raiz declara somente provenance.kind e universeId quando presente.
Referência S2 declara apenas sessionId/target kind/sourceKey e datas. Essas
declarações não comprovam a origem nem autorizam acesso. A base congelada,
atestado, identidade de universo e autorização vigente terão contrato próprio
antes de compor o arquivo/restaurar vínculos; não capturar material derivado aqui.

Controles e tombstones retornam outcome omitted sem chunk. Vínculo residual
de sessão ou item excluído recebe inactive-parent; não recria pais no backup.
A omissão é resultado interno conferido pela prova, não conteúdo operacional
para gravar no arquivo. O catálogo/corpo próprio ativo permanece legível mesmo
após remover a sessão ou aventura original.

## Partes e fidelidade

Serializar somente uma unidade limitada pelo domínio de cada vez e responder
em partes de até 65.536 bytes. SHA-256 e tamanho cobrem JSON UTF-8 integral.
Partes são bytes: um caractere pode atravessar fronteiras e só deve ser
decodificado após reconstrução. Índice fora das partes recusa explicitamente.

Aplicar os limites atuais antes do escape JSON, sem novo cap global do projeto.
Corpo S3 válido pode ultrapassar 2 MiB após escapar caracteres. Preservar vazio,
BOM, Unicode, espaços e texto/URLs escritos pelo usuário. Rejeitar strings
inválidas ou corpo não representável sem truncar. Ordenar chaves de body
pelas chaves do domínio; a ordem recebida do mapa não muda o hash entre leituras.

## Compatibilidade, evidência e limites

A prova e o DTO paginado do inventário continuam iguais. A elegibilidade de
conteúdo é separada internamente da entry id/itemToken. Fixtures de criação/
captura/escritores reais foram movidas para helper compartilhado, preservando
todos os testes antigos.

A [evidência parcial](../entregas/2026-10-29-writer-v2-conteudo-proprio-de-campanhas.md)
registra os testes em banco transacional de teste com relógios nativos simulados.
Não comprova Firestore real/credenciais/Rules/produção. Sem endpoint, arquivo,
job, chave, pin, persistência ou UI novos. C4 segue v1–v4; seu inventário deve
evoluir antes dos futuros produtores persistentes.

Composição/segunda passagem do arquivo, origem/base/variantes/mídia, restauração,
interface, ciclo e fechamento integral P3 continuam pendentes.
