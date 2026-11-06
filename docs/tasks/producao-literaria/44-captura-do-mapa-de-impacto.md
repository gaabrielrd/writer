# Incremento 44 — captura interna do mapa de impacto

## Critérios e limite

Preservar controle, topologia, propagação e verificações técnicas do mapa sem copiar
rótulos/corpos privados, reativar o motor ou tratar metadados como grants. Manter a
mesma reautorização nativa exigida pelo leitor dos derivados, com UID/origem antes
da leitura de conteúdo.

Implementados bookEditorialImpactCapture e sete famílias: impact-control, impact-graph,
impact-node, impact-link, impact-visit, impact-witness e impact-check. São 37 famílias
internas. Decisões próprias continuam nas famílias impact-current/version já
implementadas; não são duplicadas no novo relatório técnico. Nenhum endpoint,
produtor ou restauração editorial v2 foi habilitado. Objetivo integral ativo e
0/5 etapas formalmente encerradas.

## Gate compartilhado e sem escrita

inspectLiteraryImpactCurrent extrai a conferência antes privada do controlador:
registro nativo de inventários, escopo autorizado atual, scopeToken, UID/fence do
grafo, nascimento original e versão agregada do inventário. O fallback legado é
somente o mesmo testemunho nativo exato de criação do grafo/atualização do controle.
Não se promove uma cabeça observada a original por conveniência.

O controlador usa esse mesmo helper, preservando o comportamento para registros
válidos. O helper não escreve estado e a captura não usa load/advance do motor do
grafo, que podem retirar estado stale ou continuar propagação. Não executa IA,
débito, preparação de índices ou reconciliação.

O capturador lê primeiro UID, livro/nascimento, controle/nascimento, ID e versão.
Só seleciona intent/census/configuração do controle depois de autorizar esse contexto.
UID diferente, livro/controle recriados ou schema não suportado geram indisponibilidade.

Derivados exigem ainda inspectLiteraryImpactCurrent e UID/schema/origem do grafo
antes de selecionar node/link/visit/witness/facts. Mudança de registro, escopo,
fontes ou grafo fecha o conteúdo. O pedido próprio e contagens históricas do controle
continuam preservados sob seu gate autoral, como no resumo nativo, sem declarar que
o grafo permanece válido. As fontes multi-livro/universo são reautorizadas pelo
leitor/fence nativos; o backup não ganha autorização por descriptors antigos.

## Projeções e topologia

Controle gera checkpoint impact desabilitado e documento com fontes solicitadas,
preparação de índices solicitada e contagens agregadas históricas do censo. Não
exporta inventários internos, cursores, preparação em andamento ou seus hashes.

O grafo gera checkpoint técnico de visitas e documento com contagens de nós,
vínculos, visitas e testemunhos. Não afirma leitura de corpo nem completude
semântica. Cada nó gera documento de arquitetura com tipo/âmbito e descriptor de
recurso indisponível; o descriptor conserva procedência, sem conferir acesso atual.

Cada vínculo registra sua relação nativa e referências direcionadas aos nós de
origem e destino. Cada visita conserva efeito, profundidade e estado histórico,
com referências à origem da propagação e ao nó visitado. Cada testemunho conserva
origem, visita anterior, vínculo e visita seguinte. A origem precisa ser a mesma
nos dois visitKeys e corresponder ao sourceKey nativo; não vira evidência de prosa.

IDs dos artefatos usam livro/nascimento, controle/nascimento, grafo original e
família/ID lógico nativo. Referências entre registros calculam o mesmo ID e só
ficam recorded após conferir a presença e chave metadata do destino. Nós ausentes
em vínculos não incluídos, por exemplo por fonte não suportada, ficam unavailable
em vez de fabricar vértices. Referências ao controle não mudam com a encarnação
do grafo.

A verificação técnica gera relatório impact com flags/estados nativos selecionados,
relação e endpoints conferidos. Metadados complexos de prova não se tornam conteúdo
portátil ou autorização. As citações/decisões próprias ficam em suas famílias.
O relatório não cria evidenceIds ou findings literários a partir de uma verificação
técnica. Cobertura é registered-dependencies, uma unidade, explicitamente sem
leitura integral, revisão editorial, completude semântica, aceite ou publicação.

Vínculo e verificação preservam uma chave lógica opaca comum quando registrada.
Ela correlaciona a observação dentro do contexto do mapa; não é hash de conteúdo,
ponteiro físico ou grant. Tokens/captures nativos usados para calcular identidades
não são copiados. Homônimos, escopos e vínculos distintos conservam identidades
separadas; não se resolve origem por nome ou detecção textual.

## Privacidade e transporte

Não são selecionados rótulos dinâmicos, prosa, lore, persona, respostas de chat ou
resultados de IA para compor o pacote. Descriptors tipados preservam IDs/escopos
externos somente como procedência indisponível; não incluem credenciais ou prova
de acesso. Tipos sem equivalente nativo portátil usam descritor opaco indisponível.
UID de controle, births, originToken/scopeToken, sourceFence, registryToken,
fingerprints, recordToken/proofHash, cursor e captura de origem não entram no DTO.

Cada parte e conferência final repetem a projeção e seus gates. Pins acompanham
controle, grafo e destinos metadata efetivamente conferidos. Bundles têm no máximo
dois artefatos e 1 MiB; partes de 64 KiB. O host futuro deve desmembrar os registros,
compor referências e reconferir censo/provas antes do selo.

## Casos preparados e evidência

Preparados 12 casos Node e dois de SDK real, nenhum executado. O helper usa o
controlador nativo para registrar, congelar e opcionalmente percorrer o mapa.
Cobrem pedido/censo, topologia completa com referências, direcionalidade e
testemunhos, contagens/escopo técnico, UID antes de intent/census, mudança do registro
antes de payload, recriação de grafo/controle/livro, chaves inválidas, origem do
testemunho, privacidade, reconferência final e remap privado/desabilitado. SDK confere
identidades entre controle e grafo e seleção de campos somente após os gates.

Leitura e revisão manual somente. Nenhum teste, typecheck, lint, formatter, build,
browser, coverage, validate ou diff-check executado neste incremento. A rodada
anterior sobre b666233 não valida os incrementos 37–44. Sem commit literário,
merge de volta, push ou deploy. Nenhum processo de teste iniciado.

## Continuidade

Compor o host produtor com catálogo de famílias, censo completo, desmembramento/
aliases/referências, stream com pressão de consumo, provas reconferidas antes de
footer/selo e arquivo provisório confirmado somente no sucesso. Fechar as lacunas
de origem/clock necessárias antes de habilitar o produtor. Implementar restauração
útil de contratos/planos e história privada com inventários, cleanup, ativação
atômica e revisão da UI. Auditar E1–E5, incorporar novamente a principal antes dos
testes finais e obter gates integrais, cobertura 90% e Rules completas. A fundação
interna não encerra o objetivo original nem autoriza ativar portabilidade incompleta.
