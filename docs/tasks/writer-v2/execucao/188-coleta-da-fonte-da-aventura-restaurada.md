# P2 — coleta da fonte da aventura restaurada

Base: 9d7a339. Incrementos 186/187 validados dirigidamente e commitados localmente.
Usar plan-feature/implement-feature; sem subagentes, CI, push ou deploy.

## Objetivo e requisitos

Descartar fonte e preparação privadas depois da ativação e finalização de mídia,
sem apagar ou revalidar contra snapshots antigos o projeto já editado.

- Job activated permanece congelado. Exigir controle de mídia complete provado
  nativamente; fixar operação/token/contexto dessa conclusão no sidecar de coleta.
- getAdventureRestoreArchiveCleanup e advanceAdventureRestoreArchiveCleanup
  internos, entrada fechada, checkpoint próprio inicial zero, CAS/replay.
- Por páginas até oito: provar journals; apagar somente seus alvos scope job e
  os próprios journals. Para adventure/persona/image, não ler nem apagar alvos.
  Comparar contagem final ao artifactCount e exigir preparedRoot vazio.
- Fonte: apagar pares chunk/proof juntos, com metadata nativa e recibos criadores,
  sequência/tamanho/hash/token/chain coerentes, sem ler Base64. Apagar estados SHA,
  índice/itens de validação por páginas e estado final por prova de nascimento/
  última atualização. Não reler JSON/texto/frames para descartar.
- Provas metadata-only exigem createTime/updateTime corretos e recibo próprio/
  efeitos/identidade/limites; não equivalem a consumo do payload. Preservar fonte
  ausente/recriada/divergente e falhar em vez de adotar/deletar dados alheios.
- Conferir cada contagem e consulta vazia; verificação final de todos os namespaces
  privados conhecidos e inexistência de chave de recuperação pendente. Registros
  inesperados nesses namespaces bloqueiam a conclusão, sem exclusão ampla.
- Preservar raiz/partes/cenas/blocos/corpos/histórico/lore/índices/progresso,
  biblioteca/usos, personas/lote, job/reserva/recibos de ativação e sidecars de mídia.
  Não reutilizar cancel/cleanup pré-ativação, recursiveDelete nem I/O Storage.
- Exclusão por página, checkpoint e recibo no mesmo commit. Replay retorna
  recibo histórico com progresso atual antes de ler fonte já removida.
  Get/status/replay de ativação e mídia permanecem válidos após coleta.

## Suposições e não escopo

A coleta remove apenas namespaces privados enumerados pelo contrato desta versão.
Não reivindica exclusão de coleções arbitrárias de Admin, não adota conteúdo não
journalado e não toca recursos autorais. Chave de recuperação do futuro transporte
precisa ser encerrada pelo próprio protocolo antes da coleta; esta etapa só bloqueia
sua presença. Sem UI/callables/recuperação integrada, campanhas ou publicação.

## Sequência e arquivos

1. ArchiveContracts, ArchiveStore, ArchiveRead e ArchiveUnits/ArchiveService;
   compor no Transfer, reutilizando Store de autorização e prova de mídia.
2. Testes Node: mídia incompleta, vazio, páginas/retomada, corpo não lido,
   edições/arquivo/detach/retirada/root ausente, rollback/CAS/replay, ACK perdido,
   ABA/unknown record e chave pendente; preservar outros jobs/contas.
3. Corpus Writer real, SDK integrado demo e regressões de mídia/ativação/provas.
4. Revisão, ADR/docs/AGENTS/evidência, validate integral do bloco 186–188 e commit
   somente local. Não declarar V2/P2 concluídos.

## Riscos

Não usar comparação do alvo atual com o journal para recursos autorais.
A integridade de metadata deve ser provada antes da exclusão, sem hidratar payload.
As provas da mídia, personas e recibos originais precisam sobreviver à coleta.
Cursor não pode pular registros inesperados ou aceitar reaparecimento atrás dele.

## Aceites

- [x] Coleta limitada exige mídia concluída e mantém parent congelado.
- [x] Fonte/preparação são removidas por provas/contagens/consultas vazias.
- [x] Projeto/biblioteca/personas e recibos são preservados após edições reais.
- [x] Atomicidade, CAS/replay/ACK/ABA/isolamento cobertos.
- [x] Corpus/SDK/revisão/docs/evidência, validate integral e commit local.

Recuperação/transportes/UI/roundtrip, P2/P3/D/F2-09, fases 3–5 e gates humanos/
comerciais continuam abertos. Macro 8/35 inalterada.
