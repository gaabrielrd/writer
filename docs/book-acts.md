# Atos e seleção de capítulos

O autor organiza capítulos em atos na aba Capítulos. Novo ato abre um modal com
nome opcional. Nomes vazios recebem numerais romanos pela posição de criação,
contando também os atos nomeados: I, A travessia, III. Atos vazios permanecem
visíveis para o autor. O limite é 3999 atos por livro.

Novo capítulo permite escolher um ato. Capítulos antigos e capítulos sem vínculo
ficam em Sem ato, depois dos atos. Livros sem atos mantêm a lista simples.
Mover para cima/baixo atua dentro do grupo, considerando também os capítulos
ocultos pelo filtro. A numeração mostrada é a sequência completa de leitura.

## Busca, seleção e confirmação

O campo discreto ao lado de Novo capítulo filtra por parte do título, ignorando
caixa e acentos. Tem nome acessível e foco visível. Selecionar exibidos inclui
somente os resultados visíveis e apresenta estado intermediário. Mudar a busca,
trocar de livro ou sair da aba limpa a seleção.

Mover para ato e Excluir seleção abrem modais com quantidade e títulos.
Cancelar preserva a seleção. Mover acrescenta os capítulos ao final do destino
na ordem de leitura; quem já está no destino mantém a posição. Sem ato remove o
vínculo. Excluir remove permanentemente os capítulos e atualiza o total de
palavras na mesma transação. A exclusão pelo menu da linha usa a mesma confirmação.

A operação confirma sucesso somente após persistir. Falhas preservam a seleção
para retentativa. Se um capítulo mudou desde a seleção, a operação inteira é
recusada; Atualizar lista recupera os dados e permite uma seleção nova.
Operações aceitam até 200 capítulos por vez, sem aplicação parcial.
Os modais impedem envios duplicados e devolvem o foco ao controle de origem ou,
se ele desapareceu após sucesso, à barra de capítulos.

## Leitura, publicação e exportação

O sumário público agrupa capítulos por ato e identifica o ato do capítulo atual.
Anterior/Próximo atravessa atos e preserva links diretos dos capítulos.
A publicação inclui somente atos preenchidos; nomes automáticos conservam a
posição original, mesmo quando um ato vazio não é publicado. Alterações no
rascunho aparecem ao republicar explicitamente.

PDF, DOCX e Markdown usam a mesma sequência e um cabeçalho por ato preenchido,
com capítulos subordinados. Exportar um capítulo vinculado inclui seu ato.
Capítulos sem ato não recebem um cabeçalho fictício de ato na exportação.
O backup JSON com atos usa versão 4 e guarda também atos vazios, datas e vínculos.
A versão 4 preserva também as personas utilizadas e os vínculos do livro e dos capítulos.\nLivros sem atos conservam as versões anteriores (v3 quando usam personas). A aplicação não oferece
restauração de backup JSON; reconhecimento de atos na importação fica fora do escopo.

## Persistência e limites

Atos ficam em books/{bookId}/acts, privados e imutáveis após criação nesta entrega.
O livro guarda actCount para alocar a próxima posição na transação.
Capítulos usam actId opcional e order dentro do grupo. Agrupamento e ordenação
são definidos pela interface pública de books. listChapters devolve essa sequência
para os consumidores, incluindo a seleção de capítulos no editor. Ausência de vínculo significa
Sem ato; nenhum ID de capítulo muda durante a movimentação.

Criação de capítulo, movimentação, exclusão em lote e reordenação atualizam
updatedAt do livro. Criação, edição e exclusão em lote mantêm contagens
atomicamente. Movimentação verifica a versão consultada do livro e os capítulos
selecionados antes de qualquer escrita. Não copia nem altera conteúdo.

A revisão pública guarda atos separados com somente name e order, além de actId
opcional nos capítulos. O apontador hasActs solicita a leitura dessa coleção;
publicações anteriores continuam compatíveis. As regras exigem autoria para os
originais e restringem leitura pública à revisão ativa. A exclusão do livro limpa
também atos privados e públicos. Consulte [segurança](publication-security.md).

Não há dependência nova, migração automática ou publicação automática de livros.
A implantação posterior autorizada está no
[registro do deploy](entregas/2026-10-11-deploy-atos-servicos.md).
Regras e aplicação devem permanecer compatíveis em cada implantação.

## Fora do escopo

Renomear, excluir e reordenar atos manualmente; atos aninhados; arrastar e soltar;
e interpretar cabeçalhos de ato durante a importação.
