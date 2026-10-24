# Writer V2 — Chave protegida da recuperação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano de origem**: [102 / M38c5d](../tasks/writer-v2/execucao/102-reserva-e-chave-da-recuperacao-do-lore.md).
- **Decisão**: [ADR 0117](../decisions/0117-private-lore-edit-recovery-keys.md).

## Objetivo e funcionalidades entregues

Preparar a recuperação cifrada aprovada pelo operador, com chave liberada
somente após revalidar a mesma ficha original autorizada. Esta entrega é
servidor: ainda não guarda rascunho no navegador nem implementa retomada/UI.

Reserva fixa UID/writeId/intenção/CAS e encarnações nativas. Raiz, prova e
chave de 32 bytes nascem juntos. Metadata confirma evento sem conteúdo;
chave exige token/provas/nascimento/fingerprint originais e autorização atual.

Revisão posterior da mesma ficha não impede recuperar o rascunho, mas o CAS
original não é atualizado. Exclusão/recriação, deleting/tombstone/marcador
deletedBooks e mudança de dono bloqueiam a chave. Chave ausente/alterada/
recriada nunca é regenerada. Revogação cria prova permanente e remove somente
a chave original; revogar antes de reservar cria fence.

Chave usa HTTP autenticado com App Check, no-store em todas as respostas,
body UTF-8 de até 8 KiB e erros sanitizados. Três callables devolvem somente
metadata; Hosting tem rewrite anterior à SPA. Rules negam todo o namespace.

## Critérios de aceite

- [x] Reserva por intenção imutável e CAS inicial autorizado.
- [x] Nascimento conjunto de raiz/prova/chave e fingerprint privado.
- [x] Metadata sem segredo e key somente por HTTP.
- [x] Reautorização da origem precisa sem rebase do CAS.
- [x] Revogação permanente, fence e preservação de recriações.
- [x] Fonte, clock e créditos intactos; rollback real do último write.
- [x] Auth/App Check, limites/no-store/sanitização e rewrite.
- [x] Rules/SDK nativos, revisão e documentação dirigidas.
- [ ] Journal cifrado, checkpoints/retomada e host visual.
- [ ] Ciclo de vida integrado/rollout e validate de P1/F2-09/V2.

## Arquivos alterados

bookLoreWriteRecoveryContracts define intenção, paths e metadata;
bookLoreWriteRecovery reserva/verifica/revoga; bookLoreWriteRecoveryHttp
autentica e libera a chave. Index, firebase.json e Rules compõem endpoints
e isolamento. Fixture compartilhada, Node/HTTP/SDK novos e entry atualizado.
Plano/ADR, AGENTS, README, arquitetura/testing e registro acompanham o contrato.
Sem dependências, cliente/TS/UI ou produtores de bytes alterados.

## Testes

**37 casos Node distintos positivos**, em rodadas: 30 do serviço, seis HTTP
e um do entry. Primeira rodada do serviço teve 28/28 positivos; revisão
adicionou recusa inicial de dono/CAS e fingerprint adulterado. Rodada final:

```text
tests 30
pass 30
fail 0
duration_ms 366.5277
```

Os sete HTTP/entry passaram em 1916.243 ms. Serviço usa double transacional
com timestamps nativos simulados; não confundir o título dos casos com SDK
real. Inline/v1/v2/criação, retry sem nova chave, intenção/UID/token, onze
mudanças de origem, provas/chave recriadas, órfãos, fence, corrupção, remoção
autorizada e falha final de criação/exclusão foram exercitados.

HTTP confere os dois verificadores, método, content-type, UTF-8, limite,
argumentos fechados e erros sem eco de dados. onRequest real em loopback
confirma JSON/no-store/status; verificadores são fixtures, não tokens reais.
Entry confirma a função da chave como HTTP, não callable, sem segredo/rede.
Um aviso de lint por newline na chamada do harness foi resolvido pela formatação.

**Três casos SDK nativos positivos**, 10637.01 ms, emulador 1.22.0 com SHA
verificado, projeto demo, porta exclusiva em loopback e limites de memória:

```text
tests 3
pass 3
fail 0
duration_ms 10637.01
```

Reserva concorrente confirma uma chave e nascimento conjunto. Owner/terceiro/
anônimo não leem, gravam ou excluem os cinco controles privados; leitura
inline autorizada permanece positiva. Denies PERMISSION_DENIED são esperados.
Fonte/clock/créditos ficam intactos. Revisão posterior permite key, recriação
da origem não; chave recriada é preservada. Falhas do último write nativo
rollbackam reserva e revogação integralmente, e retry conserva chave exata.

## Validações executadas

Lint dirigido e arquitetura positivos; sintaxe dos 248 módulos Functions
positiva. Docs/formato/diff e varredura de segredos no fechamento.
Logs do Node/HTTP/SDK e emulador fora do Git; runner encerrou seus processos.

Sem UI/TS novos, não repetimos Vitest, tipos, build ou Chromium. Suite completa,
cobertura e npm run validate ficam no fechamento de P1, conforme autorizado.
Sem CI/push/PR/merge/deploy.

## Revisão, limitações e próximo passo

Revisão conferiu UID sem alegação do body, intenção/CAS inicial, nascimento/
imutabilidade/hash, chave única sem regeneração, autorização por encarnação,
fences e não remoção de chave estrangeira. Leituras irmãs são aguardadas
antes da rejeição; writes/provas/remoção são atômicos.

O servidor não guarda prosa. Chave retida após perder a origem não é liberada;
sua remoção física exige revogação explícita. Não se alega coleta por exclusão
do livro. A auditoria de ciclo de vida integrado permanece necessária antes
de habilitar o produto. Revogar a chave não cancela filhos, confirma adoção
ou autoriza apagar os controles incertos no dispositivo.

Próximo: journal por partes com ciphertext e AAD, sem chave persistida,
checkpoints/reconstrução do coordenador e CAS/Web Locks/IDB, depois host
visual. Host deve aguardar oncomplete antes de produzir bytes e preservar
controles mesmo sem conseguir abrir a cópia. A decisão de produto aprova
essa proteção, não uma implementação ainda ausente.

Demais writers/consumidores/backup/ativação e certificação de P1/F2-09/V2,
fases 3–5 e condições humanas/comerciais continuam abertos.

## Como conferir

Executar bookLoreWriteRecovery.test.mjs e bookLoreWriteRecoveryHttp.test.mjs
com Node em functions/test; bookLoreWriteRecovery.rules.test.mjs exige emulador
demo dedicado em FIRESTORE_EMULATOR_HOST loopback. Não usa dados de produção.
Dev server permanece em http://127.0.0.1:5173/.
