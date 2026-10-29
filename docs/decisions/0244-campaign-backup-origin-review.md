# ADR 0244 — revisão atual das origens autenticadas

- Data: 2026-10-29.
- Estado: serviço interno de revisão implementado localmente.
- Base: 7228150; [plano 214](../tasks/writer-v2/execucao/214-revisao-autorizada-das-origens.md).

## Decisão

Validar integralmente o arquivo antes de consultar qualquer origem. Um source
emprestado pode mudar entre leituras; usar sua segunda leitura sem autenticação
por registro permitiria consultar evidência diferente da assinatura validada.

Durante a validação, onWitness entrega somente evidências canônicas provisórias
a um índice temporário injetado. Cada linha recebe HMAC-SHA-256 do servidor
sobre conta, ordinal e bytes, com chave aleatória exclusiva da revisão.
Não consultar origens nessa fase. Só selar o índice após cadeia/raízes/assinatura
e contagens válidas. MAC é integridade interna, não criptografia nem grant.

O host fornece write/seal/read/dispose, capturados antes de await. Não há
adaptador persistente padrão. Ler até 25 posições por página, inclusive posições
vazias, sem confiar em iterator customizado do array. Copiar e verificar todos
os MACs antes da primeira consulta de origem da página. Campos do envelope são
capturados uma vez. Exigir a contagem completa ao terminar; dados de outra
revisão, posições repetidas, falta ou alteração recusam.

A chave fica só em RAM, é zerada no finally e não vai para arquivo/índice/log.
Dispose sempre é solicitado, inclusive após sucesso. O adaptador real deverá
ser privado e cuidar de seus recursos; índices em RAM dos testes não são a
implementação para campanhas reais. MAC não permite retomar entre processos.

## Autorização

Conferir em transações mascaradas, sem prosa e sem criar controles:

- Reserva permanente C4 da aventura; qualquer reserva impede derivados.
- Aventura com mesmo dono, schema e nascimento exato, sem deleting.
- Universo com mesmo autor/nascimento e sem deleting. Ausência ou recriação
  retira somente o material que depende daquele lore global.
- Ficha global ativa no pai autorizado, com nascimento exato.
- Ficha local com schema/owner/adventureId/token/entityId/deleted e nascimento
  exatos, sob a aventura atual da mesma encarnação.

Edição de prosa antes da revisão não recaptura a edição do arquivo. Fonte
omitida na exportação permanece omitida. Itens pertencem à base ativa
autenticada; âncoras antigas levam a própria base. Não consultar campanha/base
antigas no banco nem conceder acesso por reaproveitar seus IDs.

Ler o clock global de autorização antes/durante/depois e repetir todas as
evidências. Comparar contagens/hash de disponibilidade e fatos nativos, inclusive
identidades de nascimento/updateTime. Isso detecta recriação do clock com os
mesmos campos e mudanças observadas que não incrementam o clock, como C4.
Não reutilizar permissão observada em outra transação.

O leitor de arquivo passa a devolver também a atestação pública validada.
Revalidá-la no registro confiável ao terminar a revisão; revogação da chave
durante as consultas não pode produzir um resultado final.

## Resultado e limites

Decisões são provisórias, somente IDs/disponibilidade; resultado natural é
campaign-origin-review-only, vinculado à cadeia do arquivo efetivamente validado.
Arquivo alterado depois não troca os registros MAC já autenticados; seu host
deverá comparar a identidade/cadeia do source usado na futura restauração.

A prova é efêmera, não linearizável contra escritas arbitrárias e não é grant
de ativação ou de acesso futuro. Restaurador precisa conferir novamente cada
origem por unidade e na ativação, além dos vínculos semânticos e schema do domínio.
Índice, provas e callbacks provisórios não autorizam escrita de conteúdo.

Sem endpoint/UI/Rules/dependência, segredo persistente ou produtor de índice real.
Antes de persistir jobs/prosa/pins/índices, ampliar C4 v1–v4 e consumidores de
procedência. Concorrência, índices/credenciais reais e retomada ainda não foram
validados. P3/D/F2-09 e macro 8/35 abertos; validate no grande bloco.

Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-revisao-das-origens-do-backup.md).

## Vínculo organizacional ainda pendente

Esta revisão cobre origens derivadas das evidências base/item/âncora.
O universeId organizacional da raiz pode mudar sem alterar o universo da base
congelada e pode existir em campanha independente. O arquivo v1 conserva esse
ID no conteúdo próprio, mas ainda não tem evidência própria de seu nascimento.
Não religá-lo apenas pelo ID nem usar a evidência da base como substituta.

Antes da materialização, acrescentar o contrato e a versão de procedência para
esse vínculo, preservando leitura de arquivos anteriores e explicando ausência
de prova nas versões legadas. Esta lacuna não está marcada como validação concluída.
