# Writer V2 — auditoria das chaves históricas de lore

- Data: 2026-10-25.
- Plano: [127](../tasks/writer-v2/execucao/127-auditoria-das-chaves-historicas-de-lore.md), P1 / M38c8.
- Decisão: [ADR 0146](../decisions/0146-historical-lore-recovery-key-audit.md).
- Estado: ferramenta implementada e validada localmente; P1 e V2 permanecem abertos.

## Objetivo e funcionalidades

Auditar controles de recuperação por UID, por páginas de até 50, sem ler
material AES ou prosa. O relatório separa livros existentes, controles já
revogados, candidatos e casos para revisão. Somente candidatos revisados
podem ser aplicados explicitamente.

Livro ausente e marcador de exclusão válido, com cronologia nativa posterior
à reserva, são exigidos. Livro recriado, marcador alterado, prova divergente,
chave/índice recriados e resíduo inesperado são preservados. Controles legados
e de criação usam suas provas originais, sem fabricar uma raiz.

Aplicação reconfere a revisão e remove chave/índice originais com terminal/
prova no mesmo commit. Permite confirmar fechamento anterior e retomar
aplicação parcial sem remover resíduo posterior. Recibos e controles ficam.

CLI exige projeto e UID explícitos, só lê por padrão e aplica arquivo revisado
do mesmo escopo. Arquivo de metadata de até 1 MiB/50 itens, flags/campos fechados
e validação antes do SDK. Erros de infraestrutura interrompem a operação;
saída parcial não expõe diagnósticos privados.

## Critérios e arquivos

- [x] Auditoria paginada somente de metadata e UID indicado.
- [x] Ausência/marcador/provas originais exigidos antes de revogar.
- [x] Relatório fixa identidade de controle e marcador, sem grant.
- [x] Revalidação e revogação atômicas, com confirmação idempotente.
- [x] Preservação de recriados/resíduos e casos sem evidência.
- [x] CLI padrão de leitura e aplicação só por revisão do mesmo escopo.
- [x] Falha parcial, limites e sanitização verificadas.
- [x] Node/SDK/executável real no emulador, documentação e commit local.

Novo serviço bookLoreRecoveryAudit, CLI administrativa e testes Node/SDK;
plano, ADR, [operação](../lore-recovery-audit.md), AGENTS, arquitetura/testes e
registros de execução. Nenhuma RPC, Rule, writer normal, UI ou dependência mudou.

## Testes e resultados

**45 testes Node distintos positivos** em dois arquivos, sem skipped:

- bookLoreRecoveryAudit: 23; legado/indexado/criação, marker inválido, origem
  presente/recriada, key/index/prova recriados, revisão velha, paginação/UID,
  infraestrutura, guardas de argumentos, ausência e rollback.
- bookLoreRecoveryAuditCli: 22; escopo/flags antes do SDK, leitura padrão,
  revisão de outro UID/projeto, campos/duplicatas inválidos, aplicação parcial,
  retomada, sanitização, arquivo grande/malformado e UTF8/BOM.

**Quatro testes SDK positivos**, sem skipped:

1. Timestamp legado, relatório sem alterações e duas revogações concorrentes,
   com exatamente um fechamento e provas atômicas.
2. Marcador alterado e livro recriado invalidam a revisão.
3. Falha no último delete do índice reverte terminal/chave; retry explícito conclui.
4. Executável CLI real gera relatório e aplica o arquivo no emulador local.

Firestore Emulator 1.22.0, JAR verificado, projeto demo e loopback.
Sem operação, credenciais ou acesso de produção. O primeiro smoke SDK tinha
três casos e passou; o quarto acrescentou validação do executável real.
Não somar repetições ao total distinto.

Artefatos fora do Git em writer-v2-portability-qa:
m38c8-node.tap, m38c8-sdk-final.tap, m38c8-sdk-emulator.log e runner m38c8-sdk.mjs.

## Checks e limites

Sintaxe dos 259 módulos Functions e da CLI, lint dirigido, arquitetura,
documentação, formatação e diff positivos. Sem repetir browser/build/Vitest,
pois não houve alteração da aplicação cliente nem dos writers normais.
Validate integral continua no fechamento de P1, conforme orientação do operador.
Somente commit local; sem CI/push/PR/merge/deploy.

Nenhuma conta de produção foi auditada. Relatório não comprova inventário
global vazio nem limpeza de todos os recursos do livro. Órfãos sem controle/
marcador e casos de revisão exigem reconciliação individual; nenhuma remoção
heurística foi implementada. Material já autorizado e cópias locais permanecem.

Operação real em escopo autorizado, demais namespaces/escritores/consumidores,
backup/restauração, inventário completo, drain/rollout/validate de P1 e fases
3–5/gates humanos/comerciais continuam necessários.
