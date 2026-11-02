# Writer V2 — Reserva descobrível da edição de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [108 / M38c5j](../tasks/writer-v2/execucao/108-reserva-descobrivel-e-encerramento-da-edicao-de-lore.md).
- **Decisão**: [ADR 0123](../decisions/0123-discoverable-lore-recovery-reservations.md).

## Objetivo e funcionalidades entregues

Reserva nativa, chave/journal e coordenador persistido estão compostos numa API
da sessão Auth. manual/resumeManual/preparations criam/retomam handles e listam
operações por conta. Criar handle não faz I/O; initialize confirma a reserva e
a cópia, advance dirige unidades, apply permanece explícito. O formulário
existente ainda não usa esta API; não foi habilitado rollout.

Ticket metadata durável precede reserve. Resposta perdida/ACK local abortado
continuam descobríveis e repetem a intenção/hash originais. Quando há reserva
confirmada, retry de nascimento/associação do journal não reserva outra vez.
Conta/contexto/stamp são verificados em todo I/O; replies tardios respeitam a
identidade já confirmada pelo fechamento concorrente.

IDB v2 adiciona preparations sem apagar heads/frames ou recriptar cópias v1.
Contrato fechado não guarda prosa, manifesto, base64, chave, Auth/App Check
ou erros livres. Paginação por UID até 50, CAS/Web Locks/oncomplete e estados
monotônicos preservam pedidos e provas. Downgrade falha sem apagar dados.

Antes do primeiro draft completo, input permanece no handle; recarga informa
requiresInput/awaiting-draft e oferece controles de encerramento, sem inventar
texto. Draft completo retoma por autorização fresca. Snapshot só metadata.

cancel fecha jobs e preserva a chave e o rascunho recuperável. releaseRecovery
é intenção explícita separada: fecha os jobs antes de revogar a chave, com
pedido/ACK duráveis e no máximo um RPC por passo. Não espera reserve, produtor
ou chave pendentes. Cancel comum não apaga a possibilidade de recuperar texto.
Adoção vencedora preserva corpos ativos; chave indisponível não prova cleanup.

Nenhuma cópia local é apagada. canDiscard exige fechamento confirmado e prova
de revogação; a purga local com fence de escritas antigas é o próximo trabalho.

## Critérios de aceite

- [x] Ticket antes do primeiro RPC e resposta validada antes de journal/produtor.
- [x] Reserva/ACK perdidos, identidade/CAS imutáveis e descoberta por conta.
- [x] Upgrade aditivo v1 → v2 com ciphertext e leitura antiga preservados.
- [x] Bootstrap da sessão com UID capturado e sem I/O na criação do handle.
- [x] Retomada privada autorizada, sem texto inventado quando ainda não salvo.
- [x] Cancel conserva chave; liberação explícita fecha jobs antes de revogar.
- [x] Cancel/release independentes de waits e pedido de revoke exato no retry.
- [x] Adoção vencedora, conta/signal/aba/corrupção e metadados protegidos.
- [x] Testes dirigidos, Chromium real, revisão e documentação.
- [ ] Host visual, purga local e ciclo da chave na exclusão do livro.
- [ ] Writers/Rules/drenagem/consumidores/ativação/rollout e validate de P1.

## Arquivos alterados

Novos contratos e operação manual; DB v2/store preparations, sessão Auth/
barrel e cancel síncrono do controller integrados. Harness ganha inventário
de stores; testes de operação e SDK boundary acrescentados. Plano, ADR,
arquitetura/testes/índices/README/AGENTS atualizados.
Sem backend, Rules, dependências ou componentes de interface.

## Testes e validações

**208 Vitest distintos positivos em rodadas**: 38 novos da operação manual,
nove novos da sessão, 43 do controller persistido e 118 regressões de
sessão/journal/chave/checkpoint/controles. São 47 casos novos; retakes não somam casos.

- Regressões iniciais sessão/journal/chave: 57/57 em 2.05 s.
- Nova operação: 19/20 na primeira rodada. Corrigida expectativa do teste
  para erro síncrono de conta; depois 21/21 em 5.60 s.
- Nova operação ampliada: 33/33 em 7.95 s.
- Operação/sessão/controller: 85/85 em 28.25 s.
- Rodada final dos dois arquivos novos: **47/47 em 9.85 s**.
- Regressões finais de checkpoint/controles: **61/61 em 7.03 s**.
- Typecheck e build passaram, incluindo bundle/smoke. Permanecem avisos
  existentes de chunks grandes e imports dinâmicos ineficazes.
- Lint dirigido passou após retirar dois casts desnecessários em código/fixture.
- Checks de arquitetura/documentação, formatação e diff final: passaram.
- Sem suíte integral/coverage, backend, Rules ou E2E da aplicação completa.
  Validate integral no fechamento de P1.

Serviços servidor e WebCrypto são reais sobre double transacional.
Harness de IDB simula eventos/CAS; mocks SDK da sessão provam somente
UID/guard/region/payload/delegação. Não equivalem à rede Auth/App Check real.

**Três cenários Chromium positivos no código final**:

1. Banco v1 real com draft cifrado: upgrade v2 conserva nonce/ciphertext,
   recupera literal com chave reautorizada e recusa downgrade por VersionError.
2. Reserve aceito com resposta perdida: fechar/reabrir processo conserva
   ticket, repete exatamente metadata, informa falta de draft sem obter chave/
   produzir e permite liberação explícita.
3. Append aceito sem resposta e origem revogada: cancel entre reloads não
   pede chave nem decripta, conserva recuperação. Restaurado o acesso à mesma
   origem, readDraft recupera Unicode/BOM/CRLF; somente releaseRecovery apaga
   a chave depois de confirmar os jobs.

Harness leve da mesma origem com IDB/Web Locks/WebCrypto reais e serviços
reais sobre double/Auth fixa. Primeiro ensaio omitiu options no seed de
serialização e foi corrigido; segundo esperava um getKey no readDraft,
mas o contrato exige dois (antes/depois). Corrigida a expectativa do harness.
Retake final: 3/3, sem relaxar o produto.

Artefatos fora do Git em writer-v2-portability-qa:
m38c5j-browser-bootstrap.mjs, m38c5j-browser-result-final.txt e perfis por execução.
Nenhum ensaio comprova UI completa, SDK/App Check nativos ou produção.

## Revisão, limitações e pendências

Revisão de escopo, autorização/CAS antes/depois de await, lanes independentes,
metadados fechados e ordem cleanup/revoke concluída. Associação do controller
após falha transitória, pin da resposta tardia e wire imutável foram reforçados
e cobertos. Cancel preserva chave; liberação rejeitada por busy não fica latente.

Host visual e purga local vêm a seguir, incluindo fence de uma escrita privada
ainda em voo. Exclusão integrada da chave no livro, writers Admin/Rules,
drenagem das versões antigas, demais consumidores/backup/ativação/rollout,
P1/F2-09/V2, fases 3–5 e condições humanas/comerciais continuam pendentes.
Sem CI/push/PR/merge/deploy.

## Como verificar

Executar os dois arquivos novos e os testes afetados do journal/controller,
ou o harness Chromium com dev server em 127.0.0.1:5173. O formulário atual
permanece no fluxo anterior. No futuro host, conservar o handle após erro,
listar preparações da conta, recuperar texto só após autorização da origem
e pedir liberação explicitamente antes de qualquer purga.
