# ADR 0030 — Blocos de aventura e prévias por audiência

- **Status:** Aceito; implementado e validado localmente, CI pendente
- **Data:** 2026-10-15

## Contexto

O operador escolheu vários blocos dentro da mesma cena, cada um com texto e
audiência próprios. Conteúdo novo ou antigo sem classificação começa privado do
criador. O editor, histórico e metas já têm identidades e escritores de cena;
converter toda a prosa antiga ao abrir criaria risco desnecessário.

## Decisão

O corpo da cena permanece como Texto principal. Metadados aditivos definem seu
título, tipo, audiência e ordem; fallbacks de leitura não gravam migração. Os
adicionais ficam em sceneBlocks, com corpo separado e vínculo estável à cena.
Uma feature pública adventure-blocks reúne navegação, texto, imagem e prévia.
Livros conservam seus contratos e não recebem esses metadados de aventura.

Cada mutação compara a revisão observada e atualiza texto, agregado da cena,
parte, ledger, projeto e recibo na mesma transação. Ordem manual troca vizinhos
ativos, incluindo o principal; duplicar preserva audiência. Arquivar preserva
texto e histórico, retirando a contribuição atual. O ledger conta uma fonte de
cena com principal e adicionais ativos; não enumera corpos por autosave.
Contagem inválida falha explicitamente. Reparo percorre metadados em páginas,
conserva o checkpoint observado e só confirma o total ao concluir.

O histórico ganha o recurso block somente para aventuras. Restauração muda
apenas o texto, preservando audiência, ordem e imagem atuais; o diálogo informa
a audiência do destino. Editores não adotam outra revisão sem conferir a base
do principal. Escrita, histórico e operações com resposta incerta compartilham
reserva e identidade de recuperação por conta, aventura, cena e recurso.

Uma ilustração opcional por bloco usa ImageLibraryPicker e referências da própria
conta. O servidor mantém usos tipados por aventura/recurso sem colisão com capas.
Troca, cópia e remoção atualizam contador e vínculo atomicamente; arquivo mantém
o uso. Nenhuma URL de biblioteca é persistida no texto ou histórico do bloco.

A prévia continua restrita ao dono da aventura e é por cena: Original completo
reúne os ativos, Mestre recebe gm e players, Jogadores recebe apenas players.
O servidor filtra antes de ler corpos e reconstrói HTML com whitelist sem lore
privado, atributos, URLs ou imagens embutidas. O DTO contém apenas os blocos
permitidos. Cursor e token vinculam conta, alvo, modo e revisão; não concedem
acesso. A mídia deriva WebP limitado, sem metadados, e reautoriza antes/depois do
I/O, sem expor imageId, caminho Storage ou token permanente da biblioteca.

## Consequências

Classificação não publica nem compartilha automaticamente. Este incremento não
cria portal, grant, leitor público, edição comercial ou comprovação de licença.
A projeção de cena permite validar a separação de audiência antes dessas fases.

Corpos antigos continuam íntegros e a composição de capítulos de livro permanece
compatível. Histórico de bloco removido pode ser consultado pelo projeto sem
recriar a origem. A futura exclusão de aventura deve limpar blocos, imagens e
histórico; essa operação ainda não existe. Backup completo de aventura/blocos e
histórico permanece em F2-09. Não declarar esses limites resolvidos pela prévia.

Contratos e evidências de implementação ficam em
[Blocos narrativos](../tasks/writer-v2/execucao/12-aventuras-e-blocos.md) e
[Ilustração e prévia](../tasks/writer-v2/execucao/13-imagens-e-previa-de-aventura.md).
