# F2-09 P1 — Backup completo e restauração privada de livros

**Estado em 2026-10-21:** universo confirmado; M1 de captura de histórico e M2 de contêiner limitado implementados e validados localmente. Veja [M1](32-captura-consistente-do-historico.md) e [M2](33-conteiner-limitado-de-backup.md). Pacote completo/schema/captura restante/restauração ainda pendentes.
**Base:** A enviado em `5f947a0e5e50df81154df14a7124b914278cd4c9`, HEAD/upstream/remoto
conferidos e checkout limpo no fechamento A. PR21 aberto em rascunho; Rules
39659740521 verdes. Na CI 39659740574 passaram Node 22, auditoria e produção
Chromium; Node 24 revelou uma corrida no teste anterior de importação. Correção
isolada em `f0220944abb319ea3299d2fd5a0cad0b642cf9f3`, com os 13 testes dirigidos
verdes; Node 24 e Rules desse head intermediário passaram. A mesma matriz anterior
revelou expectativa visual antiga de identidade de lore: ajuste em `6650408`,
6/6 perfis nativos verdes em 45,33 s, sem retry. Ambos ajustes somente de testes e
evidência; os 66 hashes de produção de A foram reconferidos. HEAD/upstream/remoto
coincidem em `665040889e59784d472a042df6f7304e545c18af`; pre-push final com tipos e
2.527/219 testes verdes, 147 s. Rules 39663714845 verdes. A CI 39663715057
terminou cancelada: Node 22/24, auditoria, produção Chromium e dez shards visuais
verdes; shards 1/3 cancelados e agregador E2E falhou. O shard 1 registrou uma
falha antes de passar no retry. Não há aprovação geral nem se presume a causa
dos cancelamentos somente pelo status; detalhes na entrega A.
O avanço da descoberta não esperou a CI, conforme decisão do operador.
**Origem:** [sequência F2-09](25-lore-importacao-e-portabilidade.md),
[decisão de histórico](../fase-02-criar-e-preparar/09-lore-importacao-e-portabilidade.md)
e [entrega A](../../../entregas/2026-10-21-writer-v2-chat-autorizado-de-cenas.md).

## Objetivo

Baixar um backup privado completo do livro e restaurá-lo como nova cópia privada,
com IDs próprios remapeados e sem sobrescrever um projeto existente. Preservar
estado atual e todo o histórico manual e anterior às restaurações, inclusive de
recursos que já foram removidos. Ler os JSON v1–v6 sem inventar dados ausentes.

## Decisões confirmadas e limite da entrevista

- Backup guarda estado atual e todo o histórico, conforme resposta do operador.
- Versões não expiram nem são compactadas automaticamente. Backup não inclui chat,
  chaves, recibos/fences ou recuperação do navegador.
- Restauração cria nova cópia privada; não mescla nem sobrescreve livros existentes.
- O exportador atual aceita rascunho do capítulo legado aberto, inclusive vazio e
  capítulo removido remotamente. Esse comportamento precisa continuar explícito.
- Arquivo não concede acesso ao projeto original, compra, participação, permissões
  ou direito de revenda. Dados e identidade da cópia nova são separados da origem.
- Políticas de campanhas/bases de P3 não são antecipadas neste incremento.

**Decisão de produto confirmada em 2026-10-21:** o operador escolheu
“Restaurar o livro e religar ao universo original se ainda houver acesso, sem
duplicar o universo”. A autorização atual deve ser conferida no servidor;
o arquivo não concede acesso. Esta escolha fecha a entrevista sobre o universo,
sem dispensar o contrato executável de captura, remapeamento, mídia e restauração.

## Regra de restauração do universo

| Situação                                   | Resultado planejado                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Backup sem universo                        | Nova cópia privada sem vínculo.                                                                                                            |
| Origem disponível e vínculo autorizado     | Ligar a nova cópia ao mesmo ID de universo, sem criar ou alterar universo/lore global.                                                     |
| Origem removida, em exclusão ou sem acesso | Restaurar dados próprios sem vínculo; revisão informa a indisponibilidade e referências externas ficam neutras.                            |
| Acesso/vínculo muda depois da revisão      | Invalidar a confirmação anterior antes da ativação; reapresentar a revisão, sem trocar de universo ou descartar o vínculo silenciosamente. |
| JSON legado contém universe.lore inline    | Não importar essas fichas como lore local nem sobrescrever o global; resolver somente a origem atualmente autorizada.                      |

A linha de origem indisponível é a interpretação operacional de “religar se ainda
houver acesso”: o conteúdo próprio do livro continua restaurável. A interface deve
informar isso antes de confirmar; não declarar roundtrip completo do universo.
Religar usa o universo no estado atual, sem restaurar sua edição antiga a partir
do arquivo. Publicação, papéis, permissões ou direitos anteriores não são copiados.

A revisão mostra o vínculo resolvido pelo servidor e os avisos de referências;
não usa nomes, detalhes ou URLs globais do arquivo como substituto de uma origem
indisponível. Relações e referências externas conservam apenas identidade/procedência
necessárias ao estado indisponível, separadas do remapeamento das fichas locais.
Prosa e notas próprias já escritas continuam próprias; não recopiá-las de um corpo
global revogado nem reconstruir fichas por nome/alias.

A ativação deve revalidar o mesmo universo observado e gravar livro/vínculo/contador
na mesma transação, usando o contrato estrito de prepareUniverseProjectLink.
A API atual autoriza universos do dono; esta entrega não cria convites, papéis ou
acesso compartilhado futuro. Se o vínculo antes mostrado não puder mais ser feito,
nenhuma raiz de livro utilizável será ativada por aquela confirmação.

O JSON v1–v6 não oferece uma prova da encarnação histórica do universo. A revisão
não deve afirmar essa prova nem revalidar conteúdo global histórico com base no
arquivo. O formato novo deve fixar a identidade nativa observada; ela também não
substitui a autorização vigente. Detalhes de protocolo ficam sujeitos à validação
SDK, sem concessão de acesso por descriptor/hash fornecido pelo cliente.

## Descoberta verificada no checkout

Grafo writer-v2 consultado primeiro. Busca nominal dos helpers recentes retornou
vazia; snippet de exportManuscript ainda apresentava faixa antiga/incompleta.
Os caminhos encontrados foram conferidos diretamente no checkout atual. Não usar
esse índice antigo como prova da ausência de uma capacidade.

| Fonte                                                           | Comportamento atual e lacuna                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor/services/exportManuscript.ts`                           | Gera JSON writer-book-backup v1–v6 por capacidades; baixa em memória. Não há leitor/restaurador nesse fluxo.                                                           |
| `editor/tests/exportManuscript.test.ts`                         | Regressões de v1–v6, rascunho vazio/removido, personas, universo, atos, cenas e narrativa; preservar asserts.                                                          |
| `books/services/chapterCompositionService.ts`                   | Captura grupos, cenas ativas/arquivadas/sem capítulo, referências e fontes originais de conversão com projectRevision/hash; pagina 50.                                 |
| `books/services/narrativeBackupService.ts`                      | Captura arcos, marcos, eventos e referências; não copia labels resolvidos de origens indisponíveis.                                                                    |
| `functions/src/workHistory.mjs`                                 | Lista versões do projeto inteiro mesmo após remover o recurso; lê corpo em páginas e verifica root/manifesto/chunks. Exportador ainda não usa essas APIs.              |
| `functions/src/workHistoryContracts.mjs`                        | Histórico em workVersions/workVersionBodies, chunks UTF-8 de 64 KiB, hash exato e razão manual/before-restore.                                                         |
| `functions/src/workProgress.mjs`                                | Livro tem estado editorial, meta total e ledger; checklist é de aventura/campanha, não de livro. Fuso é preferência de usuário separada.                               |
| `books/model/book.ts`                                           | status draft/published difere de editorialState draft/review/ready; não restaurar publicação por esses campos.                                                         |
| `books/services/bookService.ts` e `functions/src/sceneJobs.mjs` | Exclusão com recursos usa job que já inclui histórico e ledger; nova restauração precisa respeitar limpeza/reservas sem abandonar filhos.                              |
| `functions/src/adventureImport*.mjs` e plano28                  | Reserva permanente, filhos invisíveis, ativação atômica, recuperação protegida e limpeza limitada são padrões demonstrados, não um DTO de livro reutilizável por cast. |

O JSON atual contém coverUrl e lore global inline. URL não é prova de posse/acesso
nem backup dos bytes e pode conter token. A leitura de arquivo não deve disparar
fetch de URL arbitrária nem reutilizar caminhos privados de Storage como vínculo.

## Inventário que o contrato deve fechar

| Grupo                | Preservar                                                                       | Reconstruir ou excluir                                                                           |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Livro                | Título, gênero, sinopse e dados editoriais particulares.                        | Novo ID/dono/datas de criação; status privado, sem publicação ou direitos antigos.               |
| Atos e capítulos     | Ordem, títulos, vínculos, conteúdo legado e composição por cenas.               | IDs, índices, revisões e contadores de agrupamento.                                              |
| Cenas                | Texto, plano, stage, arquivo, posição, vínculos e formerParentId quando válido. | IDs remapeados, hashes/bytes, revisões e contagem ativa.                                         |
| Fontes de conversão  | Prosa original e metadados necessários a recuperação.                           | IDs e relação com agrupador novo, sem reativar jobs antigos.                                     |
| Narrativa            | Arcos, marcos, eventos, datas livres, ordem manual e links explícitos.          | IDs, relações locais, índices e contadores.                                                      |
| Lore próprio         | Campos atuais, aliases, estrutura e relações válidas.                           | IDs e referências locais; flags não publicam nada automaticamente.                               |
| Universo/lore global | Religar ao mesmo universo autorizado; não duplicar suas fichas.                 | Arquivo não serve como grant; origem externa não vira nota limpa por fallback.                   |
| Personas             | Presets usados, perfis próprios necessários, base e complementos.               | IDs próprios quando houver cópia; nunca chave/configuração BYOK nem biblioteca não usada.        |
| Progresso            | Estado editorial e meta total do livro.                                         | Ledger/pins/contagem a partir da composição; não importar perfil/fuso/atividade global da conta. |
| Histórico            | Conteúdo exato, datas, razão e rótulo de todas as versões do projeto.           | IDs e relações; também mapear recursos históricos sem documento atual.                           |
| Imagens              | Bytes/hash/tipo dos recursos autorizados necessários.                           | Novos vínculos por servidor; sem URL/token do arquivo usado como autorização.                    |

v1–v6 não têm histórico completo. A revisão deve informar ausência, sem fabricar
versões nem prometer recuperar bytes de capa que o arquivo antigo nunca guardou.
Novos backups precisam conter o histórico real, não apenas snapshot atual.

## Proposta mínima de fluxo

1. Exportar captura coerente do livro e histórico, com paginação limitada e gates
   de identidade/acesso antes e depois dos I/Os. Rascunho próprio é contribuição
   explícita separada da captura salva; não criar versão manual por fazer backup.
2. Produzir formato novo versionado com manifesto fechado e mídia apropriada,
   evitando base64 ilimitado em documento Firestore. O [contrato M2](33-conteiner-limitado-de-backup.md)
   adota contêiner sem compressão com quadros limitados e selo, conforme ADR 0045;
   a hipótese ZIP anterior foi substituída. Schema semântico do livro e mídia
   ainda exigem contrato próprio antes da restauração.
3. Ler/validar arquivo local e mostrar revisão: títulos, contagens, histórico,
   origem, vínculos e dados ausentes. Não executar conteúdo, carregar URLs remotas
   ou gravar projeto antes da confirmação. Versão futura desconhecida falha cedo.
4. Confirmar intenção e revisão, preparar nova cópia no servidor sem raiz visível,
   materializar recursos em passos idempotentes e reconstruir contadores/índices.
5. Ativar raiz, vínculo autorizado e recibo atomicamente somente após validação
   integral. Nunca tornar o livro publicado nem copiar créditos/grants/recibos.
6. Recuperar/cancelar pelo pedido original após perda de resposta ou reload,
   distinguindo recibo histórico de adoção atual. Definir recuperação da revisão
   confirmada antes do primeiro append; não presumir que reabrir arquivo refaz ajustes.
7. Limpar preparação descartada em páginas; reserva/fence permanecem e livro ativado
   não pode ser apagado por cleanup de preparação. Livro original fica intacto.

## Consistência a resolver antes de código

Scene/narrativeRevision e localLoreVersion já fornecem sinais de suas mutações.
Histórico possui catálogo paginado, mas não retorna uma revisão global entre
páginas. Criar/restaurar/excluir versões pode mudar a seleção durante a exportação.
Um hash de lista no cliente não elimina essa janela. O contrato precisa demonstrar
um snapshot consistente ou um clock completo dos writers pertinentes, incluindo
legados e exclusão, sem reduzir o escopo por limite comercial de versões.

O SDK instalado @google-cloud/firestore 9.3.1 expõe ReadOnlyTransactionOptions com
readTime e comentário de janela de 60 segundos. Isso é descoberta da dependência
local, não prova de semântica/retomada no serviço. Não escolher retenção de snapshot
ou depender de PITR sem verificar documentação primária e comportamento necessário.

Histórico não depende de o capítulo/cena ainda existir: listWorkVersions/readWorkVersion
conferem a raiz e versões. A restauração deve conservar os recursos históricos
remapeados mesmo quando não criará cena/capítulo atual correspondente, sem recriá-lo
silenciosamente no manuscrito. A consulta no histórico do projeto deve continuar disponível.

### Alternativa de consistência em avaliação

O vínculo não duplicado elimina a necessidade de copiar o catálogo global para a
nova obra. A captura continua precisando de prosa, lore próprio, personas usadas,
progresso, mídia e todo o histórico coerentes. Uma alternativa ao readTime é um
manifesto sob token nativo da raiz e dos recursos externos próprios, com relógio
monotônico completo do catálogo de versões. A raiz sozinha ainda não cobre histórico.

A descoberta confirmou que createAct/moveChaptersToAct e o escritor de texto legado
atualizam a raiz; cenas/narrativa e lore local já têm clocks. O ledger atualiza o
livro quando pronto. Mas createWorkVersion e o início da exclusão de versão hoje
não atualizam uma revisão global da seleção. Antes de escolher essa alternativa,
auditar também metadados/complementos, geração/aplicação de IA, jobs, restauração,
configuração de progresso e manutenção Admin; não supor que um writer esteja coberto
pelo nome do módulo. Adição, exclusão e recriação entre páginas precisam invalidar
a captura, inclusive com texto/contagem iguais.

A prova deve comparar a captura integral com writers reais e versões removidas,
sem I/O externo dentro de transação mutável nem limite silencioso de versões.
O [contrato M1](32-captura-consistente-do-historico.md) fecha revisão do catálogo e captura completa do histórico. Esse marco está liberado tecnicamente para implementação; pacote/restauração continuam com seus contratos e provas próprios.

## Verificações de mídia e dependências

A biblioteca de imagens expõe listagem/renomeação/exclusão e seleção; não há API
pública de captura de bytes nem upload de backup. O serviço servidor mantém
vínculos/contadores e migra capas aceitas. Storage permite leitura pelo dono de
book-covers apenas com accepted=true e nega escrita de cliente. Portanto P1
precisa de contrato explícito de captura/importação de mídia e limpeza de órfãos;
chamar listLibraryImages ou copiar coverUrl não resolve a portabilidade.

JSZip já existe para gerar DOCX, mas esse uso não lê pacote de backup. A
[documentação de limitações](https://stuk.github.io/jszip/documentation/limitations.html)
informa que async/generateAsync acumulam o resultado em memória; há leitura por
[internalStream](https://stuk.github.io/jszip/documentation/api_zipobject/internal_stream.html).
Inferência para o contrato: tamanho comprimido e callback de progresso sozinhos
não provam orçamento de memória. Comparar um pacote restrito sem compressão com
leitura por fluxo limitada; fechar limites por entrada e total, caminhos,
duplicatas, CRC/hash e falhas de cancelamento antes da implementação. Nenhum
formato havia sido adotado nessa descoberta. Depois, o [contrato M2](33-conteiner-limitado-de-backup.md)
adotou contêiner sem compressão e limitado por quadro; nenhuma dependência foi adicionada.

A [referência RPC do Firestore](https://docs.cloud.google.com/firestore/docs/reference/rpc/google.firestore.v1#readonly)
descreve read_time com precisão de microssegundos na última hora; PITR amplia a
janela com precisão de minuto. Já o
[tipo público Node](https://github.com/googleapis/nodejs-firestore/blob/main/types/firestore.d.ts),
assim como a dependência instalada, documenta 60 segundos. Essa diferença foi
verificada em fontes primárias em 2026-10-21, sem teste no serviço nem alteração
da dependência. Não converter a especificação RPC em promessa do SDK. A decisão
exige provar paginação consistente sob mutação e comportamento de expiração;
um snapshot expirado deve falhar explicitamente, sem misturar páginas atuais.
Autorização atual continua obrigatória mesmo ao ler uma versão histórica.

Provas a preparar após o contrato: criação/exclusão de versão entre páginas,
recurso removido com histórico ainda legível, revogação durante captura,
rascunho vazio fora da versão salva, mídia ausente/tokenizada, ID repetido,
entrada compactada excessiva e cancelamento durante leitura/transferência.
São critérios de teste propostos, não resultados executados de P1.

## Marcos sequenciais propostos

1. Universo confirmado: religar se autorizado, sem duplicação. Completar inventário
   v1–v6 e fechar schema novo, binários, remapeamento, histórico sem recurso e limites.
2. Reproduzir vetores independentes de Unicode/hash, arquivos legados, relações,
   ordem, mídia, versões removidas e campos proibidos. Só vetores não comprovam I/O.
3. Implementar contratos/leitor e captura coerente com regressões do exportador;
   autorizar e provar SDK antes de confiar em arquivo para restaurar.
4. Implementar reserva/upload/preparação/ativação/cleanup de livro com escritores
   reais e ledger, sem framework genérico para P2/P3 ainda não demonstrado.
5. Integrar exportação, revisão e restauração ao Estúdio/editor por interfaces
   públicas, com rascunho preservado, estados claros e recuperação.
6. Roundtrip real, SDK de corridas/autorizações/legados e nativo por temas/celular;
   validate no fechamento, revisão, entrega, Git e CI em paralelo.

Áreas previstas: books, editor, document-import somente se houver reuso demonstrado,
scenes, narrative-planning, manuscript-history, lore, universes, ai-assistant/personas,
image-library e Functions/Rules/índices. A feature/serviço de portabilidade será
escolhida ao fechar fronteiras; nenhuma importação interna entre features.

## Critérios de aceite

- [ ] v1–v6 lidos com revisão de ausências, sem gravação parcial ou origem inventada.
- [ ] Novo formato inclui estado atual e todo histórico, inclusive recursos removidos.
- [ ] Rascunho legado aberto/vazio/removido continua no backup explícito sem autosave forçado.
- [ ] Roundtrip em nova cópia preserva prosa, estrutura, arquivo, ordem e relações.
- [ ] Universo autorizado é religado, sem duplicar/alterar global; ausência permite revisão sem vínculo.
- [ ] Revogação após revisão bloqueia aquela ativação; corpo global inline nunca vira lore local.
- [ ] Referências externas indisponíveis ficam neutras, sem nomes/corpos de fallback ou grant do arquivo.
- [ ] Datas/IDs/revisões/ledger/índices e mídia reconstruídos no servidor, sem tokens externos.
- [ ] Estado privado, sem publicação/compra/grant/credencial importados.
- [ ] Perda de resposta, UID/ABA, concorrência, cancel/retomada e cleanup sem perda ou duplicação.
- [ ] SDK com origens e autores distintos; versão futura/corpo/hash/tamanho inválidos falham antes de ativar.
- [ ] Nativo de backup/restore/retomada/legados e temas/celular; provas distintas das fixtures.
- [ ] Validate local, documentação/entrega/revisão/Git e CI com resultados reais separados.

## Riscos e esforço

Riscos: mistura de páginas do histórico, perda de rascunho, fonte global sem prova,
URL com token, pacote inválido/descompactação excessiva, identidade reutilizada,
contadores importados, histórico órfão e projeto visível incompleto. Não truncar
conteúdo nem enfraquecer testes para ajustar o limite.

Estimativa O/C/P de P1 ainda não consolidada: dependem do contrato de snapshot,
mídia; a escolha de universo já está confirmada. A baseline antiga de F2-09 não cobre automaticamente este inventário.
Tratar 20h/semana como capacidade do operador, sem converter tempo do agente em
horas humanas ou prometer calendário antes de fechar o recorte.

## Não escopo

Mesclar/sobrescrever projeto, publicar/vender, arquivo comercial, IA, OCR,
restauração de aventura/campanha, importação de chat/chaves/recibos/grants ou
reconstrução de dados que nunca existiram nos JSON legados. A implementação P1 começa pelo marco interno M1; não há entrega de pacote ou restauração neste checkpoint.
