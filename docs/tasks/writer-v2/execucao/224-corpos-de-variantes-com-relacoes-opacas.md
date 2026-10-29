# P3 — formato versionado de relações não resolvidas

- Data: 2026-10-29.
- Base: f8d13ea; sequência de [223](223-relacoes-portateis-do-lore-congelado.md).
- Estado: etapa A implementada e validada localmente; etapa B de codec/ciclo pendente.

## Objetivo e aceite

Preservar relações lógicas não resolvidas no corpo de uma variante restaurada
sem inventar labels. Provar leitura, escrita subsequente, remoção/restauração,
descarte, adoção e reexportação. Não bastará aceitar o arquivo e perder as
chaves na primeira edição. A etapa A versiona o conteúdo do arquivo; a entidade cliente fica inalterada.
Não habilitar produtor de restauração.

## Contrato privado previsto para a etapa B

Overlay servidor com corpo override pode usar bodyCodec=portable-relations-v1.
Ausência é JSON nativo anterior; presença nula/desconhecida ou em modo sem
corpo falha fechada. Não exigir que a base ativa ainda seja restaurada:
adoção explícita pode conservar o corpo original em armazenamento anterior.

Corpo privado canônico mantém campos normais e relações portáteis true/false.
Validação dos campos/descritores conhecidos reutiliza entityInput, sem ciclo.
False contém apenas targetKey/available, sem self, labels ou campos extras.
Até 50 relações e 900.000 bytes; UTF-8/hash/chunks/binding continuam obrigatórios.
Leitor interno retorna conhecidos nativos e false explícitos; projeção pública
ignora false sem lookup, preservando DTO de entidade anterior.

Entrada do cliente continua nativa e fechada. Save valida entrada/relatedKeys
e autorização atuais antes de mesclar chaves false do corpo anterior.
Preservar ordem das não resolvidas e o arranjo anterior quando só texto muda;
conservar ordem dos descritores novos. Seleção explícita de alvo autorizado
com a mesma chave substitui o false. Não aceitar false/codec vindos do cliente.
Excesso após mescla falha antes de escrita, sem truncar ou apagar estado anterior.

Remove/restore conservam codec/manifest/binding; discard explícito retorna à
base e retira o codec do override. C3 keep-local conserva; use-candidate/
discard-local retiram o codec quando retiram o corpo. Autorização/projeção/
backup não tentam resolver false automaticamente. Save da ficha em modo base
conserva o contrato inteiro anterior de 223; não cria opaque keys por inferência.

## Sequência prevista para a etapa B

1. Módulo puro de codec/validação/mescla, sem importar LoreContracts em ciclo.
   LoreContracts reutiliza-o em overlayRecord, bodyPlan/readVariantEntity
   e projectEntity; manter caminho nativo existente.
2. LoreStorage e BackupLoreContext/Content/Binding selecionam/validam o codec
   e o vinculam às provas/headers. Backup emite DTO portátil atual.
3. Lore.mjs preserva o ciclo completo de save/remove/restore/discard.
   AdoptionStages preserva/limpa codec e ignora false antes de consultas.
4. Testar backend com corpo privado real e APIs seladas nativas, bytes/hash,
   emissão assinada/revisão, merge/resolução explícita, limites/rollback,
   remoção/restauração/descarte, adoção/novo armazenamento e corrupção.
5. Checks dirigidos, revisão, ADR/docs/AGENTS/evidência e commit local.

## Limites e continuação

Sem endpoints, dependências ou alteração da entidade cliente. A etapa A emite
contentVersion 3 e preserva a gramática das versões 1/2, conforme a revisão abaixo.
Somente produtor futuro servidor pode originar o marcador após revisão
autenticada. Não incluir chaves criptográficas no corpo/metadata.
Interface da restauração e suas omissões ainda exigem validação própria.
Depois: inventário/cleanup C4 v1–v4 antes de jobs/prosa/pins/índices; upload/
retomada, remapeamento/materialização/ativação e Estúdio/ciclos.
P3/D/F2-09 e macro 8/35 abertos. Testes dirigidos; validate no grande bloco.
Sem agentes/CI/push/PR/merge/deploy. Preservar servidor manual.

## Revisão de dependência antes da implementação

A investigação dos joins revelou um impedimento do formato atual: em versões
1/2, variant.entity.relations.available deve coincidir com a disponibilidade do
alvo no arquivo. Uma relação sem descritor deve permanecer não resolvida mesmo
se a adoção trouxer esse alvo. Não se pode marcar true inventando labels,
nem marcar false e emitir arquivo inconsistente, nem remover a chave para
fazer o teste passar.

Implementar neste incremento a etapa A: contentVersion 3 com unresolved true
opcional somente em relação false de variante. A distinção permite conservar
o estado não resolvido sem conceder acesso ao alvo, mantendo gramática e joins
estritos das versões 1/2. Base/âncora não recebem esse campo. Emissão/manifesto/
domínio lógico concordam em 3; framing 1 e procedência 2 não mudam. UTF-8 mantém
o contrato nativo das versões 2+. O callback provisório derivado recebe a versão
autenticada do header para aplicar a gramática correta, sem autorizar origem.

Conferir alvo tipado quando existir no índice, sem interpretar unresolved como
autorização. Preservar a regra estrita anterior para relações sem o marcador;
contar relações não resolvidas na prova interna. Testar arquivos reais assinados
1/2/3, downgrade com assinatura válida, violações de flag e joins e UTF-8 longo.

O codec privado e o ciclo de escrita/adoção especificados acima são a etapa B,
obrigatória no próximo incremento, depois deste formato. Nenhum campo de codec
ou produtor persistente será habilitado nesta etapa A. Esta decisão substitui
a suposição inicial de não precisar alterar o wire version; a entidade do cliente
continua inalterada. A tarefa geral e P3/D continuam abertas.

## Resultado da etapa A

Formato v3 implementado, com emissão/manifesto/raiz lógica concordantes e callback
derivado versionado. Marcador somente em relação false de variante; joins clássicos
e gramáticas 1/2 conservados. Contagem interna e rejeição de alvo não lore disponíveis.
22 novos e 542 regressões passaram, total 564/564, sem falhas/skips.
ESLint dirigido e sintaxe de 449 módulos Functions positivos; checks de formato,
arquitetura, documentação e diff final registrados na
[evidência](../../../entregas/2026-10-29-writer-v2-formato-das-relacoes-nao-resolvidas.md).

A etapa B acima continua pendente: este resultado não implementa codec privado,
merge de escrita, remoção/restauração/descarte ou adoção de corpos opacos.
Continuar no incremento 225 sem habilitar produtor persistente; validar o grande
bloco de leitores/cleanup antes de materialização. Sem validate integral repetido,
CI ou alterações remotas; somente commit local.
