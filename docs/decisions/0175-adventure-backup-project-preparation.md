# ADR 0175 — escolhas e preparação da aventura no backup

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Estender definições/codec do leitor de recursos com progress (singleton
workProgress/current opcional) e checklist (coleção workChecklist física).
Nenhuma nova lógica de leitura: reusar metadata/autorização/token/faixas.
O controle já faz parte da fonte 147; sua alteração invalida a fonte anterior.

Progress conserva somente editorialState/wordGoal/updatedAt declarados.
Ausência de controle/campo não inventa default, wordGoal null permanece null.
Checklist conserva title/completed/datas, inclusive concluídos. Autoriza
pelo caminho privado da raiz: produtor não grava owner/schema próprios.
Se presentes, dono/schema incompatíveis e flags/marcadores inválidos falham.

Contadores/revisões/recibos/jobs/cursores de contagem não são escolhas do autor
e não bloqueiam preservação das tarefas. Restaurador futuro deve reconstruir
totais/índices a partir do estado real. Preferências de fuso e atividade/
retomada da conta ficam em users e não são copiadas pelo backup do projeto.

## Limites

Não muda writer/Rule/runtime/persistência/UI/dependência nem o contrato de
livro. Pacote integral, histórico, persona/mídia e restauração permanecem
pendentes. Validate integral no fechamento do bloco P2.

[Plano 152](../tasks/writer-v2/execucao/152-metas-e-checklist-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-metas-e-checklist-no-backup-de-aventuras.md).
