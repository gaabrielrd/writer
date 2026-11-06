# ADR 0276 — Preparação local da importação de lore

Data: 2026-11-05. Estado: implementada localmente; publicação não incluída.

## Contexto

O parser já lê PDF no navegador, mas a importação de universos enviava original
e texto e fazia uma análise por página/fragmento. O contexto completo se repetia
e a falha de uma unidade obrigava a repetir sucessos do lote.

## Decisão

Document-import prepara blocos literais de até 12.000 unidades UTF-16 e 32.000
bytes UTF-8, com até 200 faixas contíguas de página. Prefere seções, parágrafos,
linhas e palavras; repete até 300 caracteres nas fronteiras, respeitando pares
Unicode. Páginas curtas compartilham um bloco. A limpeza reutiliza critérios de
margens do manuscrito, conservando ocorrências no corpo e todo conteúdo autoral.

Upload v2 recebe somente texto/faixas. O hash da parte é SHA-256 do JSON UTF-8
`{text,spans}` nessa ordem de propriedades. A cadeia começa vazia e cada passo
é SHA-256 UTF-8 de `anterior:hashDaParte`. O manifesto fixa hash final e bytes
de texto por arquivo. O servidor valida ordem, limites efetivos, cada hash e
cadeia/tamanho completos antes de analisar. Original de até 10 MB continua como
limite declarado da seleção; a cota servidor é de 20 MB reais de texto preparado,
incluindo overlap. Hash não prova correspondência com o PDF nem autorização.

V1 conserva bytes obrigatórios, extração anterior e cortes por página. A versão
é fixa na sessão; o cliente retoma uploads conforme a versão retornada pelo
servidor. Não há downgrade automático de v2 após erro de rede/servidor.

O contexto usa correspondências de nomes/apelidos com limites de palavra e
normalização apenas para comparação. Todos os homônimos são conservados; texto
fonte não é filtrado. Validação de evidências usa a fonte literal e mapeia os
trechos aprovados às páginas realmente intersectadas.

Cada importSources guarda análise validada privada por fingerprint da fonte,
faixas, contexto selecionado, versão de análise e configuração congelada.
Persistência reconfere origem, autorização, cursor e lease na transação. Retry
revalida evidências e reutiliza somente fingerprint idêntico, inclusive em outra
instância. Não há cache entre sessões/contas ou persistência adicional no cliente.

Uma lease nativa de quatro minutos impede duplicar o lote em requests
concorrentes. Expiração permite tentativa explícita após uma instância cair.
Finalmente, liberação metadata só limpa a própria lease. Resposta antiga não
limpa a sucessora. Resultados irmãs podem ser guardados, mas candidatos e cursor
só avançam com lote integral, reautorizado; falha drena o lote antes de retornar.

## Consequências

Não há upload de PDF em v2 nem segunda cópia de texto em importUploads; esse
recibo é metadata. Análises usam a mesma privacidade, isenção de índices e
limpeza de importSources. A exclusão horária já fecha a sessão antes da coleta.
O documento com texto/cache tem teto de 900 KB antes da escrita. Continuam os
limites de 50 entidades por resposta, 200 candidatas, 4 MB e aceite atômico.

Não se promete redução numérica ou qualidade sem medir o corpus. Testes medem
preparação/calls e preservação; desempenho do provedor exige medição própria.
PDF digitalizado continua exigindo OCR prévio. Livro/aventura continuam locais
e não recebem IA para organizar capítulos. Sem novas dependências, Rules,
coleções ou Functions; frontend e setor de importação exigem publicação conjunta,
com drenagem das instâncias antigas antes de usar leases/cache como garantia.
