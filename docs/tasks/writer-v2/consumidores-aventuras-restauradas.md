# Consumidores das aventuras restauradas

Snapshot local de 2026-10-29, código-base 38c6673 e fechamento técnico dirigido
dos [planos 198](execucao/198-ciclo-normal-das-aventuras-restauradas.md) e
[199](execucao/199-exclusao-completa-de-aventuras.md).
[Validação integral local](../../entregas/2026-10-29-writer-v2-validacao-integral-das-aventuras.md):
4.890 frontend, 94 scripts e 3.989 Functions passaram, além de tipos/build/smoke.
Não certifica produção, aceites humanos ou conclusão de P2/F2-09.

## Evidência de ciclo normal e exclusão

adventureRestoredConsumers.test.mjs usa o produtor TypeScript real, leitores
atuais, restauração/Storage/auditoria/ativação/mídia/coleta e consumidores normais.
Nenhuma raiz é inserida diretamente no destino. Após coletar a fonte, a cópia é
editada e recapturada; uma segunda restauração conserva as alterações.
A primeira cópia percorre então a exclusão completa, enquanto original, segunda
cópia, aventura irmã e campanha capturada são preservados.

O ciclo vazio usa criação normal do Estúdio, captura/restauração completas e
perda do ACK após o commit terminal, seguida de replay exato sem novo efeito.
Entradas históricas (parte legada e pai ausente) continuam fixtures identificadas,
com restauração, leitura e recuperação pelos serviços reais.

| Família                            | Escrita / leitura normais                                          | Evidência e exclusão                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raiz privada / Estúdio             | Criação, leitura e catálogo com owner atual.                       | Raiz e todos os descendentes ausentes ao final; reserva/job/recibo nativos, consulta/listagem/replay terminal sem recriação.                                |
| Partes / agrupadores               | Scenes, fonte preservada e composição.                             | Legado recapturado; partes reais preenchidas antes da exclusão e retiradas no ciclo rico.                                                                   |
| Cenas / corpo / planejamento       | Scenes e ledger, texto e edição normais.                           | Corpo exato antes da exclusão, nenhum descendente após; aventura irmã mantém corpo e retomada próprios.                                                     |
| Parte ausente                      | Listagem paginada, leitura por identidade e recuperação explícita. | CAS/ausência e formerParentId; edição/recaptura sem parte fictícia. Órfãos na exclusão possuem contrato e testes próprios de inventário.                    |
| Blocos / audiência                 | AdventureBlocks, ledger e histórico.                               | Reescrita e audiência gm; exclusão do projeto retira bloco/corpos/histórico, sem recriar recurso.                                                           |
| Referências de cena                | Set/list e índices de lore.                                        | Origem remapeada lida normalmente; nenhum vínculo descendente permanece na raiz excluída.                                                                   |
| Arcos / marcos / eventos           | NarrativePlanning e links.                                         | Texto/data manual e IDs remapeados; famílias preenchidas e removidas pela exclusão inteira.                                                                 |
| Lore próprio                       | Metadata/corpo/CAS pelo serviço.                                   | Edição e contexto com lore alterado; todos os corpos/índices próprios removidos. Sem converter origem externa em autoria.                                   |
| Persona                            | Bindings e biblioteca/lotes ativos.                                | Complemento restaurado usado no contexto; perfis não vazios e seus dados preservados após a exclusão.                                                       |
| Progresso / checklist / ledger     | Writers e WorkProgress.                                            | Checklist/manuscrito removidos; atividade própria retirada com revisão da conta, accessedAt e retomada da irmã preservados.                                 |
| Histórico / rascunho               | List/read/create/restore; before-restore.                          | Histórico integral e rascunho recuperado antes; nenhum filho de versão permanece após excluir. Versão de bloco removido não recria recurso.                 |
| Imagem / uso / bytes               | Biblioteca, setters tipados e Storage por geração.                 | Duas cópias restauradas reais, usos próprios retirados e contadores ajustados; bytes/gerações e usos da irmã/campanha permanecem exatos.                    |
| Universo                           | Origem nativa, autorização e revisão de ativação.                  | Origem indisponível não copia lore nem cria universo; autorização/ABA/desvínculo pertencem também às regressões específicas.                                |
| Contextos / chat                   | Prepare/advance/inspect, conversa e geração local de teste.        | Contexto/resposta derivados retirados; pergunta própria exata legível com answer null e apresentação bloqueada. Nenhuma IA remota ou cobrança neste ensaio. |
| Preparação / recuperação / recibos | Restauração e sidecars.                                            | Fontes/chave coletadas; job e recibos preservados. Replay da ativação antiga apenas confirma metadata sem raiz nova.                                        |
| Campanha capturada                 | Capture/BaseRead e notas próprias.                                 | Captura real antes da exclusão; base deixa de ser legível quando a origem é removida, enquanto campanha, notas e seus usos de imagem permanecem.            |

## Limites e pendências explícitos

- A exclusão completa está integrada localmente no projeto/Estúdio, com retomada e
  binding SDK; ver [integração](../../entregas/2026-10-29-writer-v2-exclusao-de-aventuras-no-estudio.md).
  A política final das perguntas continua pendente; o motor preserva perguntas.
- A [auditoria técnica P2](execucao/200-auditoria-tecnica-da-portabilidade-de-aventuras.md)
  conferiu os nove passos e os grupos de conteúdo. A decisão de retenção ligada
  a 199 continua pendente. P3 deve portar campanhas e D deve demonstrar conto/
  aventura e duas mesas; uma campanha neste corpus não substitui essas entregas.
- Comércio/publicação/permissões da compra pertencem às fases posteriores.
  Backup privado não concede direito comercial, compra ou acesso externo.
- O corpus usa dados sintéticos e doubles de metadata/Storage, com serviços reais.
  As 36 jornadas de browser da integração anterior têm rotas/providers/journal
  reais e auth/RPC fictícios. Não foram repetidas por mudanças somente de testes.
- SDK real local prova exports/headers/limites e recusas HTTP, não credenciais,
  atestado positivo ou Rules de produção. Nenhum novo SDK/Rules foi executado
  neste fechamento; a suíte integral inclui os testes SDK existentes.
- Endpoints novos dependem de implantação coordenada para uso com conta real.
  Nenhuma CI, publicação, envio remoto, merge ou implantação foi executado.

## Histórico da preparação

Os registros seguintes preservam os estados anteriores da implementação.
A descrição atual e os limites deste snapshot estão acima.

## Preparação da exclusão — plano 199 aberto

Guards privados e Rules agora recusam origem permanentemente reservada,
inclusive raiz reaparecida, nas famílias integradas no
[avanço local](../../entregas/2026-10-28-writer-v2-reserva-e-fonte-da-exclusao-de-aventuras.md).
Inclui autores/importação/restauração, consumidores de autoria e campanha,
mídia pendente, catálogo e retomada. Fonte interna de confirmação usa carimbos
nativos, sem mutar. Não existe início público ou limpeza de projeto ainda.
Esta preparação não fecha a lacuna de exclusão completa nem P2/P3/D/F2-09.

O início interno agora grava reserva/job/recibo/revogação e desfaz o vínculo
do universo atomicamente; resolve tentativas sem resposta e prova identidades
nativas. Inventário limitado encontra filhos com pais ausentes.
Veja a [evidência](../../entregas/2026-10-28-writer-v2-inicio-privado-e-inventario-da-exclusao-de-aventuras.md).
Continua sem endpoint/UI de exclusão ou avanço da limpeza; o conjunto do
plano 199 permanece pendente.

O avanço interno agora fecha contextos por metadata e desliga turnos ativos
antes de respostas tardias. Fonte nativa original no job permite prosseguir sem
head; rollback/recibo/páginas e BYOK foram comprovados no emulador demo.
Veja a [evidência parcial](../../entregas/2026-10-28-writer-v2-avanco-privado-e-encerramento-de-contextos.md).
Perguntas próprias preservadas; fontes/mídia/limpeza final e UI ainda faltam.

A coleta da fonte também está integrada à quiescência da exclusão: mídia ainda
preparing é retirada por geração sem promoção; recibos de mídia/coleta e
exclusão ficam no mesmo commit. Imagens já ativas, personas e job ativado são
preservados. Importações retiram manifests por recibos/nascimento e páginas,
sem hidratar o manuscrito. Veja a
[evidência parcial](../../entregas/2026-10-28-writer-v2-fontes-na-exclusao-de-aventuras.md).
Usos restantes, autoria/controles/atividade, verificação final e UI ainda faltam.

Usos e autoria agora possuem processadores internos limitados: contador agregado
por imagem, biblioteca independente preservada e inventário completo por famílias,
incluindo pais ausentes. Fonte restaurada foi percorrida em Node; consultas e
transações foram provadas pelo SDK local em dados sintéticos de autoria/usos.
[Evidência parcial](../../entregas/2026-10-28-writer-v2-usos-e-autoria-na-exclusao-de-aventuras.md).
Controles/atividade/vazio terminal e interface ainda faltam; a raiz permanece
marcada até os passos finais. Não comprova exclusão completa de projeto.

Corpos derivados do chat e retomada também possuem processadores internos:
páginas por metadata, prova nativa/hash de órfãos e revisão da conta atômica.
Perguntas próprias e outros projetos permanecem; atribuição incerta recusa.
[Evidência parcial](../../entregas/2026-10-28-writer-v2-chat-e-retomada-na-exclusao-de-aventuras.md):
56 Node e três SDK/Rules positivos. Chega a verify em deleting; raiz/final,
cliente/UI e validate integral continuam pendentes. Não fecha plano 199.

Verificação final e remoção da raiz agora existem no motor interno: nova passagem
do chat, vazios atuais e reabertura de fase conhecida, com reserva/job/recibo
terminais no mesmo commit. 123 Node e seis SDK/Rules passaram;
[evidência parcial](../../entregas/2026-10-28-writer-v2-verificacao-terminal-da-exclusao-de-aventuras.md).
O double percorre aventura restaurada; os novos SDK usam criação pelo Estúdio.
Roundtrip amplo, transporte/cliente/UI e validate integral ainda faltam. Plano 199
permanece aberto; perguntas próprias preservadas e política final pendente.

Núcleo cliente da exclusão preparado como feature própria: identidade/sourceToken/
deletionToken, recibos e diário metadata por UID/aventura com Web Locks/CAS.
49 Vitest e 21 testes arquiteturais passaram;
[evidência parcial](../../entregas/2026-10-28-writer-v2-cliente-e-recuperacao-da-exclusao-de-aventuras.md).
O ciclo cliente/serviço usa factories reais sobre double, não HTTP/SDK ou conta
real. Transporte autenticado, tela, retomada no navegador e validate integral
continuam necessários; não fecha plano 199.

Diálogo/hook standalone e dispatcher autenticado privado preparados: nova sessão
por conta/alvo/abertura, pausa, confirmação exata, replay com reserva segura e
revogação comprovada antes do CAS local. 67 Vitest, 12 Node e 18 jornadas
Chromium isoladas positivos;
[evidência parcial](../../entregas/2026-10-28-writer-v2-fronteira-e-dialogo-da-exclusao-de-aventuras.md).
A rota principal/Estúdio, catálogo e binding HTTP ainda não usam esse diálogo.
Auth/transporte são fictícios no browser; ciclo rico restaurado e validate
integral permanecem no fechamento do plano 199.
