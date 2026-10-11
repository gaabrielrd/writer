# Atualizar compêndio com base no texto

No editor, abra **Compêndio** e **Atualizar compêndio com base no texto**.
O capítulo atual é analisado com o texto ainda não salvo. A análise usa nomes,
apelidos, categorias, resumos e detalhes existentes; notas estruturadas privadas
e relações não são enviadas ao provedor por este fluxo.

O modal apresenta entidades novas e conhecidas, evidência literal, destino e
comparação dos campos. Coincidências entre fichas exigem escolha explícita.
Pode-se editar ou excluir campos/propostas antes de aplicar. Novas fichas são
privadas. Fichas existentes preservam visibilidade, notas estruturadas e relações;
estes campos não podem ser alterados pelo lote.

O destino padrão de uma criação é o livro. Lore global só aparece quando há um
universo vinculado e informa que a alteração afeta os outros livros do universo.
Atualizações usam a ficha escolhida, sem mover entidades entre escopos.

## Créditos e segurança

- Análise/cancelamento/descarte: nenhum débito.
- Plataforma: **1 crédito por lote aplicado**, independente do número de fichas.
- BYOK: **zero créditos da plataforma**; o provedor externo pode cobrar o uso.
- Débito e alterações são confirmados juntos numa transação de `functions`.
- O registro da análise fixa o provedor; não se pode converter um registro da plataforma em BYOK ao aplicar.
- Repetir o mesmo lote retorna o resultado anterior, sem duplicar fichas/débito.
- Após falha de resposta incerta, o modal mantém o payload e bloqueia edição até repetir a aplicação. Rejeições definitivas permitem corrigir/analisar de novo.
- Autoria do livro/universo, vínculo, versões do lore, conteúdo salvo do capítulo, campos, duplicatas e saldo são validados no servidor antes de qualquer escrita.
- Uma atualização não muda visibilidade; portanto preserva os mecanismos de revogação existentes. Mudanças globais incrementam `loreVersion`; publicação continua explícita.

`prepareBYOKLore` registra uma análise produzida no navegador com a chave local.
Não é uma prova criptográfica de chamada ao provedor: o proprietário já pode
editar lore manualmente. Somente `analyzeChapterLore` chama o provedor da plataforma.
Chaves BYOK nunca são enviadas às functions ou gravadas no registro da análise.

## Limites e implantação

Todo o capítulo é percorrido em partes de 12 mil caracteres com 300 de
sobreposição. Resultado incompleto/inválido falha por inteiro, sem lote parcial.
Evidências são conferidas no capítulo completo para permitir consolidação entre
partes. Diferenças apenas de espaços/quebras de linha são reconhecidas, e o trecho
original do capítulo é preservado no resultado. Pontuação, palavras e continuidade
do trecho continuam obrigatórias: paráfrases e trechos inventados são rejeitados.
Uma resposta fora do formato ou com evidência inválida recebe uma única tentativa
automática de correção por parte, dentro da mesma análise/quota e sem débito de
créditos da plataforma. Persistindo a falha, o lote inteiro é recusado com mensagem
de falha da IA; erros de transporte não acionam essa tentativa.
Limites: 120 mil caracteres de texto, 50 entidades por análise, 500 fichas de
contexto, contexto armazenado de até 300 mil caracteres e 10 análises/hora/autor.
No BYOK, o contexto enviado ao provedor tem limite de 200 mil caracteres.
Registros ficam disponíveis para aplicação por uma hora; resultados aplicados
permanecem para recuperação idempotente. Retenção/limpeza desses registros deve
ser definida pelo operador conforme a política do ambiente.

Implante `analyzeChapterLore`, `prepareBYOKLore`, `applyLoreAnalysis` e as regras
antes de usar o fluxo em produção. As chamadas exigem Auth e App Check e usam
`us-central1`. A análise da plataforma reutiliza `BOOK_GENERATION_GEMINI_KEY` e
`BOOK_SYNOPSIS_MODEL` existentes, com saída JSON dedicada; não cria novo segredo
nem expõe a chave. Timeout de análise: 540 segundos; aplicação: 120 segundos.
Os documentos `users/{uid}/loreAnalyses` e `loreAnalysisLimits` são exclusivos do
servidor. Sem functions implantadas, o modal mostra falha e não aplica localmente.

Veja [lore compartilhado](shared-lore.md), [arquitetura](architecture.md) e
[plano aprovado](tasks/editor-e-atualizacao-do-compendio.md).
