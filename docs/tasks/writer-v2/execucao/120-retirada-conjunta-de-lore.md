# P1 / M38c5v — Retirada conjunta de lore

## Problema e objetivo

loreEntityToken inclui listToken/localLoreVersion. Aplicar retiradas singulares
em sequência invalida as fontes seguintes; reconstruir tokens depois da aprovação
não preserva a seleção revisada. Visibilidade já tem primitiva interna de adoção
conjunta (ADR 0110). Falta retirada conjunta com prova do mesmo commit.

Preparar e confirmar uma unidade interna de 1..50 retiradas na transação do
caller, reusando a retirada singular sem alterar seu contrato. Esse é limite
da unidade transacional, não da seleção/autoria: o futuro coordenador deverá
preservar a seleção completa e dividir unidades sem trocar a origem aprovada.

## Requisitos e sequência

1. Extrair início da retirada em plano de leitura/validação e commit de writes.
   Singular usa o mesmo plano e mantém DTO/contexto/recibos/cleanup/handoff.
2. Lote exige UID/livro/nascimento iguais, alvos e IDs distintos, inspeções ready
   e sourceTokens originais. Leituras irmãs devem terminar antes de rejeitar.
3. Calcular timestamp/clock/privacidade conjuntos; retirar todas as cabeças,
   criar contextos/estados/tombstones/provas e atualizar raiz/publicação uma vez.
   Falha de um membro ou do caller impede todo o commit.
4. Comprovante e prova imutáveis abaixo da primeira retirada, metadata sem prosa.
   Revalidar manifesto ordenado, contextos originais e nascimento compartilhado
   para replay/histórico, inclusive após cleanup/exclusão do livro.
5. Recibos individuais ou documentos recriados não comprovam lote. Prova
   ausente com retirada já presente gera conflito; não alegar ausência do evento.
6. Serviço interno start/get; não registrar callable nem ampliar allowlists/
   journals existentes. Não adicionar formato de contexto aos filhos.
7. Testes Node dirigidos de nova primitiva e regressões singulares/transporte;
   SDK real em emulador para atomicidade, nascimento, rollback e Rules privadas.
   Sintaxe/docs/revisão/evidência/ADR 0135/commit local.

## Arquivos previstos

bookLoreRemovalStart (preparação compartilhada), RemovalBatch/Contracts,
refactor de start singular, fixtures/testes Node/SDK. AGENTS, arquitetura,
testes, execução, ADR e evidência. Sem UI, deps, Rules, env ou remoto.

## Aceite e fronteira

Uma transação/clock por unidade, origens intactas até commit e replay sem novo
efeito. Mistura de livros, duplicatas, fonte alterada, retirada prévia sem prova
conjunta e perda/recriação de comprovantes são recusadas. Estado/bytes de outros
alvos permanecem; cleanup continua limitado por ficha e handoff original.

Coordenador da seleção completa, orçamento real das unidades, transporte,
recuperação, UI de lote e composição final do compêndio continuam necessários.
Não impor 50 como limite de seleção nem remover ações existentes. Não publicar
a primitiva isoladamente. Lifecycle/consumidores/backup/rollout/validate de P1,
Writer V2 e fases/gates restantes abertos. Testes dirigidos; validate no fim de P1.

## Resultado local

Primitiva de preparação/commit e serviço interno implementados; início singular
compartilha o plano. Prova conjunta e jobToken nativo, histórico, cleanup e
handoff preservados. 103 casos distintos positivos em rodadas (24 novos),
incluindo cinco SDK e unidade de 50 em emulador. Lint/sintaxe positivos.

[ADR 0135](../../../decisions/0135-atomic-lore-removal-batches.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-retirada-conjunta-de-lore.md).
Coordenador da seleção completa/orçamento/transporte/recuperação/UI e compêndio
continuam necessários, sem trocar origem ou impor cap de seleção.
Demais fases/gates e validate de P1 abertos. Sem CI/envio remoto/deploy.
