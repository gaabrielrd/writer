# P2 — finalização das imagens da aventura restaurada

Base: b6d2f62. Incremento anterior validado dirigidamente e commitado localmente.
Usar plan-feature/implement-feature; sem subagentes, CI, push ou deploy.

## Objetivo e requisitos

Liberar imagens na biblioteca própria depois da ativação real da aventura, uma
por chamada, com recuperação e sem regravar/religar cenas, blocos ou raiz.

- Job activated continua congelado; controle activationMedia/current separado,
  com checkpoint/CAS, contagens e cursor limitados. Cada imagem produz outcome
  imutável e recibo nativo da conta; conclusão exige uma leitura vazia final.
- getAdventureRestoreMediaState e advanceAdventureRestoreMedia são internos.
  Entrada fechada; checkpoint da mídia distinto do checkpoint do job.
- Uma unidade lê a próxima intenção preparada pela ordem física, prova seu
  journal/descritor e a instalação da imagem pelo recibo e nascimento nativo.
  Não exigir que a imagem inteira ou o head atual sejam iguais ao staging:
  desvínculo e edições legítimas posteriores são preservados.
- Extrair readAdventureStageJournal da prova existente sem relaxar o leitor de
  artefatos. O leitor pós-ativação confere explicitamente nascimento, origem v2,
  caminho, hashes/geração imutáveis e usos reais da imagem.
- Imagem pendente própria usa assets.accept fora da transação; conferir proof/URL
  pelo validador existente e revalidar contexto/checkpoint/encarnação no ACK.
  Liberar imagem e gravar outcome/controle/recibo juntos. Não alterar usos/textos.
- Desvincular não elimina a imagem da biblioteca própria. Imagem deleting/deleted
  exige zero usos e assets.retire idempotente antes do outcome unavailable;
  o marcador físico deve substituir a geração preparada. Nunca republicar.
- Ausência/recriação, origem/geração estrangeira e inconsistências falham sem
  adotar, sobrescrever ou apagar o substituto. Não converter corrupção em sucesso.
- Replay confirma recibo antes de I/O, com progresso atual e resultado histórico;
  nome/uso/retirada posteriores não revogam a confirmação nem concedem acesso.
  Contagens ready/unavailable descrevem resultados históricos, não grants atuais.
- Controles/outcomes/recibos fechados e provados por birth/updateTime, hashes,
  ativação original e limites. Nenhuma lista de todos os ativos em memória.

## Sequência e arquivos

1. Separar a prova pura de journal em adventureRestoreArtifacts, preservando
   todos os checks do leitor existente.
2. Criar MediaContracts/MediaRead/MediaStore/MediaService conforme fronteiras;
   usar o Store parent para autorização/prova, sem mutá-lo. Compor em Transfer.
3. Testes Node: vazio, múltiplos ativos, CAS/replay, resposta perdida, rollback
   de todos os writes, prova/recriação, detach, retirada/aceitação concorrentes,
   edições/exclusão da origem, erro/retry Storage e isolamento de conta.
4. Corpus Writer real e SDK integrado demo com Storage HTTP local, incluindo
   consumo normal da imagem após liberação. Testes dirigidos neste incremento.
5. Revisar diff/segredos, ADR/arquitetura/AGENTS/progresso/evidência e commit local.
   Validate integral no fechamento do próximo grande bloco.

## Riscos e decisões

Liberação após detach mantém a cópia própria, como a política de biblioteca e
restauração de livros. Remover a aventura não remove automaticamente a biblioteca.
Não escrever URL em heads históricos: leitores normais resolvem o imageId ativo.
Retirada e PATCH precisam do protocolo permanente existente, inclusive ACK perdido.
Qualquer mudança da disponibilidade durante o I/O exige retry com revalidação.

Não escopo: coleta da fonte, transporte/callables/UI/recuperação integrada,
roundtrip completo, campanhas e publicação/comércio. Sem nova dependência,
índice ou alteração de Rules; novos paths internos já são negados por padrão.

## Aceites

- [x] Uma imagem por unidade, final vazio e parent job imutável.
- [x] Instalação própria provada, aceitação ou retirada física antes do ACK.
- [x] Imagem/outcome/controle/recibo atômicos e recuperáveis.
- [x] Detach/edições preservados; retirada/ABA não republicam ou dão grants.
- [x] Testes dirigidos/corpus/SDK, revisão/docs/evidência e commit local.

P2/P3/D/F2-09, fases 3–5 e condições humanas/comerciais continuam abertos.
Macro 8/35 inalterada.
