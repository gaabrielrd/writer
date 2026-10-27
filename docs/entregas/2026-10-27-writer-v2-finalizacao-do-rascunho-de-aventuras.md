# Writer V2 — finalização do rascunho recuperado de aventura

Data: 2026-10-27. Base: a39aaf3.
[Plano 176](../tasks/writer-v2/execucao/176-finalizacao-do-rascunho-de-aventuras.md)
e [ADR 0198](../decisions/0198-adventure-recovered-draft-version.md).

## Implementado

O rascunho montado agora recebe manifesto nativo de versão com contagem visível
correta, rótulo de recuperação, motivo manual e data savedAt. Texto, hash e partes
permanecem exatos; manuscript/corpos salvos não são escritos. Vazio ou igual ao
salvo continuam versões separadas. Ausência avança explicitamente sem criar versão.

Root, descriptor, estado raw completo, origem fonte e corpo salvo são conferidos.
Todas as partes são reabertas com prova/hash e seu SHA/bytes integral recalculado.
A contagem usa o mesmo countVisibleWords do produto sobre o texto inteiro, para
palavras e HTML/Markdown que cruzam partes. Antes de gravar, a transação reconfere
fonte, journals e versões nativas observadas sem carregar novamente toda a prosa.

Manifesto, descriptor finalized, historyRevision +1 e checkpoint/recibo confirmam
juntos. Replay não duplica; rollback, cancelamento ou modificação após contagem
não deixa manifesto parcial. Cleanup mantém suas provas e recusa estrangeiros.

A fase draft-ready mantém a raiz mínima sem ownerId, sem tornar a aventura ou a
versão disponíveis ao cliente. Não foi criado campo draft de livro nem endpoint,
permissão, integração de biblioteca ou ativação.

## Testes dirigidos

14 Node novos positivos em 6.036,788 ms: nenhum/vazio/igual/diferente, palavra
cruzando partes, script HTML removido cruzando partes, Markdown e BOM; manifesto
nativo/readers, bytes/data/hash/contagem/label e manuscrito intacto. Incluem replay/
concorrência, rollback/retry, cancelamento durante preparação, parte ausente ou
alterada, journal recriado, manifesto estrangeiro, metadata/inputs fechados e
mutação entre contagem e rechecagem final.

Quatro Vitest no corpus real de histórico, incluindo os dois novos de finalização,
positivos em 4,41 s totais/2,30 s de testes. Arquivo gerado pelo Writer contém
manuais/before-restore, versão vazia e draft real de cena/bloco; preserva os
anteriores e acrescenta uma versão nativa. Os headers recuperados também passam
no schema portátil de aventura, sem metadado de draft de livro.

Três SDK reais positivos em uma chamada de 281.465,480 ms no Firestore 1.22.0
demo local. Confirmam versão nativa/contagem 5.000, texto/data/prova de nascimento,
corpo salvo sem atualização, negação a dono/terceiro/anônimo e cleanup integral;
rollback completo e replay concorrente; escrita administrativa de uma parte entre
a contagem e a transação final recusada, sem manifesto/checkpoint e preservando
o dado alterado. A JVM dedicada foi encerrada pelo finally.

## Revisão e limites

O lint encontrou helper pending sem uso no fixture SDK copiado; removido sem
alterar o fluxo testado. Nenhuma dependência, configuração de teste ou regra de
acesso foi adicionada. Memória da contagem é proporcional ao texto completo;
não existe limite menor inventado nem soma por partes. Capacidade real do runtime
continua exigindo benchmark operacional de arquivos grandes antes do lançamento.

A prova protege a confirmação transacional. Auditoria dos demais recursos e
proteção contra consumo prematuro permanecem, sem prometer snapshot contra
modificações administrativas posteriores.

## Validação integral do bloco

npm run validate terminou com código 0 em 2.166,65 s, fechando o bloco textual
171–176: 4.316 testes frontend em 329 arquivos, 90 de scripts e 3.477 de Functions.
Passaram skills, arquitetura, docs, styleguide, formatação, lint completo, sintaxe
de 352 módulos, tipos, build de 3.028 módulos e smoke do bundle.

Cobertura frontend: 89,94% statements, 85,71% branches, 91,12% functions e 93,24%
lines, acima dos limites existentes 85/75/90/85, sem alterar configuração. A
execução usou VITEST_MAX_WORKERS=1 somente no ambiente do processo. Node 24.21.0;
Node 22 não foi executado. O build preserva os avisos existentes de chunks acima
de 500 kB e imports dinâmicos sem separação efetiva, sem erros.

Os hashes dos 11 arquivos de código/testes foram reconferidos contra o início
da validação; somente documentação recebeu o resultado final. CI remota continua
ignorada conforme o operador; o resultado é local.

Universo autorizado, personas na biblioteca, mídia, agregados/audit/ativação,
recuperação cifrada/UI e roundtrip continuam obrigatórios. P2/P3/D/F2-09, fases
seguintes, gates humanos/comerciais e macro 8/35 permanecem abertos. Somente commit
local com hooks normais; sem CI/push/PR/merge/deploy/agentes. Dev server preservado.
