# P2 — ciclo normal das aventuras restauradas e matriz de consumidores

Base: fe49e9f. Somente commits locais; sem CI, push/PR, deploy ou subagentes.

## Objetivo e descoberta

A geração/restauração pela interface e o validate 195–197 passaram. Falta provar
o uso normal da cópia depois de mídia/coleta e consolidar consumidores.
O grafo parcial não contém os serviços recentes; fontes atuais de scenes,
adventureBlocks, narrativePlanning, adventureLore, workProgress, workHistory,
editorChatContext, Studio e fixtures foram conferidas diretamente.

A descoberta não encontrou endpoint/serviço/interface de exclusão completa de
aventura: Studio cria/lê/lista e os jobs atuais de exclusão de projeto são de
livro/campanha. Exclusão de cena/bloco existe. Não tratar essa lacuna como
coberta pelo cleanup da preparação; ela precisa de entrega seguinte antes de P2.

## Requisitos e sequência antes do código

1. Usar streamAdventureArchive real sobre serviços normais para gerar bytes,
   restaurar pelos serviços completos com Storage real adaptado ao bucket de
   teste e coleta posterior. Não inserir raiz/owner diretamente na restauração.
   O arquivo não deve ser montado manualmente para substituir captura normal.
2. Ler cópia por Studio/scenes/adventureBlocks, lore/personas, narrativa,
   progresso e histórico normais. Manter original e projeto alheio intactos.
   Conferir contagens, audiência, ordem, texto salvo e rascunho separado.
3. Editar cena/bloco, criar/restaurar versão com cópia anterior, editar lore,
   preparar contexto privado de IA sem chamar provedor/débito, recapturar a cópia
   e validar semanticamente o novo arquivo. Provar edições/leitores sobre IDs
   remapeados depois de a fonte/preparação ter sido coletada.
4. Exercitar composição/arquivo/restauração e exclusão de recurso pelos serviços
   existentes; preservar histórico de recurso removido e mídia/persona segundo
   seus contratos. Cobrir minimal/legado, órfão/arquivo, universo indisponível/
   revogado quando necessário sem fabricar autorização pela declaração do arquivo.
5. Reutilizar fixtures/finalizadores existentes, com helper comum apenas para a
   integração demonstrada. Testes no Vitest Node permitem o produtor TypeScript
   real e o backend atual no mesmo percurso. Nenhum mock do serializador ou
   alteração de limite/timeout global.
6. Se falhar, distinguir fixture incorreta de incompatibilidade do produto,
   registrar contrato do ajuste e corrigir somente a causa, com regressão.
   Matriz por família inclui gravação/leitura/IA/backup/exclusão e as pendências
   comprovadas. Não declarar produção, seletor do SO ou conta real validados.
7. Rodar somente testes afetados e checks pertinentes neste incremento. O
   validate integral verde de fe49e9f é base, não nova evidência. Próximo integral
   no fechamento do bloco de exclusão/auditoria de P2, salvo falha/risco novo.
8. Revisar/docs/evidência e commit local normal. P2/P3/D/F2-09, macro 8/35 e gates
   humanos/comerciais continuam abertos enquanto faltarem aceites.

## Arquivos previstos

- Novo teste integrado e helper estritamente necessário em adventure-portability/tests.
- Matriz/inventário em docs/tasks/writer-v2 e índices/progresso/entrega.
- Correções mínimas em serviços somente se o ciclo revelar incompatibilidade.

## Riscos e não escopo

Mídia deve usar createRestoredImageStorage com geração/aceitação, não mocks de URL.
Os bytes de arquivo e Storage de teste podem estar em memória no corpus pequeno;
isso não altera a captura por stream nem promete limite de memória em produção.
Não habilitar comércio, publicação, VTT, migração remota ou exclusão bruta.
Exclusão completa de aventura exige fluxo recuperável próprio e ficará no
próximo plano; não usar deleteSceneBook com cast para aventura.

## Aceites

- [x] Captura normal → restauração completa → mídia/coleta → consumidores normais.
- [x] Edição/histórico/lore/contexto de IA e recaptura com preservação do original.
- [x] Corpus de composição/arquivo/legado e exclusão de recurso comprovado.
- [x] Matriz com evidências e exclusão de projeto registrada como lacuna.
- [x] Checks dirigidos, revisão, documentação e commit local.

## Incompatibilidades reveladas pelo corpus

O ciclo principal passou com duas gerações completas de captura/restauração.
As primeiras falhas de seleção sem parentId e DTO detailsExcerpt eram do teste,
corrigidas conforme contratos existentes, sem alterar o produto.

A prova de legado encontrou falha real: getSceneGroup força modo scenes em
aventuras e descartava do retorno o texto legado preservado no documento.
Retornar esse texto como fonte preservada, sem mudar composição/contagem ou
oferecer conversão de livro, e apresentá-lo de forma sanitizada no planejador.
O texto continua separado das cenas e volta a entrar no backup.

Também foi identificada a recuperação de grupo ausente: o leitor por identidade
conserva corpo/parentId, mas a listagem exige agrupador existente e a mutação
normal não pode criar agrupador implícito. Antes de encerrar este incremento,
provar e corrigir um caminho explícito de localização/realocação ou preservação
com acesso utilizável, mantendo referência anterior e contadores corretos.
Não enfraquecer o cenário para contar preservação em disco como acesso pela UI.

## Contrato da recuperação de parte ausente

A solução conserva parentId na captura/restauração. A listagem privada nova
percorre heads por ID, no máximo limit+1 por página, sem ler corpos. Verifica
os pais da página e pode retornar página vazia com cursor. Abrir e conferir são
somente leitura. A interface oferece paginação e prévia sanitizada do corpo.

Somente confirmação explícita move a cena para Sem parte: CAS de revisão/parent
e prova transacional de que a parte ainda está ausente. Preserva corpo, blocos,
histórico e estado de arquivo; formerParentId passa a registrar a parte anterior,
como na exclusão normal de agrupador. Atribui rank no controle atual de Sem parte,
ajusta contadores e ledger sem recriar parte. Recibo idempotente evita duplicação;
outro projeto, conta, parte recriada ou revisão alterada recusam a mutação.
A UI reutiliza SceneOperationDialog para confirmação e retry com mesmo pedido.
Não acrescentar fallback automático nem mudar o formato do arquivo.
