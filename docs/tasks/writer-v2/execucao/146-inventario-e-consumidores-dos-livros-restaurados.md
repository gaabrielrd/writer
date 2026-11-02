# P1 — inventário e consumidores dos livros restaurados

## Objetivo

Após 95c151a, consolidar a matriz dos produtores/leitores/exclusão e provar que
livro ativado e com preparação arquivada pode seguir o ciclo normal de lore.
Só então selecionar modo indexado no runtime e validar o bloco completo.

Grafo indisponível após falha fast; fontes reais conferidas: sceneJobs,
bookLoreDeletion/RecoveryDeletion, BookChapter/ResourcePayload/Generation,
EditAdoption/Creation/Removal, Publication, leitores/contextos/backup e jobs.
Não tratar busca nominal vazia como prova de ausência.

## Contrato e sequência antes do código

1. Restaurar/ativar fixture real nos modos atual legado e indexado, finalizar
   mídia sem capa e limpeza da preparação. Sem inserir raiz ou remover limites.
2. Fonte existente da cópia ativa entra em inspeção/compilação/adoção normais;
   editar um campo preserva campos/valores/datas não alterados e origem própria.
   Criar ficha nova no mesmo livro, retirar a selecionada e excluir o projeto
   pelos serviços existentes. Nenhum dado de outro livro é removido.
3. Leitura normal após cada ação entrega conteúdo lógico, nunca stub.
   Backup/recaptura após edição permanece válido (interfaces existentes);
   publicação/contextos têm mapa/evidências próprias, sem inventar prova conjunta.
4. Matriz documental por namespace/família: quem escreve, quem lê/captura,
   quem limpa e quais controles/recibos ficam deliberadamente. Descrever
   fontes inline/v1/v2, jobs/chaves/índices, histórico/texto, imagem/persona e
   universo/publicação. Provas anteriores são atribuídas, não reexecutadas à toa.
5. Se matriz/provas não mostrarem lacuna, runtime Functions passa explicitamente
   indexedLoreBodies true nos dois pontos de composição (callable e recuperação).
   Factory de baixo nível conserva default false para compatibilidade/testes.
   Política por job/reserva do plano 145 mantém pedidos anteriores.
6. Teste de contrato observável usa a mesma configuração selecionada para uma
   restauração grande, não regex do arquivo index. Adicionar configuração pura
   compartilhada somente se necessário para testar a composição sem Firebase I/O.
7. Rodar validate no fechamento do bloco P1, corrigir falhas reais com testes
   dirigidos e registrar saída exata. Não baixar cobertura nem enfraquecer checks.
   SDK/browser já executados mantêm seu escopo; ampliar só por mudança/risco.
8. Revisar/docs/ADR/evidência/AGENTS e commits locais. Sem CI, push, PR, merge,
   deploy, dependência ou subagente.

## Arquivos previstos

Teste novo Functions de integração usando fixtures existentes, matriz em docs/
e índices de execução; alterações mínimas de runtime/config se as provas
permitirem. Se surgirem falhas, registrar ajuste de contrato antes da correção.

## Limites de certificação

Ferramentas/testes locais não certificam contas, fontes ou clientes de produção.
Auditoria operacional de chaves históricas (plano 127), clientes/admin/Rules
coordenados, seletor externo físico e gates humanos/comerciais continuam explícitos.
Replay interno normalizador v1 conserva hashes; roots internas antigas sem
personaAvailability não ganham inferência/reparo automático. Identificar e revisar
esses estados antes de rollout, sem cancelar/excluir livro do usuário.

P1 técnico só será fechado com os aceites comprovados e validate local verde;
lançamento não está autorizado. P2/P3 e demais fases/gates permanecem no objetivo.

## Aceites

- [x] Ciclo real após ativação/arquivamento nos modos descritos.
- [x] Matriz completa por famílias com evidências e lacunas explícitas.
- [x] Seleção coordenada do runtime e prova de fonte grande, se autorizada pela matriz.
- [x] Validate local, revisão/documentação/evidência/commits.

## Ajustes revelados pela validação de conjunto

Antes de corrigir: a terceira tentativa chegou à cobertura e terminou com
306 arquivos/4.078 testes positivos, oito arquivos falhos, 18 testes falhos e
quatro exceções de useAuth sem provider (391,62 s). As duas primeiras pararam em
formatação; Prettier precisou de segunda passagem no teste novo, depois check
dirigido verde. Nenhuma validação global positiva é presumida.

Correções previstas agora, sem mudar contratos de produção nem limites de cobertura:

1. vitest.config exclui tests/storage do runner DOM, como já faz com firestore.
   Os dois arquivos são Node/SDK, exigem emuladores e continuam no runner dedicado
   run-book-backup-media. Executá-los pelo runner correto, sem ocultar falha.
2. bookLegacyInterop usa ambiente Node/Blob nativo para integrar produtor JSON e
   leitor puro; evita Uint8Array de realms misturados. Preserva os seis JSONs e
   todos os asserts sem relaxar o validador.
3. bookLoreDiscard compara todo conteúdo/controle salvo, exceto o índice exato
   da chave de recuperação que o contrato manda revogar. Exige sua remoção
   explicitamente, em vez de conservar a expectativa antiga insegura.
4. LorePage cobre o host: carregamento/ausência/erro, rota e delegação do livro à
   composição nativa. Os testes antigos exercitavam as APIs SDK de escrita já
   retiradas. Jornada completa e Auth nativos continuam em BookLoreCollection.
5. Aumentar somente timeouts dos seis casos >8 MiB e do caso com 53 operações,
   mantendo volume, contagem de I/O e todos os asserts. Não alterar timeout global.
6. Reexecutar grupos afetados, depois cobertura global e demais checks de validate.
   Se houver outra falha real, registrar e corrigir antes do fechamento.

### Nova exposição pela cobertura

Os 111 testes dirigidos dos sete arquivos passaram (60,94 s). A quarta execução
global encontrou ainda o caso can reload between every production unit, no limite
padrão de 5 s. Acrescentar timeout de 30 s somente nesse caso e manter seu ciclo
de recarga/ACK/controles/aplicação. Habilitar reportOnFailure na cobertura permite
verificar também o relatório caso outro teste falhe, sem alterar limiares.
Não repetir a suíte dirigida inteira por esse ajuste.

Storage executado no runner correto: sete testes passaram, nenhum skip, código
zero, 173.654,5864 ms. Logs incluem avisos PassThrough do SDK, recusas esperadas
e NullPointerException do runtime Java no desligamento, depois do resultado positivo.
Não confundir isso com execução sem avisos ou com infraestrutura de produção.

### Memória no runner de Functions

A quinta execução passou 312 arquivos/4.096 frontend (380,57 s), cobertura
89,89% statements, 85,63% branches, 90,99% functions e 93,16% lines, além dos
87 scripts. Na suíte Functions, processos V8 terminaram com Zone Allocation/
NewArray Allocation out of memory. A máquina anuncia 16 CPUs; o runner Node
usava concorrência padrão. Snapshot do Windows mostrou ~6 GiB de commit virtual
livre, apesar de ~7,4 GiB de RAM física livre. Não matar processos do operador.

Antes da correção: limitar somente a concorrência entre arquivos Functions a
dois processos no script de teste, sem retirar casos, reduzir fixtures, aumentar
heap ou mudar contratos. Atualizar orientação/comando; rodar suíte Functions
completa e fechar os demais checks. Guardar as falhas reais do ensaio anterior
e investigar qualquer falha que se reproduza sem pressão de memória.

A suíte Functions terminou com 2.944 positivos e oito falhas (157.721,7118 ms):
cinco arquivos abortados por V8, dois DataCloneError por memória e um assert
de fixture. Esse último cenário chamava ready que já iniciava o job em modo
indexado e só depois trocava a factory para false. Isso não representa prefixo
monolítico desde a ADR 0168. Permitir configurar o modo inicial da fixture (default
true preservado) e iniciar esse caso explicitamente false. Manter a troca posterior
para true e os asserts schema v1/texto exato, sem mudar o servidor.
Antes de outro validate, rodar os oito arquivos afetados com concorrência dois.

## Fechamento técnico local — 2026-10-26

123 testes dos oito arquivos backend afetados passaram com concorrência dois,
sem skip (50.135,7654 ms). A sexta execução de npm run validate terminou código
zero: 312 arquivos/4.096 frontend, 87 scripts e 3.007 Functions sem falhas/skips;
sintaxe de 298 módulos, typecheck, build e smoke positivos. Cobertura:
89,89% statements, 85,63% branches, 90,99% functions e 93,16% lines.
Build mantém avisos de tamanho de chunk e imports dinâmicos sem efeito.

[Matriz consolidada](../inventario-portabilidade-livros.md),
[ADR 0169](../../../decisions/0169-indexed-book-restore-runtime.md) e
[evidência](../../../entregas/2026-10-26-writer-v2-ciclo-e-inventario-dos-backups-de-livros.md).
Revisão sem bloqueadores remanescentes neste recorte; somente documentação
realinhada após validate, com checks documentais/formatação/diff antes do commit.
P1 técnico local fechado. Os gates operacionais descritos não foram executados;
P2/P3/D, F2-09 inteira, fases 3–5 e aceites humanos/comerciais não estão concluídos.
