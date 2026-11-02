# Writer V2 — instalação de personas da aventura restaurada

Data: 2026-10-27. Base: 7d07ec6.
[Plano 179](../tasks/writer-v2/execucao/179-instalacao-de-personas-da-aventura-restaurada.md)
e [ADR 0201](../decisions/0201-adventure-restored-persona-library-install.md).

## Implementado

Snapshots privados únicos são instalados na biblioteca com restoreOrigin v2,
um perfil por unidade, sem duplicar por binding. Preserva preset capturado como
snapshot custom remapeado, arquivo/datas/revisão/traits e overrides já preparados.
Cada strict create comprova definição/journal e confirma perfil, journal, lote
preparing, checkpoint e recibo na mesma transação. Documento existente, mesmo
idêntico, não é adotado ou sobrescrito.

Lote inicial existe inclusive com zero perfis. Cursor fica privado; quantidade
instalada é conciliada com os perfis únicos preparados antes de
persona-library-ready. Lote exige nascimento nativo, contexto, operações
originais, contador do job e hash do efeito atual. Raiz continua sem ownerId
e countReady false; disponibilidade permanece bloqueada no servidor/seletores.

O primeiro avanço de limpeza revoga o lote antes dos deletes. Cada perfil
exige journal/versão e lote cancelado originais. Batch/recibos cancelados são
fences permanentes; dados preexistentes/recriados são preservados. A conclusão
confere ausência limitada de perfis/journals desse projeto. Jobs anteriores
sem instalação também recusam namespace global órfão.

## Validação dirigida

14 Node novos distintos em seleções: 12 positivos em 5.404,282 ms e dois novos
adversariais em 1.494,532 ms. Cobrem snapshots arquivados/revisão/datas, dedupe,
duas personas distintas/uma por unidade, replay/CAS/rollback/retry, zero perfis,
revogação antes de qualquer delete, cancelamento parcial, existente idêntico,
perfil/journal/batch recriados, definição ausente/adulterada, contador/contexto
incorretos, namespace órfão e inputs/metadados fechados.

42 Node de regressão de transporte/universo positivos em 4.740,771 ms.
Três Vitest no corpus gerado pelo Writer positivos em 4,21 s totais/2,12 s
de testes: dois existentes e um novo de instalação integral dos perfis. O novo
preserva todos os documentos da aventura, copia snapshot uma única vez, mantém
indisponibilidade e confirma limpeza com lote cancelado comprovado.

Dois SDK Firestore reais positivos em uma chamada de 225.529,608 ms no demo
local 1.22.0. Verificam rollback total antes do job update, replay concorrente,
perfis exatos com mesmo nascimento de journal/operação, lote preparing nativo,
permissões reais, revogação antes de deletes e cleanup integral preservando
biblioteca manual. O segundo recria perfil idêntico e confirma preservação
da nova encarnação com limpeza recusada. JVM dedicada encerrada no finally.

## Revisão e checks

Sem dependência, endpoint, configuração de teste ou limite alterado. Formatação,
ESLint/sintaxe dos arquivos alterados, docs, arquitetura, styleguide e diff
passaram. Review verificou endereço global limitado ao UID, strict create,
provas/recibos, replay histórico sem grant e atualização não idêntica do lote.
O volume atual de perfis distintos não é benchmark de 501 snapshots.

## Fechamento integral do bloco

A primeira execução de npm run validate terminou com código 1 em 1.983,56 s.
Passaram skills, docs, arquitetura, styleguide, formatação e as 32 partições do
lint, 4.323 testes frontend e 90 de scripts. Functions: 3.522 positivos de 3.523;
falhou a auditoria de livros que exige somente sua máscara de metadata original.
Sintaxe final das Functions e build ainda não haviam executado nesse comando.
A execução não é considerada gate verde.
Sem CI/push/PR/merge/deploy/agentes; somente commit local com hooks normais.

Este incremento não ativa projeto/lote nem conclui P2. Mídia, agregados/audit/
ativação, recuperação cifrada/UI/roundtrip, P3/D/F2-09, fases seguintes e gates
humanos/comerciais permanecem obrigatórios. Macro 8/35 não muda.

## Atualização — 2026-10-28

A ampliação do leitor de lotes em 178 solicitava bookId e target em ambos os
formatos. A auditoria de livros recusou esse acréscimo não previsto na sua
máscara. O leitor agora escolhe somente bookId para origem v1 e somente target
para v2. O teste de auditoria mantém a mesma exigência; o de aventura passou a
conferir também sua máscara exata.

Após a correção, 59 Node dirigidos positivos em 9.692,145 ms: auditoria de livro,
disponibilidade de ambos os domínios e instalador de aventura. Doze SDK de
disponibilidade positivos em 25.058,222 ms confirmam os dois formatos com a
seleção de campos real do Firestore. Não foi repetido o SDK longo do instalador,
cujo protocolo de escrita/cleanup não mudou. Build isolado passou em 3,48 s,
com tipos, 3.028 módulos e smoke do bundle; avisos existentes de tamanho de
chunks/imports dinâmicos permanecem.

A nova execução integral local de npm run validate terminou com código 0 em
1.510,77 s. Vitest usou VITEST_MAX_WORKERS=2 somente no ambiente desse processo,
dentro do limite de quatro do projeto, sem alterar config, casos ou cobertura.
Passaram skills/docs/arquitetura/styleguide/formatação, as 32 partições de lint,
329 arquivos e 4.323 testes frontend, 90 scripts e todos os 3.523 testes Functions,
incluindo a auditoria de livros anteriormente reprovada. Cobertura: 89,94% de
statements, 85,71% de branches, 91,12% de functions e 93,24% de lines, sem reduzir
limites. Sintaxe de 358 módulos Functions, tipos, build de 3.028 módulos em
2,14 s e smoke do bundle também passaram. Avisos de bundle/imports dinâmicos
continuam os mesmos. A tentativa anterior permanece registrada como falha.

Esse resultado fecha o bloco local 177–179. Os hashes dos 20 arquivos de código
e teste foram congelados antes da execução e reconferidos antes do commit;
a documentação recebeu somente o resultado observado. Revisão final sem
bloqueador: preservados escopo, isolamento de UID, origem nativa, limpeza
comprovada e indisponibilidade até ativação. Commit com hooks normais e somente
local; nenhum envio remoto.
