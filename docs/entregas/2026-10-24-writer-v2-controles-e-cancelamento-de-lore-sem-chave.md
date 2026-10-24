# Writer V2 — Controles e cancelamento de lore sem chave

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [106 / M38c5h](../tasks/writer-v2/execucao/106-controles-e-cancelamento-de-lore-sem-chave.md).
- **Decisão**: [ADR 0121](../decisions/0121-keyless-cleanup-of-manual-lore-edits.md).

## Objetivo e funcionalidades entregues

Conta original pode fechar jobs conhecidos após recarga/revogação da origem,
sem pedir chave ou decriptar. Mapa persistido contém controles operacionais;
draft, checkpoint, produtor incerto, chave e recibos são preservados.
Adoção própria que venceu o cancelamento é reconhecida como applied.

Captura fechada fixa identidade/intenção e uploads em páginas até 50, com
digest, IDs/hashes determinísticos e pai já conhecido ou start incerto legado.
Página/lookups/contador são confirmados juntos em oncomplete/CAS. Mapa parcial
não produz nem inicia cleanup; retry divergente é recusado. Header antigo
continua sem mapa, sem inventar metadados. Captura congela antes de await.

Quando há mapa, j.send exige ready/worker idle/cancel falso e controla todos
os IDs/hashes. Registro de pai precede start; suas referências de inspeção e
uploads, inclusive reserva de slot, devem pertencer ao mapa.
Lookup corrupto ou referência externa é recusado antes de RPC.
O futuro host deve sempre inicializar mapa antes de novos envios.

Worker salva pedido metadata exato antes de cada chamada e faz no máximo um
RPC por avanço. Consulta pai antes de filhos; ausência leva a fence, conflito
mantém cancel original e consulta status. Fecha pai/uploads/inspeção ou confirma
adoção própria sem destruir corpos ativos. Signal abortado não impede cleanup;
conta/contexto continuam obrigatórios.

Ledger metadata do worker permite consultas frescas sem reabrir confirmação de
produtores. Pendências cleanup/diagnostic legadas conhecidas são reconciliadas
exatamente, mesmo fora do cursor, com ACK/progresso atômicos. Desconhecidas
ficam preservadas e recusadas. Resposta perdida, falha de ACK, aba antiga,
bloqueio e resposta inválida não apagam pedidos.

bookLoreEditSession.cleanup confere UID do journal e usa Auth/guard e transporte
regional existentes. Nenhum token Auth/App Check ou chave é persistido. Tokens
de jobs, hashes e recibos são metadata operacional, sem grant de conteúdo.

## Critérios de aceite

- [x] Mapa fechado e paginado, com ready e commits atômicos.
- [x] Lookup limitado e separação entre metadata e ciphertext.
- [x] Registro de pai e vínculos completos antes de envio pelo mapa.
- [x] Cleanup por passo, com pedido durável e independente de chave/signal.
- [x] Fences, reconciliação de cancel e adoção própria preservados.
- [x] Replay exato, ACK atômico e legado conhecido sem sobrescrita.
- [x] Conta/contexto, segredo/prosa, recibos e dados próprios preservados.
- [x] Testes dirigidos, navegador real, revisão e documentação.
- [ ] Write-ahead/acks automáticos e composição de reserva/sessão/host.
- [ ] Descarte/ciclo de vida integrado, rollout e validate de P1/F2-09/V2.

## Arquivos alterados

Novos contratos, mapa e worker de controles em lore; journal/header/IDB,
sessão e barrel integrados. Record metadata tem tipo/namespace separado de
frames cifrados; mesma versão/stores do banco. Novo teste de controles,
cinco casos de sessão e documentação. Sem backend, Rules, dependências ou UI.

## Testes e resultados

**114 Vitest distintos positivos em rodadas**: 42 novos de controles/cleanup,
22 da sessão (cinco novos) e 50 regressões do journal/sessão da chave/checkpoint.
São 47 casos novos; retakes não são casos extras.

- Rodada inicial: 24/25 positivos. Get de pai ainda ausente retorna null;
  suporte à ausência foi corrigido para gerar fence. Não foi relaxada validação.
- Rodada controles/sessão: 58/58 em 14.29 s, com 36 controles naquele ponto.
- Regressões do journal/proteção/checkpoint: 50/50 em 5.81 s.
- Rodada final do arquivo novo: **42/42 em 6.14 s**.
- Casos dirigidos posteriores/isolados de congelamento e divergência têm
  demais casos filtrados; não contam como nova execução de toda a suite.

Cobertura de comportamento: cancel em nove etapas com origem revogada e
reabertura por passo; perda de resposta em seis classes metadata; 53 uploads
reais do plano por duas páginas, com fence de filhos não iniciados; adoção
vencedora; append aceito/delayed start ainda em voo; ausência de pai;
conflito/get/retry; partial/ready/digest/escopo; backfill conhecido/incerto;
signal/conta/CAS; ACK abortado; replay legado fora do cursor; diagnóstico;
progressos e bloqueios inválidos; registro tardio e dependências fora do mapa.

WebCrypto e serviços servidor são reais sobre double transacional; harness
de IDB simula eventos/atomicidade. Sessão TS usa journal/SDK mocks para conferir
somente UID/guard/delegação, sem confundir isso com SDK nativo.

**Dois cenários Chromium positivos no código final**, em página leve da mesma
origem, com IDB/Web Locks reais e serviços reais sobre double/Auth fictícia:

1. Três uploads registrados, append aceito com resposta perdida e origem
   revogada. Draft é recusado antes de decrypt. Após reloads, worker repete
   exatamente cancel cuja resposta se perdeu e fecha os três uploads e
   inspeção, sem novo getKey/decrypt/replay de produção. Draft cifrado e produtor
   incerto permanecem; dados físicos, fonte, clock e créditos são preservados.
2. Apply aceito com resposta perdida e origem revogada. Após reload, somente
   get metadata confirma adoção própria; corpos ativos, recibos e registros
   servidor ficam intactos. Reabrir terminal não envia novo RPC.

No primeiro ensaio, navegação pela aplicação completa falhou com
ERR_INSUFFICIENT_RESOURCES. Servidor respondeu 200; o contexto de teste foi
encerrado. Harness passou a servir página mínima na mesma origem e remover
navegação duplicada por passo. Isso isola a prova de storage/RPC, sem alterar
produto ou declarar UI validada. Perfis/logs preservados fora do Git.
Não certifica Auth/App Check reais ou Rules; não houve implantação.

## Validações e revisão

Lint, tipos/build/smoke e arquitetura dirigidos positivos; docs/formato/diff/
segredos no fechamento. Build mantém avisos de bundle grande e imports
dinâmicos também estáticos. Sem novas dependências ou mudanças de permissões.

Revisão acrescentou congelamento anterior ao await e conferência de todas as
dependências do pai/slot no mapa. Teste de divergência recalcula um digest
válido para provar recusa da captura diferente após prefixo parcial.
A falha inicial de null foi corrigida no protocolo e o produtor pendente do
teste é sempre liberado em finally. Não houve redução de limites de cobertura.

Sem backend/Rules alterados, não repetimos SDK Firestore/suite Functions.
Suite completa/cobertura/npm run validate ficam no fechamento de P1, conforme
autorizado. Sem CI/push/PR/merge/deploy ou integração na master.

## Limitações e próxima entrega

Mapa deve preceder produção no futuro host. API interna legada sem mapa
continua sem promessa de recuperação completa; não foi habilitada em interface.
Captura percorre metadata em memória; gravação e consulta usam unidades limitadas.

Ainda falta compor write-ahead/acks automáticos com reserva/journal/coordenador/
sessão/host e fechar operação antes de oferecer descarte. Cleanup nativo,
coleta de cópias locais e revogação da chave não são intercambiáveis.
Ciclo de vida da chave na exclusão, demais writers/consumidores/backup/
ativação/rollout e P1/F2-09/V2, fases 3–5 e condições humanas/comerciais
continuam abertos. Não há tela nova ou edição recuperável habilitada ao usuário.
