# Writer V2 — conteúdo próprio da campanha em partes

- Data: 2026-10-29.
- Base: edaf21e; branch codex/writer-v2.
- Escopo: [plano 203](../tasks/writer-v2/execucao/203-conteudo-proprio-da-portabilidade-de-campanhas.md),
  parte do passo 2 do [plano 201](../tasks/writer-v2/execucao/201-portabilidade-privada-de-campanhas.md).
- Estado: evidência parcial de desenvolvimento; P3 permanece aberto.

## Resultado

O leitor interno preserva textos/estados/datas/ordens de notas, sessões,
checklist, pistas, missões e vínculos em DTOs fechados, além da raiz e progresso.
Cada leitura de texto exige primeiro a prova nativa da unidade e dependências,
a mesma do inventário. Arquivo não recebe ownership, revisão, contadores,
chaves, tokens, controles ou caminhos físicos.

Campos vazios, BOM, Unicode, espaços e URLs de texto próprio são preservados.
Partes de até 65.536 bytes e hash/tamanho integrais permitem reconstrução exata.
A ordem de mapas nested não altera o hash. Não há cap novo de tamanho total.

Controles e registros de exclusão geram omissão interna explícita. Vínculos de
sessão/item excluído não recriam esses pais; os corpos e itens próprios ainda
ativos continuam legíveis. Declaração de procedência, universo ou alvo S2 não é
grant nem prova de autorização da edição congelada.

Decisão na [ADR 0233](../decisions/0233-campaign-backup-own-content-chunks.md).

## Critérios do incremento

- [x] Nove tipos portáveis, com dados e IDs para remapeamento.
- [x] Projeções de campos e nested fechadas, sem envelope operacional no DTO.
- [x] Mesma prova do inventário, incluindo dependências por sessão.
- [x] Gates de conta/C4/fonte/unidade antes de ler texto, sem fallback completo.
- [x] UTF-8/hash/tamanho exatos, partes limitadas e índice após EOF recusado.
- [x] Próprios ativos preservados quando a origem/sessão some; omissões explícitas.
- [x] Testes direcionados e revisão de código realizados.
- [ ] Composição/segunda passagem do arquivo, procedência/autorização da base,
      restauração/UI/ciclo e validate integral do novo grande bloco.

## Arquivos

- functions/src/campaignBackupOwnContent.mjs: projeções/validações e JSON canônico.
- functions/src/campaignBackupOwnRead.mjs: entrada fechada, provas e partes.
- functions/src/campaignBackupInventory.mjs: leitura interna da unidade por ID
  e elegibilidade separada da entry pública já existente.
- functions/test/campaignBackupOwnRead.test.mjs: 19 percursos novos.
- functions/test/helpers/campaignBackup.mjs: fixtures e escritores reais extraídos.
- functions/test/campaignBackupInventory.test.mjs: usa o helper, mesmos 20 testes.
- Plano 203, ADR, evidência, planos/índices/arquitetura/progresso afetados.

Nenhuma dependência, lockfile, Rule, endpoint, index, produtor persistente,
segredo ou mudança do inventário C4. Nenhum texto real do usuário foi lido
ou incluído nas fixtures.

## Testes e validação real

node --test functions/test/campaignBackupOwnRead.test.mjs functions/test/campaignBackupInventory.test.mjs functions/test/campaignBackupSource.test.mjs
terminou com **exit 0, 57 testes positivos, zero falha/cancelado/ignorado/todo**,
941,7099 ms. São 19 novos, 20 de inventário e 18 da âncora. As rodadas anteriores
de 54 e 57 também passaram; a última inclui os ajustes finais da revisão.

A fixture rica usa criação de aventura/cena, captura/ativação e escritores
ordinários reais C1/S1/S2/S3/checklist sobre banco de teste com metadata nativa
simulada. A porta do leitor proíbe get completo, query, escrita e caminhos fora
da campanha/reserva. Não há prova de concorrência/retry em Firestore real.

Reconstrução independente compara SHA-256 e tamanho de todas as partes, texto
com BOM/multibyte cruzando fronteiras, vazio e corpo S3 de 450.000 caracteres
de controle antes do escape, com JSON acima de 2 MiB. Também cobre cinco estados
de missão, três de sessão, pista tratada, checklist concluído e data civil bissexta.

Contas/C4, fonte antiga, edição entre partes, S2/S3 novo sem mudar a âncora,
corpo substituído/removido/recriado, conteúdo inválido, divergência nativa,
metadados de dono, corpo com chaves estranhas, retry/pedido mutado e mapas com
ordem alternada recusam ou preservam os dados conforme o contrato.
Controles/tombstones e pais inativos são omitidos sem consultar prosa.

ESLint e sintaxe individual dos seis arquivos de código/teste, formato dos
14 arquivos, check:docs e git diff --check passaram com exit 0. Revisão do diff
sem bloqueadores, preservando a forma e o algoritmo dos tokens do inventário.
Servidor manual respondeu HTTP 200 com o mesmo PID 11192; master limpa em
522ccaa. Validate integral não foi repetido conforme a política do operador;
a suíte de P2 não é apresentada como validação do código novo.

## Pendências e limites

Leitor interno não é um arquivo de backup utilizável. Ainda faltam composição
com segunda passagem de todas as famílias, manifesto/cobertura e prova da edição
congelada, reautorização de derivados/universo, variantes/mídia, persistência/
cleanup, restauração, interface e ciclo integrado P3/D/F2-09.

C4 segue v1–v4 até a evolução explícita antes de novos produtores persistentes.
Macro **8/35**, política final de perguntas de 199 e gates humanos/comerciais
permanecem abertos. Somente commits locais, sem CI, push, PR, merge ou deploy;
servidor manual preservado.
