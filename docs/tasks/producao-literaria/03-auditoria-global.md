# Auditoria global da arquitetura — E2

Incremento implementado na branch `codex/producao-literaria`, sobre a principal local
`b9fc03c`. As cinco etapas continuam abertas; esta auditoria não encerra a reconciliação.

## Comportamento

A integração oferece a opção Auditoria global da arquitetura, exclusiva para o livro
inteiro. A seleção congela o escopo, o modelo e a identidade de recuperação. Não aceita
subconjunto de fichas. Um inventário paginado percorre contrato, planos, atos, capítulos,
cenas, arcos, eventos, marcos dos arcos, vínculos de cenas, vínculos narrativos e controle
da ordem. Todos os planos ativos entram na leitura, sem o limite de oito fontes de apoio
da integração selecionada.

Preparar o inventário e inspecionar uma fonte não chama o provedor nem consome cota de
IA. A prévia mostra o mesmo JSON canônico segmentado e guia editorial usados pela
leitura. O inventário armazena identificadores, provas nativas e cobertura; os corpos são
relidos sob autorização. Títulos indisponíveis não são substituídos por títulos de outra
encarnação da fonte.

A leitura percorre cada segmento da arquitetura e depois o manuscrito nativo. Sínteses
hierárquicas combinam as análises. Uma conferência terminal relê todas as provas e só
então libera a síntese global. A interface conserva contagens independentes de arquitetura
e manuscrito; uma auditoria anterior à redação pode concluir a primeira sem alegar leitura
do texto. Aceitar a integração continua sendo decisão explícita.

## Limites da evidência

Planos são intenções e associações são índices. A matriz arquitetural não admite certeza
de fato estabelecido. O censo inclui metadados estruturais e vínculos, mas não lê todos os
corpos de lore do universo. Os trechos JSON têm offsets próprios, identificados como
`canonical-json`, e não posições inventadas no manuscrito.

A prova vincula nascimento e versão do livro, contrato, fonte e, para marcos, arco pai.
Revogação ou recriação de referência de um plano bloqueia sua leitura antes do provedor.
Respostas tardias após cancelamento ou mudança de fonte não confirmam evidência.
A reconferência percorre novamente o inventário e detecta inclusões, remoções e alterações;
um sucessor precisa preservar a modalidade global e sua cobertura verificada.

A coleção `literaryIntegrationArchitecture` é privada ao servidor, sem acesso SDK nem
mesmo para o autor. A exclusão de livro inclui registros órfãos dessa coleção. As ações
novas pertencem a `planningApi`; o avanço permanece no setor de geração existente.
Não há dependência ou endpoint público novo.

## Pendências para fechar E2

A reconciliação dos alvos estruturais, dos marcos e da síntese final foi acrescentada no
[incremento seguinte](04-reconciliacao-estrutural.md). Permanecem vínculos entre volumes e
auditoria final dos critérios de arquitetura e continuidade. A auditoria e os testes dirigidos deste
incremento não substituem o gate integral do projeto nem o trabalho de impacto de E5.
Os resultados executados estão no relatório de validação desta pasta.
