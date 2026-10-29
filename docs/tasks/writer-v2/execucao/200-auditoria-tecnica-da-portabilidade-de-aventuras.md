# P2 — auditoria técnica integral da portabilidade de aventuras

- Data: 2026-10-29.
- Base conferida: 8d7bb5ad91c7afd4602346cef77499590a014e45, árvore limpa.
- Escopo: os nove passos e todos os grupos de conteúdo do [plano 147](147-portabilidade-privada-de-aventuras.md), com o [contrato transversal](25-lore-importacao-e-portabilidade.md).
- Resultado: auditoria técnica concluída, com requisitos abaixo verificados localmente. Não encerra 199, F2-09, fase 2, o objetivo Writer V2 ou gates de produto/operação.

## Objetivo, método e suposições

Conferir implementação e evidência pelo escopo original, sem usar a suíte verde
como substituta da análise dos requisitos. Grafo consultado primeiro: os novos
serviços não aparecem no índice parcial; os arquivos atuais foram inspecionados.
Foram cruzados serializers, validadores, serviços, contratos, testes e relatórios
originais. Resultado de busca sem nó não foi tratado como ausência de capacidade.

A base contém o código de produção integrado em 38c6673 e o ciclo enriquecido em
8d7bb5a. O diff entre ambos, filtrado por src, functions e e2e, contém somente três
arquivos de suporte/teste na feature, sem mudança de produção. O validate integral anterior cobre esse código e
os testes atuais. Não houve nova mudança de comportamento neste incremento.

Sequência executada: extrair requisitos, localizar os contratos atuais, inspecionar
provas positivas/negativas, conferir artefatos e classificar pendências separadas.
Não escopo: implantar, usar conta/arquivo real do operador, habilitar compra/
compartilhamento, decidir retenção do chat ou substituir P3/D por este ensaio.

## Matriz dos nove passos

| Passo original                                                                  | Implementação inspecionada                                                                                                                                                                                                                                                               | Prova e alcance                                                                                                                                                                                                                                                                                                                 | Estado                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1. Inventário/contrato/fonte metadata, auth/own/delete/recreate/entrada fechada | [Fonte](../../../../functions/src/adventureBackupSource.mjs), [definições](../../../../functions/src/adventureBackupResourceDefinitions.mjs) e [inventário](../inventario-portabilidade-aventuras.md)                                                                                    | [Âncora](../../../../functions/test/adventureBackupSource.test.mjs) e [guard de exclusão](../../../../functions/test/adventureDeletionGuard.test.mjs): owner, máscaras, tokens nativos, mudança/ABA e reserva permanente; fonte não concede acesso a outro UID.                                                                 | Verificado localmente                              |
| 2. Estrutura/cenas/blocos/narrativa/lore/relações, fluxo e reconferência        | [Recursos](../../../../functions/src/adventureBackupResourceRead.mjs), [composição](../../../../src/features/adventure-portability/services/adventureCoreData.ts) e [stream](../../../../src/features/adventure-portability/services/streamAdventureArchive.ts)                          | Testes Resources/Narrative/Lore e [captura integral](../../../../src/features/adventure-portability/tests/streamAdventureArchive.test.mjs). Todas as views/presenças entram no inventário; segunda passagem completa e fonte final recusam alterações, não só mudança de contagem.                                              | Verificado localmente                              |
| 3. Histórico/progresso/checklist/personas/universo/mídia e pacote completo      | [Pacote de oito seções](../../../../functions/src/adventureBackupPackage.mjs) e leitores próprios por domínio                                                                                                                                                                            | [Histórico](../../../../functions/test/adventureBackupHistory.test.mjs): 53 versões sem cap de seleção, manual/before-restore, cena/bloco, texto literal/Unicode/UTF-8; Progress/Persona/Image/Universe e captura integral conferem os demais grupos.                                                                           | Verificado localmente                              |
| 4. Framer neutro, identidade própria e bytes de livro preservados               | [Framer](../../../../functions/src/portableBackupContainer.mjs), [aventura](../../../../functions/src/adventureBackupContainer.mjs) e [livro](../../../../functions/src/bookBackupContainer.mjs)                                                                                         | [Vetor aventura](../../../../functions/test/adventureBackupContainer.test.mjs) e [vetor livro](../../../../functions/test/bookBackupContainer.test.mjs): bytes independentes SHA/struct, assinaturas distintas e rejeição cruzada. Versão futura falha após só o header; corrupção/truncamento/arquivo concatenado recusados.   | Verificado localmente                              |
| 5. Leitor/validador/índice/revisão, sem publicação parcial                      | [Inspeção](../../../../src/features/adventure-portability/services/inspectAdventureRestoreFile.ts), [conteúdo](../../../../functions/src/adventureBackupContent.mjs) e [validação persistente](../../../../functions/src/adventureRestoreValidation.mjs)                                 | Validação local content-only, Blob/hash/revisão metadata congelados; schemas/relações no servidor antes da preparação. Inspect/PersistentValidation/ValidationStep e testes backend recusam alteração de fonte, domínio, campos ou revisão.                                                                                     | Verificado localmente                              |
| 6. Reserva/upload/preparação/remap/recuperação/cancel/cleanup                   | [Remapeamento](../../../../functions/src/adventureRestoreRemap.mjs), [transferência](../../../../src/features/adventure-portability/services/adventureRestoreStartSession.ts) e [journal](../../../../src/features/adventure-portability/services/adventureRestorePreparationJournal.ts) | [Transporte](../../../../functions/test/adventureRestoreTransfer.test.mjs), remap/cleanup e testes de journal/crypto/drivers. UID/arquivo/hash/revisão próprios; nova cópia, pedido exato/CAS/Web Locks e conteúdo cifrado; perda de ACK, conta trocada, chave indisponível e cancelamento cobertos.                            | Verificado localmente                              |
| 7. Ativação atômica e finalização/mídia/coleta                                  | [Ativação](../../../../functions/src/adventureRestoreActivation.mjs), [mídia](../../../../functions/src/adventureRestoreMedia.mjs) e [coleta](../../../../functions/src/adventureRestoreArchive.mjs)                                                                                     | [Ativação](../../../../functions/test/adventureRestoreActivation.test.mjs), Media e ArchiveCleanup: rollback/replay e fence; biblioteca preparando separada da promoção, retirada por geração e remoção de fontes/chave. Job/recibos ficam congelados.                                                                          | Verificado localmente                              |
| 8. Interface pública Estúdio/editor, conta/vida útil/retomada/estados           | [Backup](../../../../src/features/adventure-portability/components/AdventureBackupDialog.tsx), [restauração](../../../../src/features/adventure-portability/components/AdventureRestoreDialog.tsx) e composição pública em Studio/editores                                               | Testes de Dialog/Preparations/Studio, [entrega 196](../../../entregas/2026-10-28-writer-v2-restauracao-de-aventuras-no-estudio.md) e [197](../../../entregas/2026-10-28-writer-v2-backup-de-aventuras-pela-interface.md). Revisão antes do start e confirmação antes de ativar; abort/erro/conta/reload sem efeitos duplicados. | Verificado localmente com limites de plataforma    |
| 9. Roundtrip/consumidores/exclusão, SDK/browser, validate e registros           | [Ciclo real](../../../../src/features/adventure-portability/tests/adventureRestoredConsumers.test.mjs), [exclusão integrada](../../../../src/features/adventure-portability/tests/adventureRestoredDeletionFixture.mjs) e [matriz](../consumidores-aventuras-restauradas.md)             | [Fechamento 198–199](../../../entregas/2026-10-29-writer-v2-validacao-integral-das-aventuras.md): original/segunda cópia/irmã/campanha e dados independentes preservados; raiz/filhos/contextos/usos próprios removidos, sem ressurreição por recibo. SDK/Rules/browser nas evidências respectivas e validate integral verde.   | Verificado tecnicamente; política do chat pendente |

## Cobertura de conteúdo e semântica

- Partes, texto legado, cenas ativas/arquivo/sem parte, blocos principal/adicionais,
  audiência/tipo/ordem/imagem, planner e referências: definições de recurso e
  matrizes 158/198, com corpo obrigatório e ausência opcional explícitos.
  O corpus restaura legado e pai ausente; recuperar para Sem parte exige CAS/
  confirmação e conserva formerParentId, corpo e histórico.
- Arcos/marcos/cronologia: ranks/controles e links têm tipos próprios; data textual
  livre permanece texto, sem calendário ou missões inferidos da prosa.
- Lore local completo, corpos, relações e tombstones: reader próprio, sem cópia de
  lore global. Remap troca somente referências próprias da aventura de origem.
- Histórico: estado salvo e todas as versões registradas, incluindo before-restore
  e recurso já removido; não recria esse recurso. [Rebloco UTF-8](../../../../functions/test/adventureRestoreHistory.test.mjs)
  mantém 65.535 bytes mais um glifo de quatro bytes como texto completo.
- Rascunho é opcional e explícito do editor aberto, congelado antes do seletor.
  O padrão mantém texto salvo; o rascunho vira versão separada na restauração.
  Não varre outros rascunhos do dispositivo nem promete incluir edição de lore
  ainda não salva ou texto de outra conta.
- Personas usadas pela aventura/cenas são perfis portáveis, sem BYOK/configuração
  de geração. Reconstroem biblioteca/lote privados e bindings remapeados; não
  exportam toda a biblioteca da conta. Disponibilidade após ativação e exclusão
  da raiz tem prova por leitor normal em AdventureRestoreActivation.
- Imagem é byte próprio autorizado, por recurso/generation/metageneration e SHA;
  não é URL com token. A restauração cria cópia independente por recurso. Corpus
  confirma duas imagens ativas e preservação de bytes/gerações/usos após excluir.
- Progresso/checklist preservam escolhas próprias; contadores/ledger/revisões são
  reconstruídos. Fuso/preferências e atividade pertencem à conta, não ao arquivo.
- Universo original é referência nativa, nunca duplicação de universo/lore.
  [Reautorização final](../../../../functions/test/adventureRestoreUniverse.test.mjs)
  reconfere owner/acesso atual e nascimento original no commit de ativação.
  Origem none/unavailable ou universo recriado não é promovido por coincidência.
- Chat/chaves/pedidos/recibos/fences/grants/publicação/compra não são autoria
  portátil. Pacote reconhece somente suas oito seções e schemas de domínio;
  bytes locais válidos continuam inertes até autorização/preparação no servidor.

## Consistência e limites conferidos

A segunda passagem reconfere cada unidade/ID/token/presença. Persona de cena é
conferida pelo próprio head, além da raiz; perfis, biblioteca/usos, Storage e
universo têm provas próprias. Tokens nativos monotônicos delimitam a janela
comum da captura. Isso não congela o editor depois de concluir o arquivo.

Payload de registro P2 é limitado a 65.536 bytes; o frame inclui overhead e
não tem a mesma medida. Container neutro limita metadata a 16 KiB e payload
genérico a 256 KiB, com contagens uint32; validações recusam excesso em vez de
truncar. Histórico é percorrido por páginas sem cap de seleção (caso 50+3) e
texto/imagem por unidades/ranges, não por um Blob inteiro na memória de exportação.
Não se afirma suporte ilimitado ou uma medição de desempenho do manuscrito real
do operador a partir do corpus sintético.

O [corpus F1 medido](02-modelo-de-dominio.md) também foi cruzado com esses limites.
Probe somente de metadata, executado nesta auditoria com importSource e
sourceDescriptor reais, aceitou os comprimentos de arquivo de 21.126.626 e
1.459.149 bytes (323 e 23 chunks). O maior texto de página medido, 7.127 bytes,
é inferior ao limite de 800.000 bytes por seção da importação. Esse confronto
não ignora overhead HTML/JSON nem afirma que a obra inteira cabe num documento.

O limite de 16 MiB por PNG é específico de imagem, não um teto global para
PDF/importação ou para o arquivo .writer. O descritor também recusou acima de
0xffffffff chunks, em vez de truncar. m123-size-probe.log registra o resultado
com escopo declared-byte-length-only. Não leu, importou ou restaurou os PDFs:
aceitar o número de bytes não torna um PDF um arquivo nativo de aventura.
Fidelidade de layout e performance com arquivos reais continuam fora desta prova
de limites; não foram declaradas concluídas pela auditoria de P2.

## Evidência original e atualidade

O validate de 8d7bb5a passou com 4.890 frontend em 367 arquivos, 94 scripts,
3.989 Functions, sintaxe de 407 módulos, tipos/build/smoke. Cobertura global
89,67/85,86/90,88/92,84, sem mudança de limites. Este incremento documental não
repete esses testes nem os apresenta como rodada nova.

Relatórios originais conferidos em writer-v2-portability-qa:
m109-ui-result.json e m110-ui-result.json têm nove checks cada, com sobreposição:
arquivo nativo de 316.497 bytes, serviços de captura/restauração reais sobre
doubles, OPFS/IndexedDB/Web Locks/WebCrypto nativos e chooser/Auth/App Check/
SDK sintéticos. O primeiro cobre abort/cancel e preservação do arquivo anterior;
o segundo cobre legado/órfão e sua recuperação. Não somar como 18 cenários únicos.

m121-browser-results.json conserva 36 esperados, zero skipped/unexpected/flaky,
em seis variantes; diálogo/rotas/journal reais com auth/RPC fictícios. Este
relatório não comprova sozinho o pipeline nativo da restauração: as provas são
complementares. O diff 38c6673..8d7bb5a foi conferido: somente três arquivos de
teste em src/functions/e2e, sem alteração de produção que invalide essas rotas.

## Pendências e passagem para P3

1. Plano 199 continua aguardando a decisão final das perguntas; o comportamento
   atual de preservação foi provado, não aprovado novamente. A auditoria não
   marca essa escolha nem a fase como concluída.
2. P3 deve incluir notas/sessões/referências/pistas/missões/ordens/variantes e a
   edição congelada de base com prova de procedência do servidor e acesso atual.
   Archive origin não é grant; recapturar a aventura atual não repõe edição antiga.
3. D ainda deve demonstrar conto/aventura e duas mesas no mesmo universo com
   roundtrip e origem removida. Uma campanha neste corpus não substitui D.
4. Browser sem File System Access explica indisponibilidade e não inicia captura,
   conforme o contrato 197. Chooser do SO, disco cheio, dispositivo real, leitor
   de tela e zoom físico permanecem fora das provas automáticas.
5. Endpoints/Rules/cliente precisam de operação coordenada quando implantação for
   solicitada; credenciais reais, produção, compra e aceites humanos/comerciais
   não são aprovados por esta auditoria. Não houve CI/remoto/deploy.

A implementação técnica de portabilidade P2 atende o escopo v1 auditado; seu
registro formal conserva a pendência de retenção vinculada a 199. P3 pode começar
pelo contrato técnico independente: o arquivo já exclui chats e não precisa
decidir o destino dessas perguntas para definir a portabilidade da campanha.
Não abrir exceção para material derivado revogado nem introduzir esse material
como nota própria. Macro 8/35 e objetivo completo Writer V2 permanecem inalterados.

## Aceites desta auditoria

- [x] Nove passos e grupos de conteúdo vinculados a código/provas pertinentes.
- [x] Evidência sintética, SDK real, browser nativo e limites distinguidos.
- [x] Nenhum gap técnico novo identificado pelo cruzamento atual.
- [x] Pendências de 199/P3/D/F2-09/operação preservadas.
- [x] Check documental/formato/diff e commit local desta auditoria.
