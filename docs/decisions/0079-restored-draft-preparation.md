# ADR 0079 — Contribuição do rascunho na preparação privada

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M34b, depois da ADR 0078

## Problema

O rascunho explícito pode ser vazio, exceder um documento ou pertencer a capítulo
removido. Deve ser preservado separado do texto salvo. Criar um manifesto de
histórico antes de conferir contagem e preservação portátil dos metadados
inventaria estado pronto e poderia expor uma contribuição incompleta.

## Decisão

advanceBookRestoreDraft é interno. Consome book-draft e uma parte raw por unidade
pelo leitor M21, com prova do item e bytes no commit. SHA incremental e tamanho
integrais encerram a contribuição. Não há novo limite total de texto nem captura
de todas as partes na RAM da preparação.

Comparar hash/tamanho com capítulo legado comprovado, por texto inline ou
manifesto lógico válido. Igual ao salvo não duplica corpos. Ausente/diferente
prepara workVersionBodies sob identidade de domínio próprio, distinta dos IDs
dos históricos remapeados. Campo congelado de capítulo composto não representa
o manuscrito atual; não serve para descartar um rascunho.

O perfil vem do item verificado. Definição existente exige hash/igualdade e prova
nativa; definição ausente exige a contribuição exclusiva M34a e é preparada sob
o job. Definições compartilhadas idênticas não são regravadas. Biblioteca atual
não é consultada; draftProfileId permanece estável.

preparedDrafts/current guarda estado none ou metadados integrais do capítulo,
vínculo/hash do perfil, resultado saved/version, identidade/totais/hash do corpo.
Não contém a prosa completa. Nenhuma data ou contagem é inventada.
Inventário v11 inclui esse namespace antes dos writes e certifica vazio.
Partes/perfil/descriptor/journals/cursor/recibo são atômicos. Cleanup limita e
mascara leituras, confere nascimentos e remove também partes sem descriptor,
preservando outras cópias/biblioteca e encarnações recriadas.

Preparação v8 fixa o início do rascunho, conta partes/bytes/corpos e conserva
cursor no item até fechar o hash. Depois consome o item uma vez e termina em
draft-finalize. Histórico anterior permanece reconciliado; inventários v1–v10
e recibos continuam compatíveis. Capa ainda não é consumida.

## Consequências e continuação obrigatória

Não criar workVersions nesta etapa nem inventar wordCount zero.
M34c deverá conferir contagem, preservação portátil de metadados/perfil e todos
os corpos, finalizar a versão separada e somente então liberar o passo da capa.
Nenhuma versão utilizável ou raiz foi ativada. Raiz ausente/countReady false.

O descriptor preserva metadados mesmo quando o texto já está salvo.
Texto vazio presente produz contribuição distinta de none. Capítulo removido
não é recriado. Metadata que excede o envelope nativo falha intacta;
representação integral desses campos permanece obrigatória antes da ativação.

Faltam finalizar a versão, capa, integração de personas, campos grandes/
consumidores, certificação/ativação e host/UI/roundtrip/validate.
P1/F2-09 e Writer V2 abertos. Sem API pública, Rule, dependência, crédito,
subagentes, CI/push/PR/deploy novos.
