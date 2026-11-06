# Incremento 42 — checkpoints históricos de redação e preservação

## Critérios e limite

Preservar estado técnico e solicitação própria dos jobs/unidades de redação da
primeira versão e de marcos de preservação. Vincular propostas e versões somente
quando sua identidade original puder ser conferida. Não copiar corpos para os
checkpoints nem permitir retomada, aplicação, débito ou publicação pela restauração.

Implementados bookEditorialCheckpointCapture e draft-job/unit, milestone-job/unit,
totalizando 28 famílias internas. Processo portátil preservation e contadores
verifiedUnits/adoptedUnits distinguem preservação, verificação técnica e adoção de
texto existente. Não há endpoint, produtor ou restauração editorial v2 habilitados.
Objetivo integral ativo; 0/5 etapas formalmente encerradas.

## Registros próprios e metadata

O leitor usa máscaras fechadas de metadata. A autorização do livro e a reconferência
da origem continuam no capturador comum. Jobs com schema não suportado geram
checkpoint indisponível, sem interpretar seu corpo como schema conhecido.

A redação guarda checkpoint desabilitado e documento de instrução própria,
colaboração/configuração pública e limites históricos explicitamente registrados.
Esses limites são texto histórico, não uma standing authorization portátil.
Configuração efetiva é snapshot público congelado; não inclui credenciais,
budgets do provedor, controles ou recibos. A ausência legada de créditos gastos
não é preenchida a partir de contadores de prosa.

Aplicações de IA e texto existente adotado têm contadores distintos. O marco
registra unidades planejadas/capturadas/verificadas e palavras quando presentes.
Verificar preservação não certifica revisão, qualidade literária ou publicação.
Cancelar antes do primeiro envio gera apenas checkpoint, sem alvo, instrução ou
contadores inventados. Pausa é registro histórico, sem nextAction executável.

Unidades guardam checkpoint com associações a pai, proposta e versão. Estados e
contagens são históricos: não se atualizam silenciosamente para alegar que uma
versão/proposta continua disponível. Nenhuma captura escreve estado do job.

## Testemunhos nativos privados

Novos jobs fixam nascimento do capítulo. Novas unidades de redação fixam nascimento
do job e da cena durante a enumeração. A passagem para awaitingAcceptance fixa a
identidade da proposta somente após conferir requestId, capítulo, cena, modo,
estado, revisão, cobertura e geração contra a resposta nativa. As leituras ocorrem
antes das escritas da transação.

A adoção explícita de texto existente registra nascimento da versão de histórico
junto ao checkpoint e confere ID, alvo, recurso e hash. O marco registra nascimento
do job e versão na mesma transação que confirma a unidade capturada. Esses dados
ficam em captureBinding privado, sem alterar os DTOs públicos. Não há nova coleção,
crédito adicional ou alteração do protocolo de exclusão.

Legado sem testemunho não recebe nascimento observado como se fosse o original.
A associação fica desconhecida/indisponível. Captura não produz backfill nem
reconcilia ou reenvia pedidos. As reservas/recibos e os escritores nativos continuam
sendo os mecanismos operacionais existentes.

## Referências e corpo

A identidade do pai é comparada antes de uma referência disponível. Capítulo/cena
exigem nascimento original e metadata de pertencimento vigente; desaparecimento
ou recriação não elimina a instrução própria, mas fecha a referência.

A proposta usa exatamente o ID arquivístico da família Prose. Antes de ler seu
cabeçalho de autorização, confere nascimento por leitura somente de schemaVersion.
Proposta recriada fica indisponível. Somente done/applied com o gate nativo de
Prose conferido podem gerar referência disponível. O checkpoint não abre o corpo
em cache da proposta; o gate nativo pode ler fontes atuais para reautorizar.

A versão de histórico usa metadata fechada e compara nascimento original, ID,
alvo/recurso, ausência de deleting e hash real do conteúdo registrado. Não lê
workVersionBodies nem copia o texto. Hash de conteúdo não é preenchido com um token
nativo. A captura completa do histórico continua responsável pelos bytes/provas na
composição futura. Versão recriada, mesmo com o mesmo ID/hash, fica indisponível.

Checkpoints não carregam fingerprints, tokens, cursores, operationIds, ponteiros
de produtores, captureBinding ou controles. Cada parte e verificação final repetem
origem/projeção com pins nativos de pais, recursos, proposta e versão conferidos.
Bundles têm no máximo dois artefatos e 1 MiB; partes existentes de 64 KiB. O host
futuro deverá desmembrar esses registros e compor suas referências com as demais
famílias/histórico.

## Casos preparados e limite da evidência

Preparados 16 casos Node e dois de SDK real, nenhum executado. O helper compartilhado
prepara contrato, cenas, planos, gate, redação, aceite/adoção e preservação pelos
serviços nativos; importar o helper não executa casos. Cobrem instrução/contagens,
processo de preservação, vínculos entre famílias, metadata sem corpos, adoção sem
débito de IA, legado, recriações de versão/proposta/pai, perda de fonte, cancelamento
inicial, schema desconhecido, ausência de controles, reautorização final e remap
privado/desabilitado. Casos SDK conferem transações nativas e identidade preservada.

Revisão manual somente. Nenhum teste, typecheck, lint, formatter, build, browser,
coverage, validate ou diff-check executado neste incremento. Resultados anteriores
sobre b666233 não validam os incrementos 37–42. Sem commit literário, merge de volta,
push ou deploy. Nenhum processo de teste iniciado.

## Continuidade

Capturar checkpoints restantes de workflows, sequências e impacto pelos seus gates
nativos, completando associações sem inventar origem. Implementar host produtor com
pressão de consumo, censo, provas finais, footer/selo e arquivo provisório confirmado.
Implementar restauração útil de contrato/planos e histórico privado com inventários,
cleanup, ativação atômica e revisão da UI. Auditar E1–E5, incorporar novamente a
principal antes dos testes finais e obter gates integrais, cobertura 90% e Rules
completas. O objetivo não foi reduzido à fundação do backup.
