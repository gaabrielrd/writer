# Biblioteca de imagens e navegação

Toda capa aceita da IA entra automaticamente na biblioteca pessoal. Sinopses e
textos ficam fora. Cancelar a criação, remover a capa do formulário ou excluir
um livro preserva a imagem aceita. Aceitar uma capa custa cinco créditos;
selecioná-la novamente não consome saldo.

Em **Meus Livros → Biblioteca de Imagens** (`/library`), o usuário pode visualizar,
renomear e excluir suas imagens. Exclusão exige confirmação e é bloqueada
enquanto a imagem estiver em algum livro. O servidor verifica os vínculos
novamente; a imagem não pode ser anexada enquanto sua exclusão estiver em curso.
Se a exclusão falhar no Storage, a biblioteca mostra a exclusão pendente e
permite tentar novamente, inclusive depois de reabrir a página. O seletor não
oferece imagens em exclusão. Registros excluídos ficam como tombstones para impedir ressurreição por
retentativa de aceite.

O seletor está na terceira etapa da criação e na edição da obra. Continua
disponível a URL externa. Capas usam proporção vertical 2:3; imagens de IA são
normalizadas em PNG de 1200 × 1800. Não há upload manual nem editor de imagem.

## Persistência e recuperação

`users/{uid}/imageLibrary/{id}` guarda nome, URL, caminho, data, estado e contador
de usos. O ID é o da geração. Inserção e débito são uma única transação. Livros
guardam `coverImageId` além de `coverUrl`. Referências em `uses/{bookId}` e o
contador são mantidos atomicamente pelo servidor ao criar ou trocar uma capa.
O trigger de exclusão de livro remove o vínculo de forma idempotente; a liberação
para excluir a imagem pode esperar o processamento desse evento.

Leitura dos metadados é restrita ao dono. Escritas no navegador são proibidas,
inclusive alterações de `coverImageId` e de URL de uma capa gerenciada. URLs com
token continuam acessíveis a quem possuir o link; a biblioteca privada não
transforma esses links em URLs autenticadas.

Ao abrir a biblioteca, capas aceitas antigas ainda existentes são recuperadas
sem cobrança. A migração tem cursor persistente, lê lotes de 25 registros e
processa até 100 por requisição. Se houver mais, aparece **Importar mais imagens
antigas**. Arquivos já apagados não são recuperáveis. A limpeza horária também
preserva e migra capas aceitas; apenas sugestões não aceitas expiram normalmente.
A listagem entrega páginas de 25 imagens com cursor estável e carregamento
tardio das miniaturas.

## Header

À esquerda, a barra separa **Writer Assistant** do dropdown de navegação. O
dropdown mostra **Biblioteca de Imagens** nessa página e **Meus Livros** nas
rotas de livros, permitindo alternar entre as bibliotecas. Nas rotas
privadas de obra, o título acompanha as alterações do documento e é truncado
quando necessário, com título completo acessível. O contexto é limpo ao trocar
livro ou conta; rotas de leitura pública não consultam esse título privado.

O saldo mostra ícone e número; tooltip por hover, foco ou toque informa créditos
e plano. Avatar/nome abre o menu com email e **Sair**. A saída continua bloqueada
durante a inserção pendente de uma sugestão no editor. Menus suportam teclado,
Escape e retorno do foco.

## Implantação

Implantar backend e índice da biblioteca antes de liberar o frontend; publicar
também as regras Firestore. As callables `listLibraryImages`, `renameLibraryImage`,
`deleteLibraryImage`, `saveBookImage` e `migrateImageLibrary` usam Auth e App Check
em `us-central1`, junto às funções de geração existentes. Não há novo segredo ou
dependência. Veja [criação de livros](book-creation.md) e
[implantação](deployment.md). Esta implementação não implanta produção
automaticamente.
