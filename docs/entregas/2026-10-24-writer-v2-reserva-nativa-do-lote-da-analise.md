# Writer V2 — Reserva nativa do lote da análise

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [96 / A2b1](../tasks/writer-v2/execucao/96-reserva-nativa-do-lote-da-analise.md).
- **Decisão**: [ADR 0111](../decisions/0111-native-lore-analysis-application-reservation.md).

## Objetivo e implementação

Registrar todos os alvos e IDs dos filhos antes de habilitar a preparação dos
bytes. Serviço interno reutiliza o contexto lógico e validadores da análise,
confere ticket ready, fonte/revisão/texto e destinos na mesma transação.

Contexto imutável fixa análise nativa, provedor, livro/capítulo/universo e seus
nascimentos observados, hashes e expiração. Manifesto tem 1..50 alvos locais/
globais/novos, origem dos existentes e hash dos patches. IDs dos filhos são
derivados no servidor. Novos locais têm campos padrão privados e relações
explicitamente vazias. Não guarda valores dos patches/prosa, nem cria cabeça,
corpo, clock ou débito.

Estado/evento/prova nascem com o contexto e sustentam get/retry metadata,
inclusive após revogação/expiração. Cancel-before-start é fence permanente.
Cancelamento sem filhos é atômico; filho encontrado é preservado e impede
conclusão até reconciliação. Nenhum novo produtor está habilitado neste passo.

Exclusão do livro descobre e fecha reservas por nascimento/cutoff antes de
limpar edições. Checkpoint e cancelamento confirmam juntos; metadata fica como
fence após remover fontes/raiz. Rules negam acesso SDK a toda a árvore.

## Critérios

- [x] Contexto/validadores compartilhados sem mudar revisão/limites da análise.
- [x] Manifesto completo de 1..50 alvos antes dos produtores.
- [x] Provedor, origens nativas, IDs e hashes fixados; somente metadata.
- [x] Token/provas/retry, cancel-before-start e cancelamento sem filhos.
- [x] Filho desconhecido não é presumido seguro nem removido.
- [x] Descoberta e fechamento pela exclusão do livro.
- [x] Testes dirigidos, revisão e documentação.
- [ ] A2b2: produtores, bindings e cleanup dos filhos na transação do pai.
- [ ] A2c: aplicação real com crédito/recibo e demais integrações de P1.

## Arquivos

Novos loreAnalysisContext/Fields e Application/Contracts/Store/Deletion.
Composição em loreAnalysis, descoberta/fase em bookLoreDeletion/Store, regra
SDK explícita, helper e testes Node/SDK. Plano, ADR e documentação atualizados.

## Validação local dirigida

- Rodada de integração **218/218 Node**, 6919.2265 ms: 37 novos e 181 de
  regressão de análise/leitura lógica, exclusão/criação/retirada e adoção em lote.
- Após fechar provedor/relações/IDs qualificados, repetimos só a reserva:
  **39/39 Node**, 1312.7502 ms. Total de **220 casos Node distintos positivos**.
  BYOK com saldo zero, IDs qualificados longos e ausência de bytes/débito
  estão cobertos.
- Primeira execução nova detectou diferença entre hash de texto bruto e hash
  JSON histórico. A reserva foi corrigida; casos de sucesso/negativos e
  regressões passaram, sem alterar a fórmula existente.
- SDK: **três casos distintos positivos** no emulador Firestore 1.22.0
  verificado por SHA, projeto demo/loopback. Primeira rodada 3/3,
  30413.9631 ms. A rodada final do schema confirmou 50 alvos concorrentes,
  Rules e exclusão (18241.6118 ms) e fence/prova recriada (1244.6557 ms).
- A conferência final foi interrompida no terceiro caso por falta de memória
  nativa da máquina: V8 e JVM registraram OOM. Processos terminaram; diagnósticos
  foram preservados fora do Git. Somente o terceiro foi repetido, com Java
  256 MiB/dois CPUs e Node 384 MiB: **1/1**, 4862.6753 ms. Confirma rollback
  nativo do último write, retry exato e cancelamento após revogação.
- Lint dirigido, arquitetura e sintaxe dos **233 módulos** positivos.
- Docs, formato e diff: positivos após redação final.

Saldo/gerador são fixtures. Nenhuma IA paga, produção ou dado real. Logs e
diagnósticos locais permanecem fora do repositório.

## Revisão, limitações e próximo passo

Revisão conferiu fórmula histórica de revisão/texto, referências qualificadas,
manifesto sem prosa, provas nativas, transações sem leituras após writes,
cancelamento após revogação e fechamento acoplado ao checkpoint.

A2b1 não cria bytes de preparo: A2b2 deve validar o pai por unidade, ligar
filhos/checkpoints nativamente, retomar e cancelar/limpar todos os filhos.
Até isso existir, qualquer filho encontrado impede cancelamento/exclusão
desta reserva, preservando os dados. Não inferir cleanup ou prontidão de
metadata. Replay não é grant de origem.

A2c continua obrigatório para aplicação única local/global/nova com débito/
recibo reais. applyLoreAnalysis ainda recusa payload. Demais writers/leitores,
backup/cliente/rollout e certificação de P1/F2-09/V2 permanecem pendentes.

Sem UI/TS novos, não repetimos tipos/Vitest/build/browser. Validate/cobertura
integrais no fechamento de P1, conforme autorizado. Sem CI, push, PR, merge
ou deploy; condições humanas/comerciais abertas.

## Como conferir

Executar functions/test/loreAnalysisApplication.test.mjs. SDK em
tests/firestore/loreAnalysisApplication.rules.test.mjs exige demo/loopback.
Dev server permanece em http://127.0.0.1:5173/, sem implantar estas Functions.
