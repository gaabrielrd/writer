# P2 — agregados da aventura restaurada

Base: 10708fd. Continuação de 182, dentro da restauração aprovada.

## Objetivo, suposições e não escopo

Reconstruir agregados nativos, ledger de palavras e referências da cópia privada
antes da auditoria/ativação. Contagens do arquivo não são autoridade. Reutilizar
countVisibleWords e createWorkProgressLedger; manter texto, datas, audiências,
arquivo e originais. Sem nova decisão de produto ou dependência.

Raiz permanece reservada sem ownerId, personas preparing e countReady false.
Biblioteca/usos/aceitação/URL, auditoria/ativação, recuperação/UI/roundtrip seguem
necessários. Nenhum endpoint público nesta etapa; P2/P3/D/F2-09, fases 3–5 e gates
humanos/comerciais continuam abertos. Macro 8/35 não muda.

## Sequência e arquivos

1. Ampliar endereço/journal/action e metadados das fases anteriores antes das
   primeiras escritas. workWordSources/workWordGroups já estão no inventário da
   raiz; incluir seus endereços hash e provar ausência/alvo/journal no prepare.
2. Serviço interno advanceAdventureRestoreCounts com três passagens limitadas
   sobre o índice de recursos: blocos, cenas/controles narrativos, links.
   Cursor privado/counts-blocks/counts-scenes/counts-links/counts-ready,
   contadores públicos fechados, checkpoint/recibo e replay antes da leitura.
3. Um bloco por unidade: conferir fonte/cabeça/corpo/SHA e contar texto visível.
   Somar palavras/quantidade somente de blocos ativos; nextBlockOrder considera
   todos os blocos, inclusive arquivados. Não mudar revisões iniciais head/body.
4. Uma cena por unidade: conferir corpo/cabeça e agregados; recompor agrupador,
   source/group ledger e controle no mesmo commit com journals. Usar proxy do
   ledger existente, provando previamente todos os alvos/ausências que ele lê.
   Cena arquivada/sem parte/órfã não contribui ao manuscrito; manter seu texto.
   Partes e unassigned contam cenas, palavras ativas e revisões iniciais.
5. Recompor revisões de sequências narrativas por recursos verificados, criando
   controles ausentes quando necessário sem inventar pais. Links incrementam
   somente o source direto; sourceArcId não soma links de marcos ao arco.
6. Conferir quantidades de cada passagem com o summary autenticado; total do
   ledger e controle coerentes, processed/phase/cursor finais consistentes,
   countReady false até futura ativação auditada. Cleanup de qualquer fase usa
   journals e preserva revogação de personas/fence de mídia primeiro.
7. Testes dirigidos Node, corpus real do Writer e SDK nativo: contagens esperadas,
   primeiro editar/mover/arquivar sem duplicação, limites, vazio/órfãos/arquivados,
   replay/CAS/rollback/ACK perdido, fonte/alvos alterados/recriados e cancelamento.
8. Revisão, ADR/AGENTS/architecture/progresso/evidência e commit local com hooks.
   Validate integral no fechamento do próximo grande bloco, conforme orientação.

Arquivos: adventureRestoreCounts/CountEffects/CountMeta; integração de
Artifacts/Contracts/Store/Transfer/StagingMeta e predicados de fases anteriores;
testes próximos, fixture/corpus/SDK e documentação. Máximo oito artefatos por
unidade; nenhuma transação ou lista em memória proporcional ao projeto inteiro.

## Riscos e critérios de aceite

Fingerprint do ledger inclui revisão/estrutura de blocos; não duplicar o algoritmo.
Revisões iniciais devem manter head/body coerentes. Conferir journal/nascimento e
conteúdo antes de adotar qualquer valor; não usar writers públicos sem raiz ativa.
Replay e falha de commit não somam duas vezes. Cancelar limpa ledger registrado,
sem remover originais ou liberar caminhos Storage de uploads antigos.

- [x] Totais e referências nativas reconstruídos, sem alterar prosa/originais.
- [x] Primeiro ajuste usa ledger correto; arquivo e órfãos preservados.
- [x] Replay/concorrência/rollback/cleanup e identidades cobertos.
- [x] Testes dirigidos/SDK, revisão, documentação e commit local.
