# Importação de universos e lore

Em **Lore compartilhado → Importar universo**, selecione PDF com texto, TXT ou
Markdown. Dentro de um universo, **Importar lore** oferece o mesmo fluxo para
adicionar entradas e atualizar fichas existentes.

## Seleção e análise

Aceita `.pdf`, `.txt`, `.text`, `.md` e `.markdown`, até 50 arquivos e
**10.000.000 bytes no total**. Seleções sucessivas somam ao mesmo limite.
A extração ocorre no navegador pelo parser público de `document-import`:
PDF.js mantém ordem de leitura, colunas, títulos e origem por página; a leitura
para lore preserva apresentação e apêndices, sem a divisão de capítulos.
TXT/Markdown conservam texto e codificações suportadas pelo importador existente.
PDF sem texto exige OCR externo; imagens e mapas não são convertidos em fichas.

Os bytes originais são enviados em partes de até 500.000 bytes para conferência
do tamanho real no servidor. Texto extraído é entrada autoral privada; o servidor
não certifica correspondência criptográfica entre PDF e texto do navegador.
Somente os textos e contexto textual do universo são enviados ao provedor de IA.
Documentos são dados, nunca instruções. Não há BYOK neste fluxo.

O servidor analisa partes de 12.000 caracteres com sobreposição de 300 dentro de
cada página, valida evidências literais e consolida entidades por nome/apelidos e
categoria. Ambiguidade de correspondências não escolhe uma ficha automaticamente.
Análise inválida pode ser repetida no mesmo cursor, sem aplicar lote parcial.

Limites operacionais: dez importações novas por hora/autor; 20 milhões de
caracteres extraídos incluindo sobreposições; 500 fichas de contexto, com até
400.000 bytes de identificação/resumos; 200 sugestões e 4 MB de resultado/revisão.
Excedentes geram erro explícito, sem truncar documentos ou aplicar fichas.
Detalhes da proposta individual podem ser editados até 150.000 caracteres;
saídas individuais da IA mantêm o contrato existente de 8.000 caracteres.

## Revisão e diff

Cada sugestão mostra arquivo, página quando disponível e evidência. Pode-se
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

Implantação exige frontend, Functions (incluindo limpeza), Rules e índices
coordenados. Todos os escritores do clock de autorização precisam estar ativos,
conforme os contratos existentes. Implementação e validação local não autorizam
implantação nem comprovam geração paga com um provedor real.
