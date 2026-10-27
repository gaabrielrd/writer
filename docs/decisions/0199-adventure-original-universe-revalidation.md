# ADR 0199 — revalidar o universo original da aventura restaurada

Data: 2026-10-27. Estado: implementado internamente; ativação pendente.

## Contexto

A origem portátil neutra guarda none, unavailable ou reference com identidade
nativa de criação. A definição e o candidato de universo ficam em preparedRoot,
sem acesso autoral. A decisão aprovada exige religar ao universo original somente
enquanto houver acesso, sem duplicar universo ou copiar lore global. Um ID
coincidente ou uma observação antiga não prova esse acesso.

## Decisão

A inspeção comum foi extraída para portableUniverseRestore. Os adaptadores de
livro e aventura mantêm autenticação e seus erros tipados. Só reference consulta
metadata authorId/deleting do universo original; confirma segundos e nanos do
nascimento exato e exige proprietário atual e ausência de exclusão. Atualizações
legítimas não trocam identidade. None/unavailable não consultam nem promovem
um universo encontrado pelo ID, mesmo próprio/público.

advanceAdventureRestoreUniverse reabre a unidade original autenticada na posição
historyStartIndex. Prova a definição e o candidato pelos journals nativos e
compara a origem exata. Seleção, universeId na definição privada, journals,
recibo/checkpoint e fase universe-ready confirmam juntos. A view inclui somente
universeOutcome; campos anteriores do draft e recibos antigos permanecem válidos.
Outcomes em fases antigas e campos privados inesperados são recusados.

Essa observação não cria vínculo nem muda contador. Replay entrega o recibo
original sem representar autorização renovada. Cancelamento limpa os artefatos
com as provas existentes e mantém o marcador mínimo aposentado que impede
reutilização do ID. Universo, lore global e outros projetos permanecem intactos.

prepareAdventureRestoreUniverseLink serve à futura transação de ativação. Relê
job, fonte e artefatos, compara a posição/origem e o sourceToken da unidade com
o journal da seleção, e inspeciona novamente o acesso/identidade original.
Retorna universeId atual e o commit nativo strict de vínculo/contador.
O chamador deverá usar esse universeId na raiz ativa, mesmo se diferente da
seleção preparada, e confirmar todos os efeitos na mesma transação. Erro de
contador ou uso preexistente é inconsistência; não desvincular silenciosamente
para esconder corrupção. Uma reference pode voltar a ser autorizada se for
a mesma origem; unavailable do arquivo nunca é promovida.

## Consequências e limites

Não há endpoint, UI ou ativação nova. Os testes de composição de raiz/vínculo
são harnesses sintéticos: não substituem auditoria e ativação completas de P2.
A seleção disponível pode ficar indisponível; a consulta final é obrigatória.
Não se promete snapshot contra mutação administrativa depois da confirmação.
Nenhuma regra ou dependência nova. Personas, imagens, agregados/audit,
ativação, recuperação cifrada/UI/roundtrip permanecem obrigatórios.
