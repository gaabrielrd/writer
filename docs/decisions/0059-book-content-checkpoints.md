# ADR 0059 — Núcleo semântico de livro com checkpoints

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M15](../tasks/writer-v2/execucao/48-nucleo-semantico-com-checkpoints.md).

## Decisão

Extrair as regras semânticas existentes para bookContentMachine e usar esse mesmo
núcleo nos validadores de pacote novo e JSON legado. Não criar uma cópia permissiva
dessas regras no servidor. bookBackupContent mantém leitura/JSON canônico/partes
raw/framing e a composição do relatório content-only.

A máquina é interna, sem reexport pela interface pública de book-portability,
RPC ou I/O próprio. createBookContentState fixa bookId e modo novo/legado;
createBookContentMachine clona e confere o checkpoint. Os adaptadores continuam
fixando o modo e verificando a procedência, sem opção externa para afrouxar
a validação nova. Ausências de perfil/override continuam exceções legadas.

## Controle limitado

Checkpoint JSON schemaVersion 1, fechado e limitado a 16 KiB: IDs/hashes,
contadores, tags de completude, origem/capa mínimas, expectativa raw e cursores.
Não inclui títulos, prosa, nomes da biblioteca ou perfil de persona.
Item lógico mantém teto de 8 MiB já existente. Identidades são metadados,
mesmo quando seus IDs foram escolhidos pelo autor.

Fases records → edges → rows → done. acceptJSON valida DTO/identidade e registra
provas/referências. Corpos históricos/draft/capa deixam expectativa mínima:
o adaptador deve ler partes reais, conferir formato/hash e então aceitar a prova
raw no núcleo. Não receber tal prova do cliente por RPC.

Relações numerosas de lore deixam cursor e hash do item. advanceRelations confere
o mesmo item e processa até 64 relações; não corta arrays para caber em transações.
O host deve reler a fonte fixada e preservar geração/posição ao retomar.
A releitura de um item é limitada a 8 MiB; não é cache do projeto inteiro.

beginFinish exige completude e consistência entre livro/origem/capa.
advanceFinish resolve até 64 arestas/linhas por passo, somando warnings uma vez
e mantendo detecção de ranks ativos duplicados. Checkpoint após um passo permite
recriar a máquina com o mesmo índice e continuar. result só existe em done e
retorna semantic-only: não aceita envelope nem declara autorização/framing.

## Erros e fronteira de confiança

Instância bloqueia acesso ao checkpoint durante I/O e chamadas concorrentes.
Após erro de índice/validação ou abort, não oferece checkpoint parcial nem
resultado positivo. Entrada é copiada antes de await; snapshots/resultados também
são cópias, sem permitir alterar controle interno.

Checkpoint e índice são portas confiáveis do host, não prova fornecida por arquivo.
O servidor futuro precisa vinculá-los ao UID/jobToken, origem nativa, formato,
geração e checkpoint observado, confirmando efeitos e controle juntos.
Se falhar uma operação, descartar/abortar seus efeitos; não reaproveitar uma
instância inválida nem assumir rollback automático de um índice externo.
O adaptador cliente já descarta seu índice temporário na falha.

Modo novo continua estrito. O índice mantém relações locais com prioridade sobre
prefixos externos, fontes/conteúdo/ranks/perfis são conferidos como antes e
nenhuma ficha global/URL/flag de publicação ganha autoridade com o relatório.

## Integração e trabalho restante

Sem dependência, coleção, Rule, endpoint ou crédito novos. Parser ainda executa
como leitura completa nos adaptadores atuais; a máquina não persiste sozinha.
O próximo protocolo deve adicionar parser retomável, índice privado e inventário
de cleanup antes dos writers, usando a fonte verificada M14.

Não há restauração/ativação nova neste marco. P1 ainda exige coordenação servidor,
normalização legada, remapeamento/mídia, revisão protegida no host, universo atual,
ativação atômica, UI/roundtrip e validate integral.

[Evidência M15](../entregas/2026-10-22-writer-v2-nucleo-semantico-com-checkpoints.md).
Somente commits locais, sem CI ou envio remoto.
