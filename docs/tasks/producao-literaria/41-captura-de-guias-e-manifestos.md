# Incremento 41 — captura interna dos guias e manifestos de publicação

## Critérios e limite

Preservar entradas atuais, versões e retiradas do guia do leitor, além do job,
capítulos e retiradas do manifesto. Manter a estrutura autoral de revelações,
fatos, relações e aparições, sem reativar publicação ou perder vínculos com as
citações. Ler por registro limitado, sem carregar a edição inteira.

Implementados bookEditorialPublicationCapture e cinco famílias: publication-job,
publication-chapter, publication-removal, reader-guide-current e reader-guide-version.
O capturador passa a 24 famílias internas. Não há novo endpoint público, produtor,
upload ou restauração editorial v2 habilitados. Objetivo original ativo e 0/5
etapas formalmente encerradas.

## Origem e autorização nativas

O leitor nativo de guia/manifesto confere dono e nascimento do livro pelo bookToken
da edição. A consulta autoral ao guia não exige que o manuscrito ainda corresponda
ao texto preparado: sua instrução, texto e citações são registros próprios.
A captura mantém esse comportamento histórico. Não troca esse gate pelo current
da publicação, que altera estado e impede edições quando a fonte muda.

A captura lê primeiro metadata do registro, dono/origem do livro e pai. Antes de
abrir o corpo de uma entrada de guia, exige edição existente com jobId/bookToken
compatíveis e schema conhecido; o próprio registro também precisa do bookToken
correto. Livro recriado, origem incompatível, pai ausente ou schema não suportado
geram indisponibilidade sem abrir o corpo. IDs de current/version seguem as
fórmulas nativas. O corpo precisa conferir metadata, entryHash e normalização
fechada do guia. Nenhuma leitura altera estado, aceite ou manuscrito.

Partes e conferência final repetem a projeção. Pins incluem identidade do pai,
cabeça da versão e referências de capítulos conferidas. Nenhuma prova, bookToken,
manifestHash, entryHash, projectionHash, URL ou ponteiro público entra no arquivo.

## Guia estruturado e citações

BookEditorialDocument admite readerGuide, exclusivo do papel readerGuide:
chave lógica e entrada nullable. A entrada preserva nome, aliases, categoria,
resumo, certeza declarada, desambiguação, capítulo de revelação, citações do resumo,
fatos, relações e aparições. Cada fato/relação/aparição conserva capítulo e ID da
própria evidência. Relações usam targetKey lógico, não um ID de biblioteca ou grant.

As chaves lógicas são derivadas do livro/nascimento e dos IDs autorais da edição e
entrada. São nomes de conteúdo para agrupamento histórico, nunca prova de que uma
origem atual é a mesma nem autorização de publicação. Não são controles de execução.
O DTO editionKey agrupa guia e manifestos históricos e só existe nesses dois papéis.
A restauração futura deve manter esses documentos como história privada.

As citações são as informadas pelo autor no guia. O produtor nativo não registra
posição; start/end permanecem null e offsetUnit not-recorded. Certeza fact é
preservada como declaração autoral, mas a evidência continua unclassified. A captura
não inventa offsets nem certifica presença no texto atual. Mudança ou ausência do
manuscrito não elimina texto/citações próprios já permitidos pelo leitor nativo.

Para marcar um capítulo como referência disponível, a captura confere a identidade
nativa atual com a identidade registrada no capítulo preparado da edição. Capítulo
recriado ou ausente fica unavailable; a citação própria continua preservada.
Identidade disponível não equivale a hash da prosa atual. Campos de revisão/hash
portáteis não são preenchidos com tokens nativos.

## Versões, aliases e retirada

Documento atual e sua versão correspondente têm o mesmo ID arquivístico por
chave/revisão, com papéis de linhagem distintos. A versão igual à cabeça só é
current-alias após conferir metadata integral; o futuro produtor deverá consolidar
esse alias e as evidências equivalentes. Versões anteriores mantêm seu texto e
linhagem. Retirada é entrada null com revisão própria, sem recriar a cabeça ou
apagar versões anteriores.

O verificador semântico acompanha todas as referências de capítulo/evidência da
estrutura. Evidências exigem alvo evidence. Uma chave de guia não pode unir
linhagens ou edições diferentes. Relações com alvos históricos ausentes geram
aviso, sem fabricar entrada; alvos conhecidos em outra edição são recusados.
O índice temporário conserva somente metadata dessas associações.

O remapeador troca IDs de evidência, capítulos disponíveis, chaves de guia/alvo e
editionKey de maneira consistente na nova cópia privada. Nenhum vínculo dessa
estrutura autoriza acesso a universo/biblioteca ou uma publicação nova.

## Manifestos

O job gera checkpoint desabilitado e documento histórico com título, nome autoral,
unidade, contagens técnicas e declarações autorais registradas. Mesmo uma declaração
histórica publicationAuthorized verdadeira não reativa consentimento ou publicação.
O cancelamento anterior ao primeiro envio gera somente checkpoint sem conteúdo,
contagens ou alvos inventados.

Cada capítulo preparado gera documento individual com título, posição, compilação
e palavras somente quando registradas. Identidade de capítulo é reconferida para
referência disponível; atos sem testemunho permanecem indisponíveis. Cada retirada
é intenção histórica individual, sem remover prosa. IDs físicos de revisão pública
e corpos preparados não são copiados. Guia e documentos do manifesto compartilham
editionKey, mantendo o agrupamento sem usar ponteiros públicos como grants.

Bundles são limitados a 57 artefatos e 1 MiB: documento e até 56 citações nativas
(8 resumo, 12 fatos, 12 relações, 24 aparições). Partes continuam em 64 KiB. O host
futuro deve desmembrar bundles e consolidar aliases em registros individuais.

## Casos preparados e evidência

Preparados 23 casos Node e três de SDK real, nenhum executado. Cobrem serviços
nativos, estrutura/vínculos de citações, ausência de offsets inventados, aliases,
versões anteriores, tombstone, deriva de fonte, capítulo/livro recriados, perda de
pai/origem, hashes/IDs/schema incompatíveis, agrupamento com manifesto, compilação,
retiradas sem exclusão, cancelamento inicial, privacidade, recheck, remapeamento,
travessia semântica, chaves/edições conflitantes, alvo ausente e limite de 56 citações
com transferência em partes.

Leitura e revisão manual somente. Nenhum teste, typecheck, lint, formatter, build,
browser, coverage, validate ou diff-check executado neste incremento. A rodada
anterior sobre b666233 não valida os incrementos 37–41. Sem commit literário,
merge de volta, push ou deploy. Nenhum processo de teste iniciado.

## Continuidade

Capturar checkpoints históricos restantes de redação, marcos, workflows, sequências
e impacto pelos seus gates nativos; completar associações de fontes. Implementar
o host produtor com pressão de consumo, censo, provas finais, footer/selo e arquivo
provisório confirmado, e a restauração útil de contratos/planos e histórico privado
com inventários, cleanup, ativação atômica e revisão da UI. Auditar E1–E5 e incorporar
novamente a principal antes dos testes finais. Cobertura 90%, Rules completas e
gates integrais continuam obrigatórios antes do encerramento.

Revisão manual41: previousEditionKey preserva a ligação lógica do manifesto e
das retiradas com a edição anterior, sem copiar revisionId público. Só o papel
publicationManifest admite esse campo; remap usa o mesmo namespace de editionKey.
Essa procedência não reativa a edição anterior nem confere autorização. O caso
de retirada preparado confere igualdade das chaves entre documento e manifesto.
Sem execução de checks ou casos adicionais.
