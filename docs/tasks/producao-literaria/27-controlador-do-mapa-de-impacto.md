# 27 — Controlador retomável do mapa de impacto

Implementação de servidor, ainda sem interface e sem execução dos novos gates.
O incremento 26 foi progresso: produtor/índice/recuperação interna e testes preparados.
O objetivo integral continua aberto; o controlador não elimina as lacunas legadas.

## Contrato público e origem

`literaryImpact.mjs` expõe nove ações pelo setor planningApi existente: escopo,
registro, consulta, descoberta paginada, avanço, cancelamento, outcome, páginas de
resultado e resolução. O registro tem nonce, hash de correlação, livro original,
fontes/volumes explícitos e consentimento separado para preparar índices.
Não aceita links, censo ou fence fornecidos como autorização pelo cliente.

`literaryImpactScope.mjs` fixa livros e universos autorizados por nascimento,
fontes normalizadas e versão do registro de inventários. O orçamento existente
permite até 512 inventários e 16 sementes por investigação; seleções maiores
precisam ser divididas explicitamente. Não há truncamento nem limite da série
ou do livro. A interface deve sempre mostrar o escopo selecionado, sem chamar
um grupo de pesquisa de cobertura integral de uma série maior.

Controlador e recibo são criados atomicamente; ativação confere nascimento nativo
conjunto e salva a origem. Um ID ou hash de cliente não autoriza outra encarnação.
O grafo deve nascer junto à atualização de congelamento do controlador; sua
origem é conferida antes de selá-la no checkpoint. Grafo anterior sob o mesmo ID
não é adotado. Ponteiros de página/resolução usam a origem observada.

O fence inclui agora a mudança nativa de cada raiz de livro, além dos clocks,
identidades, universos e catálogos existentes. O marcador permanente de recurso
é preparado antes desse congelamento; initialize do motor não regrava um marcador
já verdadeiro e, assim, não invalida o próprio fence.

## Fases

1. **Registro e ativação:** sem leitura de capítulo, geração ou preparação de índice.
2. **Preparação opcional:** percorrer versões de guia por ID, persistir preflight
   nativo em um passo e executar o backfill autorizado no próximo. Não ocorre em
   get/list, replay do save nem montagem de interface. Só depois congelar o mapa.
3. **Coleta:** um registro por página; reconstruir suas projeções e verificar uma
   aresta por passo. Gravar verificação, append e checkpoint/recibo atomicamente.
4. **Reconferência:** repetir censo e provas, comparando hashes/counters e resultados.
5. **Propagação:** percorrer dependências registradas, preservando testemunhos distintos.
6. **Censo final:** reconferir fontes e projeções antes de encerrar o resultado.

Cada passo tem operação/revisão/origem e recibo. Resposta perdida não consome o
passo seguinte. Concorrentes com revisão igual não avançam duas vezes. Mudança
de registro, fonte, origem ou fence não reinicia silenciosamente o censo.
As verificações existentes podem abrir fontes autorizadas para conferir hashes;
isso não é IA ou leitura editorial, e os flags de evidência conservam essa distinção.

## Cobertura parcial e lacunas

Arcos e eventos passaram a ter contenção metadata no livro, além de atos/capítulos/cenas.
O censo verifica todos os inventários selecionados. O motor só permite atravessar
um resultado parcial depois de todas as páginas/verificações declaradas: não
aceita missing/pending. Unavailable/unsupported permanecem na cobertura.

A auditoria de origens legadas sem índices ainda não foi implementada. Cada livro
contém a lacuna explícita `unindexed-origin-coverage`; portanto o controlador
termina como partial, sem afirmar cobertura histórica completa. Catálogos nativos
inconsistentes continuam recusados antes do congelamento, sem certificado fictício.
A auditoria/backfill desses contextos é requisito restante antes de fechar E5.

Vínculos fora dos volumes selecionados não são usados para obter conteúdo de outro
escopo. São registrados como pendência, para ampliar a investigação explicitamente.
Origem histórica desconhecida é contada separadamente. Nenhuma cobertura promove
semanticCompleteness, authorAccepted ou publicationReady a true.

## Encerramento e anotações

Cancelamento pode reservar a intenção original antes de observar start. Uma resposta
tardia não a ativa. Cancelar continua disponível ao perder acesso a outro volume;
não reautoriza fontes para ler dados. O nascimento do livro/controlador é conferido.
O cancelamento do mapa não remove índices canônicos já preparados com consentimento.

Resoluções têm justificativa, evidências autorais, comparação da verificação observada,
CAS próprio, versão imutável e recibo. Não reescrevem prosa nem alteram fatos conferidos
ou grants de publicação. O mapa precisa estar encerrado e com fontes ainda atuais.
Anotações próprias continuam consultáveis sem liberar de novo o conteúdo das fontes.

## Persistência e exposição

Coleções novas: literaryImpactControls, Checks, Decisions e DecisionVersions.
Rules fechadas ao SDK, indexação por jobId e exclusão de livro incorporadas antes de
expor os produtores. Campos livres ficam somente nas anotações privadas do autor.
O setor passa de 436 para 445 ações no total do registro, mantendo os 16 setores e
sem nova Function. Isso descreve código local, não deploy ou confirmação em produção.

## Evidência preparada

Quinze casos novos do controlador cobrem registro, três censos, replay, concorrência,
fence nativo, registro modificado, recriação, cancelamento antes do ACK/revogação,
ponteiro de página, resolução, consentimento e rejeição de grants do cliente.
Um caso do motor cobre travessia parcial sem permitir censo pendente; um caso de
composição por setor prova exposição somente das ações gerenciadas.
Três casos SDK/emulador preveem timestamps nativos, CAS real, fence e cancelamento.
Rules e limpeza incluem as quatro coleções.

O double studioDb ganhou modo opcional de timestamps conjuntos para esses protocolos;
o padrão antigo permanece. O comportamento real deve ser conferido no emulador.
Nenhum teste, lint, typecheck, formato, build, navegador, cobertura ou validate foi
executado neste incremento. Fontes precisam de formatação e gates no fechamento.
Uma âncora de índices JSON não existia; o trecho real foi lido e a etapa restante
aplicada sem repetir os arquivos já gravados.

## Continuação

Faltam cliente/UI/recuperação metadata, a auditoria de origens legadas e a composição
de cobertura completa, além de portabilidade editorial `.writer`, auditoria de todos
os aceites e cobertura de funções mínima90. Não declarar qualquer etapa concluída.
Sem commit, merge de volta, push ou deploy.
