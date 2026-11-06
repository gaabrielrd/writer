# ADR 0293 — produtor editorial com confirmação semântica do arquivo provisório

- Estado: implementada localmente; novo estágio e casos adicionais sem execução.
- Data: 2026-11-03.

## Contexto

As 37 famílias possuem leitores nativos, mas suas projeções em bundles, aliases e
referências precisam compor um arquivo coerente. Um selo confirma bytes/framing;
não prova unicidade entre bundles, existência de alvos ou semântica editorial.
Confirmar o destino apenas com esse selo poderia produzir um backup incoerente.
Guardar o arquivo inteiro em RAM não atende os limites de projetos grandes.

## Decisão

Centralizar catálogo/limites, manter censo por digests e reconferência metadata,
desmembrar bundles e compor referências explícitas. Registrar as sete ações no
setor existente. A declaração compilada do fence exige writers coordenados e
não substitui autorização, drenagem de clientes antigos ou validação do rollout.

O stream optativo v2 permanece provisório. Em `saveBookBackup`, espelhar os bytes
num estágio OPFS cifrado e limitado, com chave AES-GCM somente em RAM e AAD por
operação/posição/comprimento. Guardar contas privadas em memória e ler intervalos
pequenos após selar o estágio. Reutilizar o validador semântico e seu índice
cifrado, comparar selo/origem/tamanho e confirmar o destino só após validação e
limpeza próprias. Falhas abortam o destino sem anunciar sucesso.

Copiar o port editorial antes do primeiro await do host. Não deduzir relações,
coletar operações alheias, persistir a chave ou adotar ciphertext abandonado.

## Consequências

O formato padrão e a UI continuam v1. O caminho v2 exige OPFS e não oferece
fallback para prosa em claro ou arquivo inteiro em memória. O estágio é efêmero,
sem retomada após perda de chave. Um relatório local não autoriza restauração.

São 14 casos novos preparados sem execução; validações anteriores não cobrem o
estágio atual. Restauração útil, inventários/cleanup, ativação, revisão e auditoria
das cinco etapas continuam obrigatórios. Ver o
[incremento 45](../tasks/producao-literaria/45-produtor-e-arquivo-editorial-provisorio.md).
