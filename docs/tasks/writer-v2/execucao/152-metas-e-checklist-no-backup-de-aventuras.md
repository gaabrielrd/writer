# P2 — metas e checklist no backup privado de aventuras

Base: 5cac1f7. Incremento interno pequeno: estado editorial/meta total e tarefas
privadas de preparação do projeto. Histórico vem depois, em contrato próprio.

Grafo consultado sem resultados; fallback em workProgress/Contracts e testes.
Native: workProgress/current guarda escolhas do autor e controles derivados;
workChecklist/id guarda title/completed/datas/revision, sem owner/schema próprios.
Cada mutação normal do checklist grava o controle na mesma transação. Fonte
147 já ancora presença/nascimento/updateTime desse controle.

## Contrato antes do código

Estender somente definições/codec 149: progress (singleton current, opcional)
e checklist (coleção física N+1 até 50, todas as tarefas). Reusar autorização
de raiz, máscara metadata, token nativo, captura da intenção e faixas 64 KiB.
Usar validador de controle legado para campos owner/schema presentes sem exigir
campos que produtor não grava; autoriza pelo caminho da raiz. Falhar se flags
de exclusão/rebalance ou marcador externo aparecerem.

DTO progress conserva somente editorialState/wordGoal/updatedAt declarados;
não cria defaults quando controle ou campo falta. WordGoal null ou inteiro
positivo, estado draft/review/ready. DTO checklist conserva title/completed/
createdAt/updatedAt literais. Título UTF-8 e conclusão booleana obrigatórios.
Datas zero e vazio/ausência permanecem distintos.

Não depender de checklistTotal/completed/countReady/wordCount ou jobs para
preservar escolhas/tarefas; esses controles serão reconstruídos na restauração.
Não exportar revisão/recibos/operações/cursores internos de contagem. Fuso,
preferências globais e atividade/retomada da conta moram em users e não são
estado autoral portátil deste projeto; não lê-los nem copiá-los.

## Sequência e validação

1. Duas definições/codec; leitor existente sem novos caminhos arbitrários.
2. Produtores reais de meta/checklist: criar/renomear/concluir/excluir, >50,
   ausências, zero/null/vazio, contadores inconsistentes ignorados, native
   mudança/ABA e source do controle; identidade/conta/inputs e nenhuma escrita.
3. Node dirigido e regressões do leitor estendido; SDK real de máscaras,
   produtor/Rules/identidades pertinentes; lint/sintaxe/docs/arquitetura/
   styleguide/format/diff. Validate integral no fechamento de P2.
4. Revisão, ADR/evidência parcial e commit local. Sem writer/Rule/runtime/UI,
   dependência, namespace persistido, CI/remoto/deploy/subagentes.

## Aceites

- [x] Escolhas de progresso e tarefas completas sem controles derivados.
- [x] Presença literal e provas/autoria nativas pelo leitor existente.
- [x] Produtores/testes/SDK/checks, revisão/docs/commit.
- [x] Histórico/demais famílias e pacote integral P2 continuam abertos.

## Resultado dirigido e revisão

115 Node positivos (21 novos + 94 regressões), sem skip, em 414,6244 ms.
Um SDK real positivo em 7.311,7541 ms, com produtores reais e controle ausente,
meta, 53 tarefas/52 atuais, máscaras, autoria/Rules e identidades nativas.
Lint dirigido positivo; checks finais acompanham o commit local.
[ADR 0175](../../../decisions/0175-adventure-backup-project-preparation.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-metas-e-checklist-no-backup-de-aventuras.md).

Sem novo reader/writer ou namespace; revisão confere estado do projeto separado
da conta e ausência distinta de default. Histórico e demais P2/P3/D abertos.
