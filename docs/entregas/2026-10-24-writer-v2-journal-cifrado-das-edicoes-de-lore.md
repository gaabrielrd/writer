# Writer V2 — Journal cifrado das edições de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [103 / M38c5e](../tasks/writer-v2/execucao/103-journal-cifrado-das-edicoes-de-lore.md).
- **Decisão**: [ADR 0118](../decisions/0118-partitioned-local-lore-edit-journal.md).

## Objetivo e funcionalidades entregues

Persistência cifrada do rascunho literal e pedido manual exato no dispositivo,
pela política aprovada pelo operador. Recuperação reautoriza a mesma origem
e conserva CAS/intenção originais. Não envia automaticamente ao abrir.

Serializer existente grava JSON por partes até 64 KiB sem teto de 8 MiB/128
partes. AES-GCM vincula identidade/seção/geração/índice em AAD; manifesto com
SHA fica cifrado. Chave é importada não extraível por HTTP autenticado e nunca
armazenada. Headers guardam somente metadata operacional.

IndexedDB confirma frames e checkpoint atomicamente no oncomplete.
Web Locks e stamp CAS recusam aba antiga. Falha parcial preserva dados;
todas as partes presentes com falha no último commit podem ser validadas e
seladas localmente após recarga, sem precisar do input anterior em memória.

Wire fechado/congelado é protegido antes de HTTP e pode ser repetido
exatamente após resposta perdida. Cleanup/diagnóstico metadata não dependem
da chave, com slots separados. Cancelamento local bloqueia produção; não é
cancelamento nativo. Confirmação local exige chamada explícita do consumidor
depois de validar resposta. Descoberta por conta é paginada e não decripta.

## Critérios de aceite

- [x] Identidade fechada e sessão ligada à conta/contexto.
- [x] Chave fresca, fingerprint e importação não extraível, sem persistência.
- [x] Literalidade e cifragem por partes com manifesto privado.
- [x] Atomicidade local, recarga, concorrência e preservação de corrupção.
- [x] Pedido exato persistido antes de envio e replay após resposta perdida.
- [x] Consulta/cleanup metadata sem chave e cancelamento monotônico.
- [x] Recuperação de gravação completa cujo último selo local falhou.
- [x] Testes dirigidos, Chromium, revisão, tipos/lint/build e documentação.
- [ ] Checkpoints/reconstrução do coordenador completo e host visual.
- [ ] Ciclo de vida integrado e validate de P1/F2-09/V2.

## Arquivos alterados

Contratos, crypto, IndexedDB, journal e sessão na feature lore; quatro arquivos
de testes/harness. Serializer do codec tem nome interno exportado para reuso,
sem mudar bytes/hash; barrel expõe somente sessão/discovery e tipos.
Plano/ADR, README, AGENTS, arquitetura/testing e execução acompanham o contrato.
Sem dependências, Functions, Rules ou interface alteradas.

## Testes e resultados

**51 casos Vitest distintos positivos** em rodadas dirigidas:

- 17 journal: literalidade, ciphertext-only, grants frescos, abas, perda de
  resposta/replay, confirmação, recusa de corpo diferente/pendência incerta,
  cleanup/diagnóstico sem chave, troca de conta, oncomplete/abort, prefixo
  parcial, corrupção/AAD, descoberta isolada/paginada, wire/credenciais,
  congelamento/intenção, ausência de APIs, revogação durante decrypt e os
  dois casos de último commit de selagem abortado.
- 14 sessão: HTTP/Auth/App Check, identidade/fingerprint/base64/phase,
  conta/contexto tardios, descoberta sem chave, falhas e JSON inválido sem
  eco de conteúdo. Adaptador do journal é mock neste arquivo.
- Seis crypto/serializer: WebCrypto e SHA independentes, AAD, grant, partes
  limitadas, tamanho e congelamento.
- 14 codec existentes, regressão da exportação do serializer sem mudar formato.

Rodada final afetada journal+sessão: **31/31**, 1.02 s. Rodadas anteriores
crypto+sessão: 20/20, 1.51 s; sessão+codec: 28/28, 2.37 s.
Não somar rodadas como casos novos. Harness de eventos simula transações
IndexedDB/Web Locks; não é prova de SDK nativo.

**Quatro cenários Chromium reais positivos** no código final:

1. Rascunho acima de 9 MiB/>128 partes, com literalidade e aliases vazios/
   duplicados, sobrevive reinício do processo do navegador e usa nova chave.
2. Append nativo aceito com resposta perdida, recarga e replay exato sem
   avançar índice duas vezes; perder origem impede decrypt, mas controles
   permitem cancelar/limpar o upload e encerrar a inspeção sem chave.
3. Duas abas reais: takeover/CAS recusa aba antiga; corrupção de nonce é
   recusada sem apagar registro; outra conta não descobre seus headers.
4. Abort real da transação final de header: frames completos permanecem;
   após reload, recuperar/selar conserva texto literal sem input antigo ou RPC.

Chromium usa IndexedDB/Web Locks reais e serviços de leitura/edição/recuperação
reais sobre double transacional. Auth é identidade fixa; o provedor de chave
do harness é injetado. Não certifica login/App Check reais, UI, Rules ou
reconstrução do coordenador inteiro. Perfis/logs ficam fora do Git e preservados.

## Validações e revisão

Lint dirigido, tipos/build/smoke e arquitetura positivos. Docs/formato/diff e
scan de segredos no fechamento. Primeira checagem TS apontou 21 erros de
narrowing do helper never; declaração de função corrigiu a causa. Lint apontou
um reject de unknown, corrigido para Error. Build mantém os avisos de bundle
acima de 500 kB e imports dinâmicos também estáticos; smoke positivo.
Nenhuma falha de Vitest nestas
rodadas. Revisão acrescentou a reautorização no fim da leitura e a recuperação
do último commit local abortado, ambas verificadas.

A escrita limita partes, mas recuperação precisa manter JSON/texto decodificado
em memória. Dados privados, chaves ou tokens não são gravados em logs/metadata;
fingerprints e IDs operacionais continuam metadata. Não se promete limpeza
física de heap ou proteção contra código malicioso da própria origem.

Não repetimos backend/Rules/SDK Firestore: não houve alteração desses módulos.
Suite completa/cobertura/npm run validate ficam no fechamento de P1, conforme
autorizado. Sem CI, push, PR, merge, deploy ou integração na master.

## Pendências e verificação manual

A API interna permite criar/abrir/listar journal e recuperar rascunho ou
unidade exata; o fluxo visual de edição existente ainda não a usa.
Host deve reservar chave e confirmar draft antes de enviar. Snapshot atual
do coordenador não é checkpoint restaurável; persistir e reidratar cursores,
reservas e controles de todos os jobs é o próximo incremento.

Fechamento nativo antes de descarte e coleta local, integração da revogação
da chave na exclusão do livro, demais writers/consumidores/backup/ativação/
rollout e toda P1/F2-09/V2 continuam pendentes. Fases 3–5 e condições humanas/
comerciais permanecem abertas. Não há editor recuperável anunciado ao usuário.

Para repetir a evidência local, executar os três novos testes Vitest e o teste
do codec; usar o harness Chromium externo para restart/reload/abort/tamper.
Não há tela nova para verificação manual deste incremento.
