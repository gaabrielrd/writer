# ADR 0076 — Universo original na preparação da restauração

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M32, depois da ADR 0075

## Problema

A origem no arquivo identifica um universo, mas não concede acesso. Preparar a
cópia pode demorar; autorização e nascimento precisam ser conferidos novamente
ao ativar o livro. Duplicar lore ou religar por ID após recriação violaria M7.

## Decisão

advanceBookRestoreUniverse é interno e consome book-universe pelo leitor M21,
com verify(tx) no commit. Os descriptors fechados none/unavailable/reference
mantêm o contrato M7. None não lê origem; unavailable não consulta o ID nem é
promovido se ele reaparecer. Reference exige authorId próprio, não deleting e
createTime exato em segundos/nanossegundos. Origem ausente, alheia, pública de
outro autor, deleting ou recriada é observada igualmente como indisponível.

A leitura de disponibilidade usa máscara authorId/deleting e metadados nativos.
Nome, descrição e lore não entram no job/recibo. Preparação v6 registra somente
índice, descriptor e observação, avança para history e preserva resourceEndIndex,
personas e contagens. Nenhuma raiz, uso ou contador global é gravado.
O inventário continua v9: não há novo recurso a limpar. Progresso v5/v6 e
recibos anteriores permanecem compatíveis, inclusive após cancelamento.

prepareBookRestoreUniverseLink compõe a futura ativação. Confere job atual e
nascimento/versão nativos, item verificado da mesma cópia e descriptor igual ao
preparado. Reautoriza agora a mesma origem; a observação anterior não autoriza.
Se acessível, usa prepareUniverseProjectLink com strict true e devolve commit
separado. O chamador deverá confirmar seus efeitos junto da raiz autorizada na
mesma transação. Se indisponível, universeId null e nenhum efeito global.
Contador ou uso inconsistente interrompe a transação; não equivale a perda de
acesso e não deve ser mascarado como simples desligamento.

## Consequências e limites

O planejamento não copia universo nem lore global. A revalidação final permanece
obrigatória mesmo após observação available. Reference pode ser novamente
avaliada com a mesma identidade e autorização vigente; unavailable nunca vira
reference por lookup. Não há novos papéis ou permissão por universo público.

Os testes com raiz sintética provam composição e rollback do vínculo, não a
ativação integral da restauração. Raiz ausente/countReady false continuam no
fluxo de produção. Faltam histórico/rascunho/capa, integração das personas,
campos grandes e consumidores, certificação/ativação final e host/UI/roundtrip.
P1/F2-09 e Writer V2 seguem abertos. Validate integral fica no fechamento P1.
Sem nova API pública, Rule, coleção, dependência, crédito, CI/push/PR/deploy.
