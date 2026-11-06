# Incremento 37 — captura interna de propostas e análises de texto

## Critérios e alcance

Preservar a instrução autoral, o segmento fornecido, a proposta e a análise de
`literaryProseRequests` em registros editoriais tipados, com evidência literal e
cobertura real. Reutilizar a autorização nativa antes de abrir o cache derivado.
Revogação deve ocultar os derivados sem retirar a instrução própria. Nenhum estado
histórico pode reativar operação, aceite, publicação, quota ou débito.

O incremento acrescenta a família interna `prose`, somando treze famílias no
capturador. Não registra callable, não habilita produtor `.writer` e não habilita
upload ou restauração editorial v2. Gerações de planejamento, revisões agregadas,
integrações e publicações ainda exigem seus próprios leitores.

## Leitura e autorização

`literaryProse` expõe somente um port interno de campos de cabeçalho e a mesma
função de autorização que usa em seu leitor nativo. O capturador confere primeiro
livro, item e metadata. Manifesto desconhecido gera indisponibilidade explícita
antes do corpo. Manifestos conhecidos conferem livro e recurso original.

Somente resultados `done`, `applied` e `error` podem abrir o cache, após reautorizar
origem/encarnação da cena, capítulo, persona, fontes editoriais e cena anterior.
Revogação ou remoção gera placeholder sem abrir o corpo. Erros transitórios ou de
consistência não viram grants nem fallback. Estados running, canceled, stale e
revoked preservam apenas a instrução, o checkpoint histórico e a indisponibilidade
da resposta e do segmento original. Cancelar antes do primeiro envio produz no
servidor um marcador sem modo, cena ou instrução. Ele gera somente um checkpoint
histórico de `text-assistance`, sem unidade ou conteúdo inventados, também sem
abrir o corpo. Um erro sem resultado preserva o segmento autorizado e indica que o
relatório não foi registrado; não copia o diagnóstico operacional.

A autorização não exige que a versão atual seja igual à versão histórica. Uma
edição posterior pode manter o resultado antigo autorizado, mas não rebaseia seu
vínculo sobre a nova prosa. Fonte removida, recriada ou revogada não é reautorizada
por compartilhar um ID. Cada parte e a conferência final repetem as autorizações
e a projeção, comparando o token privado observado.

## Projeções e vínculos

O bundle interno contém até 45 artefatos e 2 MiB; transporte mantém partes de até
64 KiB. O produtor futuro deverá desmembrar o bundle nos registros da seção
editorial, em vez de gravá-lo como um novo tipo de registro `.writer`.

- Documento com a instrução própria literal e modo solicitado.
- Checkpoint com a fase histórica, referências tipadas e `controlsDisabled: true`.
- Cópia privada em texto simples do segmento original efetivamente fornecido.
- Proposta em texto simples, sem aplicabilidade, preço ou aceite.
- Relatório com justificativa, título histórico autorizado, achados e IDs de evidência.
- Evidências com citações verificadas contra os documentos congelados e offsets UTF-16.

Os IDs consideram a encarnação do livro, o nascimento nativo do pedido e o papel do
artefato. O checkpoint vincula os registros primários; o relatório vincula a
instrução, a cópia e a proposta. Esses vínculos permanecem explícitos após separar
os registros no arquivo. Nas referências do checkpoint, entrada/segmento são
`source` e proposta/relatório são `subject`, distinguindo os dois papéis de prosa
mesmo quando seus corpos estão indisponíveis. Citações recebem classificação `unclassified`: a presença
literal no snapshot não transforma uma alegação da IA em fato validado.

Referências de cena conferem revisão por metadata. Planos e contrato apontam para
suas identidades editoriais da revisão original, quando disponíveis. Referências
do manifesto conservam os descritores nativos, incluindo volumes e universo.
Fontes compostas sem identidade portátil equivalente permanecem descritores
indisponíveis, sem inventar ficha ou copiar o documento externo congelado inteiro.
Nenhum sourceToken ou versionToken é promovido a contentHash.

O contexto opcional da evidência fecha `format: plain`, `documentId` e `offsetBase`.
Os offsets são do texto preparado fornecido à IA; não devem ser aplicados ao HTML
nativo nem à serialização JSON do DTO portátil. Para manuscrito, a base é o início
do segmento; para os demais documentos fornecidos, é zero. A citação continua
literal e histórica, sem certificar a disponibilidade da representação atual.
`documentId` nesse contexto é a chave histórica do documento fornecido, não um
ponteiro portátil remapeado nem autorização para resolver conteúdo; loaders usam
somente as referências tipadas e autorizadas.

Somente provedor, modelo e raciocínio efetivos congelados são copiados como
snapshot histórico de geração. Não são copiados chaves, executionBinding,
originToken, sourceToken, gateToken, budgets, recibos, ponteiros ou controles.
Datas não registradas no resultado/citação permanecem nulas.

## Cobertura portátil

`BookEditorialReading` é um DTO puro fechado, opcional em relatórios e cópias de
segmento: unidade cena, caracteres totais, segmento/quantidade, início/fim,
início/fim do núcleo, cena completa e inclusão da cena anterior. Não aceita tokens.
As faixas e contagens devem ser coerentes. A cópia exige texto simples e extensão
UTF-16 exatamente igual à faixa registrada, preservando Unicode, BOM e CRLF.

Um relatório com esse DTO declara somente `unit` ou `excerpt`, uma unidade lida e
a quantidade original de segmentos. Não pode declarar capítulo, ato ou livro
inteiros. O remapeamento preserva a cobertura e remapeia IDs próprios de evidência,
continuando privado, histórico, dependente de revisão e sem execução.

## Casos preparados e estado real

Foram preparados 25 casos de Functions e dois com SDK real. Cobrem instrução e
resultado, vínculo após separar registros, citação/offset, segmento posterior,
revogação/recriação de origem e pedido, cena anterior, capítulo, universo, plano,
controle histórico, erro sem resultado, ausência de credenciais no pacote,
transferência por partes, remapeamento e limites fechados de cobertura.

Nenhum teste, typecheck, lint, formatter, build, browser, cobertura, validate ou
`git diff --check` foi executado neste incremento, conforme o adiamento definido
pelo usuário. Os resultados da rodada anterior sobre b666233 não validam estas
alterações novas. A evidência aqui é de implementação e revisão manual, não de
aprovação comportamental ou de segurança por execução.

## Continuidade

A [validação anterior](validacao-principal-b666233.md) continua registrando os
bloqueios de cobertura e regras completas. O próximo bloco inclui os leitores
nativos de geração de planejamento, revisão e integração, depois os documentos
editoriais de publicação, composição do pacote e restauração útil. O objetivo
integral permanece ativo, com 0/5 etapas formalmente encerradas.
