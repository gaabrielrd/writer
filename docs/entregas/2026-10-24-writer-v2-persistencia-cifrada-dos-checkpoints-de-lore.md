# Writer V2 — Persistência cifrada dos checkpoints de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [105 / M38c5g](../tasks/writer-v2/execucao/105-persistencia-cifrada-dos-checkpoints-de-lore.md).
- **Decisão**: [ADR 0120](../decisions/0120-encrypted-persistence-of-lore-checkpoints.md).

## Objetivo e funcionalidades entregues

Checkpoint/controles agora podem ser gravados e recuperados pelo journal
cifrado. Reload reconstrói o coordenador a partir do armazenamento, com
pedidos/cursores preservados e nenhum RPC ao restaurar. Persistência é chamada
explícita; fluxo visual existente ainda não a usa automaticamente.

Captura privada/imutável agrega root, páginas até 50 e acks locais opcionais.
Validação fechada confere identidade, digest, progressos, fases e cursores;
a reconstrução verifica também o input/codecs originais. Checkpoint não é
autorização ou recibo nativo. JSON de escrita é produzido em partes até 64 KiB,
com SHA no manifesto cifrado e AAD da seção checkpoint.

Gerações active/pending/garbage preservam a última cópia consistente durante
falha. Cada parte+contador confirma em oncomplete. Commit final troca active
e confirma unidades explicitamente indicadas de modo atômico. Se só esse
commit faltou, leitura verifica/promove a cópia completa com chave fresca.
Retry parcial só aceita o mesmo bundle; corrupção/divergência ficam preservadas.

Coleta da geração substituída é limitada a 50 frames por transação, com cursor
e CAS, sem depender da chave ou atingir draft/pedido/active/pending/chave.
Header antigo é lido sem checkpoint, sem upgrade de versão do banco.
Restauração reautoriza após awaits, confere stamp/contexto e aplica cancel
monotônico do journal. Ready continua exigindo apply explícito.

## Critérios de aceite

- [x] Captura/root/páginas/acks fechados e privados.
- [x] Partes cifradas, manifesto privado, identidade/AAD e ausência de teto novo.
- [x] Geração independente, active anterior preservado e CAS/oncomplete.
- [x] Promoção e acks atômicos, retomada da falha final e recusa de divergência.
- [x] Coleta limitada da geração substituída, sem chave e sem apagar draft.
- [x] Restore somente do storage protegido, com reautorização/cancel/contexto.
- [x] Testes dirigidos, IndexedDB/Chromium reais, revisão e documentação.
- [ ] Write-ahead/acks automáticos e mapa completo de jobs metadata sem chave.
- [ ] Reserva/host, fechamento/coleta nativa e ciclo de vida integrados.
- [ ] Validate/certificação de P1/F2-09/V2.

## Arquivos alterados

Novo bundle e adaptador de checkpoint na feature lore; integração no journal,
header e barrel, teste novo e documentação. A nova seção reutiliza os helpers
crypto/IDB sem mudar algoritmo, stores ou versão do banco. Sem dependências,
Functions, Rules, interface ou produtores nativos alterados.

## Testes e resultados

**50 casos Vitest distintos positivos em rodadas**: 19 novos de checkpoint
persistido, 17 existentes do journal e 14 da sessão da chave. Não somar
retakes como casos novos. Primeira rodada teve 14/15 positivos; um teste
acessava o nome incorreto da chave do harness, corrigido sem mudar produção.

Rodada de regressão: 47/47 em 5.42 s (16 novos naquele ponto e 31 existentes).
Revisão acrescentou guarda contra reconstrução obsoleta, exclusividade até
commit final e recusa de terminal incoerente. Rodada final do arquivo novo:
**19/19 em 5.52 s**. Caso dirigido de exclusividade teve 1 positivo e 17
filtrados; não é uma execução de todos os casos daquela rodada.

Exercitados ciphertext-only/literalidade, reconstrução entre unidades reais,
adoção única, append privado multipart com resposta perdida/replay, prefixo
parcial e bundle divergente, promoção após abort, acks corretos/incorretos,
oncomplete/CAS/aba antiga, corrupção, grant revogado antes/fim do decrypt,
cancel monotônico, header legado, schema/extras e coleta sem chave.
Harness simula eventos/transações IndexedDB; WebCrypto é real.

Capacidade usa **55 mil controles sintéticos**, bundle acima de 8 MiB e 128
frames, 1100 páginas. Abre/decripta uma nova cópia e prova coleta de exatamente
50 frames por passo. Isso testa armazenamento/codec, não um preparo nativo
válido de 55 mil uploads; restauração semântica continua exigindo input real.

**Dois cenários Chromium reais positivos no código final**:

1. Rascunho, wire e checkpoint no IDB cifrado: reload recupera append aceito
   com resposta perdida e repete exatamente. Outro reload após inicialização
   conserva cursor, ready não adota e apply explícito avança um clock.
   Terminal aplicado também é restaurado sem envio.
2. Abort real da transação de promoção mantém active anterior e unidade
   não confirmada. Após reload, leitura valida/promove staging completa,
   confirma a unidade no mesmo commit e marca geração antiga para coleta.
   Perder origem bloqueia leitura, mas coleta local sem chave preserva draft.

Root/páginas não são transportados na memória externa do harness entre
reloads nesta rodada: apenas identidade é devolvida. Todos os dados necessários
são obtidos do IDB pelo produto. Serviços reais rodam sobre double transacional;
Auth/provedor de chave são fixtures. Não certifica login/App Check reais,
Rules ou interface. Logs/perfis preservados fora do Git.

## Validações e revisão

Lint/tipos/build/smoke/arquitetura dirigidos positivos; docs/formato/diff e scan
no fechamento. Build mantém avisos de bundle grande e imports dinâmicos também
estáticos. Primeiros tipos apontaram nullable no cursor de coleta, corrigido
com acesso opcional. Lint apontou dois callbacks sem this:void, corrigidos no
contrato do adaptador.

O primeiro harness Chromium tentou salvar antes de coletar a geração antiga,
e foi corrigido para cumprir o protocolo documentado; cenários finais passaram.
Revisão conservou exclusividade até o fim da promoção, rechecagem após leitura,
stamp na reconstrução e invariantes de fase antes da troca. Não mudou native
CAS, crédito ou permissões.

Sem backend/Rules alterados, não repetimos SDK Firestore/suite Functions.
Suite completa/cobertura/npm run validate no fechamento de P1, conforme
autorizado. Sem CI/push/PR/merge/deploy ou integração na master.

## Limitações e próxima entrega

Ainda é necessário compor write-ahead antes de cada envio e acks depois da
validação, com mapa completo de controles metadata para cleanup sem chave,
reserva/sessão/host e fechamento antes de descarte. A coleta descrita aqui
é só de cópias locais substituídas, não dos jobs nativos.

Captura/digest fazem trabalho proporcional à metadata; leitura mantém JSON em
memória. Geração parcial divergente não é descartada automaticamente: retry
exige a captura original. Nova cópia diferente aguarda coleta da antiga.
O consumidor é responsável por confirmar somente respostas já validadas.

Ciclo de vida da chave na exclusão e demais writers/consumidores/backup/
ativação/rollout, P1/F2-09/V2, fases 3–5 e condições humanas/comerciais seguem
abertos. Não há tela nova ou autosave de coordenador habilitado ao usuário.
