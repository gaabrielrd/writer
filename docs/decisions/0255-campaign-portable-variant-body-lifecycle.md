# ADR 0255 — Ciclo dos corpos portáteis de variantes

- Data: 2026-10-29.
- Estado: aceita para leitores e mutações internas; restauração persistente pendente.
- Relacionadas: [0253](0253-campaign-portable-frozen-lore-relations.md),
  [0254](0254-campaign-unresolved-relation-format.md).

## Decisão

Overlay servidor com corpo override pode declarar bodyCodec
portable-relations-v1. Ausência mantém o JSON nativo; presença nula/desconhecida
ou em modo sem corpo override falha fechada antes da leitura do corpo.
Remove com previousMode override conserva o codec. O marcador descreve
serialização, sem conceder acesso; propriedade, fonte/âncora, binding,
manifesto, SHA, UTF-8 e autorização atual continuam obrigatórios.

campaignVariantBodyCodec injeta o validador entityInput para evitar ciclo de
importação. Corpo canônico usa campos normais e relações true com descritores
ou false apenas com targetKey/available. Não permite self, chaves inválidas,
campos extras ou labels em false. Os limites incluem todas as relações e bytes:
50 e 900.000. A ausência de codec não é inferida a partir do corpo.

## Leitura e edição

Leitor interno retorna descritores nativos e declarações false; projeção
pública ignora false antes de qualquer consulta. A entidade do cliente não
ganha flags privadas. Seu pedido selado, alvos imutáveis e autorização são
validados antes da mescla no servidor.

Save de override portátil conserva false anteriores, sua ordem relativa e
posição entre descritores quando só texto muda. A ordem dos descritores novos
é respeitada; remoção de descritores conhecidos mantém a semântica de ficha
inteira. Um descritor novo para a mesma chave autorizada pode resolver false.
Reenviar ocorrências anteriores sem mudança não resolve uma declaração
adicional da mesma chave. Limites são conferidos antes de qualquer escrita,
sem truncar nem apagar corpo/pedido anteriores.

Se não restarem declarações false, o corpo seguinte usa JSON nativo e retira
o codec. Primeiro save de ficha em modo base mantém o contrato inteiro da
ADR 0253 e não infere relações opacas para o override; a base não é alterada.

## Demais caminhos

Remove/restore preservam corpo, codec e binding. Discard explicitamente limpa
codec/corpo da variante e retorna à base. C3 keep-local preserva o codec mesmo
após adoção de base nativa, inclusive quando os chunks continuam no
armazenamento anterior. Use-candidate/discard-local retiram o codec ao retirar
o corpo. Verificações de relações da adoção ignoram false antes de buscar
alvos atuais/anteriores; um alvo ausente da candidata não impede esse caso.

Masks e tokens de armazenamento/backup incluem bodyCodec. Ao reler conteúdo
ou binding, presença e valor do marcador devem coincidir com a metadata
conferida. Backup serializa false privado como available false/unresolved true
do conteúdo v3, sem consultar o alvo nem expor o codec. Descritores conhecidos
continuam subordinados à disponibilidade atual. A revisão mantém os joins
estritos para relações sem o marcador, conforme ADR 0254.

## Limites

Sem novos endpoints, dependências, entidade cliente ou produtor de restauração.
A leitura de arquivo assinado e a revisão não ativam uma cópia. As fixtures
materializam o formato privado para exercitar os serviços e mutações reais.
Inventário/cleanup C4 v1–v4, upload/retomada, remapeamento/materialização/
ativação e interface/ciclos continuam necessários. A interface de restauração
deverá informar as omissões e relações não resolvidas antes da confirmação.
