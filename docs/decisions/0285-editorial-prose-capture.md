# ADR 0285 — captura histórica de propostas e análises de texto

- Estado: implementada localmente; execução dos testes adiada.
- Data: 2026-11-03.

## Contexto

Propostas e revisões de cena guardam resultados derivados de cenas, persona e
fontes editoriais congeladas. Copiar o pedido bruto levaria tokens e controles
operacionais ao backup. Exigir que a versão atual seja idêntica à original
apagaria resultados históricos ainda autorizados; ignorar revogação exporia os
mesmos derivados após perder acesso às fontes.

## Decisão

Reutilizar a autorização nativa de literaryProse por port interno, após metadata
e antes do cache. Separar instrução própria de resposta derivada. Representar os
artefatos por DTOs fechados e vínculos explícitos, sem registrar nova callable.
Estados históricos têm execução desabilitada e não representam aceite ou grant.
Cancelamento anterior ao envio conserva somente checkpoint de text-assistance,
sem inventar instrução, modo ou cena. Referências source/subject distinguem entrada
e saída mesmo quando a prosa fica indisponível.
Revogação gera indisponibilidade sem abrir o cache; cada parte e conferência final
reautoriza e reconfere a projeção original.

Adicionar cobertura de segmento fechada ao contrato portátil. Preservar citações,
offsets UTF-16, texto literal, revisão e procedência sem transformar tokens em
hashes de conteúdo. Representar fontes históricas alteradas por seus descritores
originais, sem rebase. Modelo e raciocínio ficam como snapshot histórico público,
sem credenciais ou configurações operacionais. Evidências explicitam documento,
texto simples e base de offset do texto fornecido; não prometem posições no HTML
nativo ou na serialização portátil de uma ficha.

## Consequências

O capturador interno passa a treze famílias. Transferência de até 45 registros e
2 MiB continua dividida em partes de 64 KiB. O host futuro deve desmembrar o bundle
mantendo os vínculos tipados. A identidade inclui o nascimento do pedido para que
um pedido recriado não herde o registro anterior.

O DTO de cobertura não aceita certificação de capítulo/ato/livro. O remapeamento
continua privado e histórico, com revisão obrigatória e execução desabilitada.
Os produtores e a restauração editorial v2 permanecem fechados até completar seus
contratos. Vinte e sete casos foram preparados; não foram executados neste
incremento. Detalhes em [incremento 37](../tasks/producao-literaria/37-captura-de-propostas-e-analises-de-texto.md).
