# P1 / M38c3n L3A — Composição de lore a partir de reserva

## Objetivo e sequência

Permitir preparar e auditar a primeira geração de uma ficha sem cabeça anterior.
Este é o primeiro passo de L3 do plano 89; L3B ainda deve ativar cabeça,
geração, leases, clock, datas e comprovante da criação na mesma transação.
Não expor callable/UI nem permitir adoção da fonte creation antes de L3B.

## Contratos e aceites

1. Intenção creation substitui inspection, nunca ambas. Exige referência nativa
   creationId/startHash/jobToken, sourceToken igual ao token do criador,
   uploads explícitos de name/category e definição explícita de relações.
2. Fonte creation tem contexto próprio com creationBirth/bookBirth, sem fingir
   nascimento/atualização de cabeça ou inspeção. Carrega apenas metadados vazios
   e a abertura viva da reserva. Cada unidade revalida reserva e livro.
3. Start cria binding/prova permanentes da tentativa e job na mesma transação,
   com nascimento acoplado. Get/cleanup verificam a origem histórica sem
   reautorizar conteúdo. Contexto, binding ou prova recriados bloqueiam.
4. Antes de habilitar o start, ampliar cancelamento do criador para tentativas:
   cancela uma tentativa por unidade usando o mesmo tx, depois uploads não
   reservados; coleta até 16 partes e header por último, preservando controles.
   Audita gerações canceladas, inventários coletados, tentativas e leases
   conhecidos sem excluir metadados de procedência. Órfãos/desconhecidos bloqueiam.
5. Compor sem base: campos obrigatórios explícitos, ausências opcionais reais,
   relações explícitas inclusive vazio/ausente. Auditoria usa os mesmos
   parser/SHA e limites existentes. Nenhuma cabeça, clock ou publicação muda.
6. Cancelar antes/durante/após compilação, replay/CAS, rollback e concorrência,
   revogação/deleting/root ausente, vínculos/partes recriados e exclusão do livro
   precisam preservar recursos alheios e comprovar limpeza dos próprios.
7. Testes Node dirigidos e Firestore SDK real em emulador demo loopback;
   regressões dos editores/uploads/cleanup afetados. Sem CI remota.
   npm run validate integral no fechamento de P1.

## Arquivos, riscos e próximo passo

Alterar contratos/store/start de edição, fonte/compositor, cancel/journal de
criação e adicionar binding/auditoria de tentativas. Testes e helper dirigidos,
documentação/ADR/AGENTS/evidência. Sem dependências, Rules ou índices novos
esperados; reavaliar somente se as consultas reais exigirem.

Evitar ciclo CreatorStore -> EditStore -> FieldStore -> CreatorStore.
Inventário usa origem explicitamente tipada; nunca interpretar timestamp da
reserva como nascimento de ficha. Eventos e bindings ficam após cleanup.
Bloquear adoção creation explicitamente até L3B; não declarar criação pronta,
P1/F2-09 ou Writer V2 concluídos. Somente commit local com hooks.

L3B: prova nativa de adoção histórica e ativação atômica; reader deve aceitar
somente cabeça com o nascimento original dessa ativação. Integrar reedição,
remoção e exclusão do livro sem apagar sucesso histórico.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-composicao-do-lore-a-partir-da-reserva.md)
e [ADR 0106](../../../decisions/0106-creation-lore-composition-and-attempt-cleanup.md).
314 Node distintos e quatro SDK positivos em rodadas dirigidas. Arquitetura,
sintaxe dos 220 módulos e lint dirigido passaram.

L3A implementado internamente: composição certificada sem cabeça e cleanup de
tentativas/filhos reserved. L3B ainda deve ativar e comprovar sucesso histórico.
Nenhum endpoint/UI; criação completa e P1/F2-09/V2 permanecem abertos.
Validate integral no fechamento de P1, commits somente locais, CI ignorada.
