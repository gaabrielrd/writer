# Importação de universos e lore

Em **Lore compartilhado → Importar universo**, selecione PDF com texto, TXT ou
Markdown. Dentro de um universo, **Importar lore** oferece o mesmo fluxo para
adicionar entradas e atualizar fichas existentes.

## Seleção e análise

O diálogo indica as etapas **Arquivos → Análise → Revisão**. Use **Escolher
arquivos** pelo teclado ou arraste os documentos para a área de seleção.
**Adicionar arquivos** mantém os já escolhidos; a lista mostra nome, tamanho
legível e remoção individual. Quantidade e tamanho total acompanham a seleção.
Um lote inválido mostra o erro sem substituir os arquivos válidos anteriores.
Arquivos ainda não analisados ficam somente na janela atual.

Durante a recuperação de uma sessão, novos envios ficam bloqueados até a consulta
terminar. Envios incompletos pedem os mesmos arquivos originais. A preparação
local mostra seu andamento; a análise informa os trechos concluídos pelo servidor,
sem estimar tempo restante. Uma análise pausada continua somente por ação explícita.
O rodapé mantém análise/confirmação e custo acessíveis enquanto o conteúdo rola,
inclusive em janelas de laptop. Detalhes sobre tratamento dos dados são expansíveis;
o envio dos textos ao provedor continua informado antes da análise.

Aceita `.pdf`, `.txt`, `.text`, `.md` e `.markdown`, até 50 arquivos e
**10.000.000 bytes no total**. Seleções sucessivas somam ao mesmo limite.
A extração ocorre no navegador pelo parser público de `document-import`:
PDF.js mantém ordem de leitura, colunas, títulos e origem por página; a leitura
para lore preserva apresentação e apêndices, sem a divisão de capítulos.
TXT/Markdown conservam texto e codificações suportadas pelo importador existente.
PDF sem texto exige OCR externo; imagens e mapas não são convertidos em fichas.

Novas sessões usam o protocolo v2: somente texto preparado e metadata são enviados;
o PDF original permanece no navegador. O servidor confere bytes UTF-8 reais, ordem,
hash de cada parte e cadeia/tamanho completos por arquivo. Os 10 MB do original
são declarados na seleção; a cota efetiva no servidor é de **20.000.000 bytes de
texto preparado**, incluindo sobreposição. Texto extraído é entrada autoral
privada; hashes não certificam correspondência entre PDF e texto do navegador.
Somente os textos e contexto textual do universo são enviados ao provedor de IA.
Documentos são dados, nunca instruções. Não há BYOK neste fluxo.

O navegador remove números/margens recorrentes com os mesmos critérios conservadores
do manuscrito e mantém apresentação, sumário e apêndices. Prepara blocos de até
12.000 caracteres e 32.000 bytes, agrupando páginas curtas e preferindo fronteiras
de seções/parágrafos. Conserva texto literal, pares Unicode e até 300 caracteres
de sobreposição. Cada bloco tem até 200 faixas de origem, permitindo localizar
evidências que atravessam páginas. Não há resumo nem filtro de fatos no cliente.

O servidor seleciona contexto por nome/apelidos mencionados no bloco, conservando
todos os homônimos e correspondências ambíguas. Valida evidências literais e
consolida entidades por nome/apelidos e categoria, sem escolher destino ambíguo.
Cada chamada analisa até três trechos em paralelo, com o mesmo contexto já
confirmado, e consolida os resultados na ordem original antes de avançar o cursor.
O lote grava somente sugestões alteradas. Análises validadas são conservadas
privadamente por unidade, vinculadas ao texto, faixas, contexto, versão e configuração
exatos. Após falha, retry reutiliza sucessos inclusive em outra instância; não
grava sugestões parciais nem avança o cursor. As análises irmãs terminam antes
de retornar falha. Uma lease de quatro minutos impede dois requests analisarem
o mesmo cursor ao mesmo tempo; uma instância caída exige aguardar esse prazo e
retomar explicitamente. Cancelamento e autorização são reconferidos antes da
persistência de resultados e na transação final. O ganho de tempo depende da latência e da cota do provedor;
extração local e envio ordenado dos arquivos permanecem etapas próprias.

Limites operacionais: dez importações novas por hora/autor; 20 milhões de
caracteres extraídos incluindo sobreposições; 500 fichas de contexto, com até
400.000 bytes de identificação/resumos; 200 sugestões e 4 MB de resultado/revisão.
Excedentes geram erro explícito, sem truncar documentos ou aplicar fichas.
Detalhes da proposta individual podem ser editados até 150.000 caracteres;
saídas individuais da IA mantêm o contrato existente de 8.000 caracteres.
Cada resposta aceita até 50 entidades; texto/cache por unidade tem teto de 900 KB.

## Revisão e diff

As fichas têm título, categoria, resumo e estado de seleção próprios. A seleção
usa botão secundário com `aria-pressed`, deixando a confirmação como ação
principal do diálogo. O rodapé informa quantidade selecionada e crédito do lote.
Ausência de seleção, campos inválidos e destinos repetidos recebem orientação
antes da confirmação. O aviso sobre perda de edições locais ao fechar continua
visível; a nova organização não persiste rascunhos adicionais.

Cada sugestão mostra arquivo, páginas cobertas pela evidência e evidência. Pode-se
selecionar/desmarcar entradas, editar os campos e escolher explicitamente uma
ficha de destino. Possíveis duplicatas começam desmarcadas.

Ao escolher **Atualizar**, o fluxo lê a ficha autorizada completa. A proposta
usa os campos extraídos como substituição dos campos textuais da ficha; o diff
mostra também detalhes e apelidos anteriores que seriam removidos. Todos esses
campos podem ser ajustados ou preservados manualmente antes do aceite. A comparação apresenta
campos acrescentados, removidos e alterados com `del`/`ins`, rótulos **Saiu** e
**Entrou**, preservando espaços/quebras. O diff acompanha as edições.

Uma ficha existente recebe no máximo uma atualização por confirmação. Entradas
não selecionadas e fichas ausentes dos documentos não são excluídas. Visibilidade,
relações, notas estruturadas e data de criação são preservadas nas atualizações;
novas entradas são privadas. Não há geração de imagens, relações ou publicação.

## Confirmação e recuperação

A análise e o descarte não debitam. Como no lote de atualização do compêndio,
o aceite custa **1 crédito por importação**, exibido antes de analisar e confirmar.
Nome e descrição do novo universo são preenchidos pelo usuário.

A revisão exata fica salva no servidor antes do aceite; após resposta incerta,
a interface bloqueia edição e oferece **Retomar confirmação**. A confirmação
transacional grava universo/fichas, clock de autorização das campanhas, versão
de lore, crédito e recibo. Replay não duplica fichas/débito nem recria universo
excluído. Alteração do universo durante a revisão exige nova importação; não
há rebase silencioso nem aplicação sobre dados não comparados.

**Fechar e continuar depois** pausa entre unidades. A mesma aba conserva somente
ID da sessão por conta/destino, sem arquivo, prosa ou credenciais no navegador.
Ao retomar envio incompleto, selecione os mesmos arquivos: partes recebidas são
imutáveis e reenvios diferentes são recusados. Análise e revisão confirmada podem
ser recuperadas sem selecionar arquivos novamente. Edições locais anteriores à
confirmação ainda não são um rascunho salvo; fechar pode perdê-las.

Sessões v1 já existentes preservam a extração anterior e o upload de bytes
originais em partes de 500.000 bytes. A versão retornada pela sessão determina
o protocolo da retomada; falha de v2 não dispara fallback para outro formato.

Sessões expiram em 24 horas. A limpeza horária fecha a sessão antes de remover
bytes, textos, sugestões e revisão; preserva um marcador mínimo permanente e os
recibos sem prosa. Descartar não remove fichas já confirmadas. Essa limpeza usa
coleções privadas de Firestore, sem novo bucket, URL ou dependência de Storage.

## Arquitetura e liberação

`src/features/universes` mantém UI/modelo/cliente. A extração é API pública de
`document-import`; `lore` fornece categorias/tipos. O serviço servidor fica em
`functions/src/universeLoreImport.mjs`; entradas callables literais exigem Auth e
App Check. Coleções `universeLoreImports`, `universeLoreImportReceipts` e
`universeLoreImportLimits` são server-only. Payloads temporários não são indexados;
o índice de expiração permite coleta limitada por sessões.
Resultados privados ficam em importSources, já coberto por essas mesmas regras,
isenções e limpeza; recibos v2 de importUploads não repetem texto. Veja a
[ADR 0276](decisions/0276-local-prepared-lore-import.md).

Implantação exige frontend, Functions (incluindo limpeza), Rules e índices
coordenados. Todos os escritores do clock de autorização precisam estar ativos,
conforme os contratos existentes. Implementação e validação local não autorizam
implantação nem comprovam geração paga com um provedor real.
