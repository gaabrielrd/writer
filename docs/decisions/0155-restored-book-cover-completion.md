# ADR 0155 — Finalização recuperável da capa restaurada

- Status: serviço interno implementado/validado localmente; host/limpeza/P1 pendentes.
- Data: 2026-10-25.
- Plano: [134](../tasks/writer-v2/execucao/134-finalizacao-da-capa-restaurada.md).

## Decisão

Após ativação, finalizeBookRestoreMedia autoriza job/recibo/reserva originais e
definições/intenção de capa. Registro preparing deve ter nascido no commit de
ativação e manter origem, caminho e prova originais. Contador e uso precisam ser
consistentes; uso recriado ou estrangeiro bloqueia a conclusão.

Adaptador Storage faz PATCH somente de metadata, fixando generation e
ifGenerationMatch/ifMetagenerationMatch como strings decimais. Não regrava bytes.
accepted true/restoreState active, UUID de download e metageração preparada
permitem recuperar uma resposta perdida com o mesmo token. Estado aceito exige
geração original e exatamente a metageração seguinte. Fence, recriação ou metadata
alterada não são adotados. SDK instalado e contrato HTTP loopback conferem isso.

Após o I/O, reautorizar registro e dependências. Ativar imagem/URL na biblioteca,
URL da raiz quando aplicável, conclusão e recibo em um commit Firestore. Não
alterar contador ou uso. Atualizar raiz só com dono/nascimento/origem originais,
uso presente, mesma capa/URL pendente e sem exclusão. Livro excluído/recriado ou
que trocou a capa é preservado; imagem própria pode concluir independentemente.

## Histórico e disponibilidade

Conclusão imutável em activationMedia/current; recibo privado separado em
bookRestoreMediaOperations, com nascimento nativo comum e hash/contexto original.
Ambos guardam só metadata, sem URL, token de download ou prosa. Job/recibo/reserva
de ativação permanecem intactos. Sem capa conclui none sem I/O Storage.

Mesmo operationId confirma o recibo original. Nova operação após conclusão retorna
already-complete com a conclusão original, sem reservar novo recibo ou repetir
efeitos. Uma operação já usada para outro contexto é recusada antes disso.

getBookRestoreMediaState separa conclusão histórica de imageState atual:
preparing, available, unavailable ou none. Readiness não concede acesso nem prova
disponibilidade futura do arquivo. Registro removido/recriado não fornece URL por
replay. Imagem excluída durante finalização causa erro sem conclusão falsa ou
recriação; a interface deve apresentar indisponibilidade e preservar os dados.

## Consequências

São namespaces privados novos, cobertos pelas Rules de restauração e por negação
explícita dos recibos. Não há novo callable/endpoint. Limpeza posterior deve guardar
conclusão/recibo e provas necessárias, sem usar cancelamento de um livro ativo.

Falhas depois do PATCH podem deixar arquivo aceito com registro preparando:
retomada conclui o commit sem trocar token. Não há transação distribuída.
Remoção concorrente vence; não recriar arquivo ou registro em exclusão.
Host/UI, limpeza pós-ativação, roundtrip integral, inventários/legados/rollout/
validate de P1 e demais fases/gates continuam.
[Evidência](../entregas/2026-10-25-writer-v2-finalizacao-da-capa-restaurada.md).
