# P2 — portabilidade privada de aventuras

Pré-condição: fechamento técnico local de P1 (plano 146), sem confundir gates
operacionais/humanos/comerciais com implementação. Reutilizar contratos comprovados;
não transformar DTO de livro/campanha por cast.

Objetivo integral P2: backup com estado atual e todo histórico; revisão,
restauração em nova cópia privada, IDs próprios, mídia autorizada e recuperação.
Partes/cenas/arquivo/blocos principais e adicionais, audiência/tipo/ordem/imagem,
planejamento/referências, arcos/marcos/cronologia, lore local completo, personas
e progresso/checklist. Sem chat/chave/recibos/grants/publicação/compra.

Descoberta: grafo consultado primeiro sem resultados; indexação fast já falhou.
Arquivos atuais conferidos: studio, scenes/sceneContracts/Jobs, adventureBlocks/
State/Contracts, adventureLore/Contracts, narrativePlanning/Contracts, workProgress/
Ledger/History/Snapshot, editorChatContext/Read, campaignCapture/Engine/Items.
Captura de base de campanha usa somente lore referenciado e não inclui histórico,
personas ou checklist: não é fonte integral de aventura.

Primeiro incremento: inventário executável e fonte metadata autorizada. Não
emitir arquivo falsamente completo nem expor botão de backup antes das famílias
necessárias. Definir contrato próprio versionado, native birth/update, token de
fonte, paginação por id e DTO fechado. Mapear cada writer e seu clock antes de
afirmar captura consistente. Source não consulta universo para copiar lore
global; preserva só origem, com autorização própria antes do selo.

Gap identificado: setAdventurePersonaBinding atualiza raiz OU cena; ajuste da
cena não altera revisão da aventura. Root-only pin é insuficiente. Cada vínculo/
perfil exige identidade nativa/prova própria e verificação final (ou mudança
explicitamente planejada no clock dos writers após auditoria). Não supor que
readCaptureOrigin de campanha fecha esta consistência.

Sequência P2:
1 inventário/contrato e source metadata testado (auth/own/delete/recreate/closedinput).
2 estrutura/cenas/blocos/narrativa/lore e relações por fluxo, cursors e revalidação.
3 história/progresso/checklist/personas/universo/mídia e pacote completo.
4 framer/sink compartilhável só onde independência de domínio demonstrada; manter
compatibilidade binária de .writer livro e identidade de aventura distinta.
5 leitor/validador/índice/revisão, sem efeitos parciais utilizáveis.
6 reserva/upload/preparação/remap/recuperação/cancel/cleanup com inventário antes
de recursos novos; reutilizar primitives sem framework genérico antecipado.
7 ativação atômica e finalização/mídia/arquivo, raiz privada e revisão explícita.
8 interface pública do Estúdio/editor, conta/vida útil, retomada e estados.
9 roundtrip normal e consumidores/exclusão, SDK e navegador; validate no fechamento,
evidência/revisão/commits locais. Depois P3 e D; F2-09 só fecha com todos.

Suposições aprovadas: mundo original religado se ainda autorizado, nunca duplicado;
blocos novos/sem classificação privados; herança de persona por cena; rascunho não
publica/grava manuscrito silenciosamente; todo histórico até exclusão explícita.
Eventual decisão de produto não inferível será perguntada só quando necessária,
continuando trabalho independente. Sem CI/subagentes/remoto/deploy.

## Incremento 147 — fonte autorizada antes do código

Base: 3cf8823, P1 validado e commit local limpo. Este incremento implementa
somente a âncora metadata da raiz/progresso, não um backup completo ou interface.

Arquivos previstos: functions/src/adventureBackupSource.mjs e teste Node próprio;
depois ADR/docs/registro de execução/evidência parcial em commits locais.

Contrato:

- Serviço interno getAdventureBackupSource, sem callable/index/Rule novo.
  Entrada fechada adventureId e expectedSourceToken opcional de 64 hex.
- Autorizar raiz ownerId da conta, existente, schemaVersion 1 e não deleting.
  Ler apenas máscaras metadata ownerId/schemaVersion/deleting e progresso sem
  conteúdo. Fonte própria não depende de acesso ao universo.
- Token liga domínio/versão/UID/ID e createTime/updateTime nativos da raiz e do
  controle workProgress/current (ausência explícita). Não usa updatedAt do dado.
- Saída fechada schemaVersion 1, adventureId e sourceToken. Sem título, prosa,
  origem de importação, persona, segredo, chave, grant ou escrita.
- Repetição sem mudança conserva token. Raiz/controle recriados ou alterados
  invalidam token esperado, inclusive preservando datas lógicas. Conta errada,
  exclusão, schema/metadata inválidos falham sem resposta parcial.
- Essa âncora não certifica cenas, bindings de persona, lore ou histórico inteiro.
  As próximas capturas/provas precisam verificar suas origens separadamente.
  Não copiar readCaptureOrigin, que recusa universo indisponível, nem transformar
  fonte de campanha/livro por cast.

Testes dirigidos: produtor real do Estúdio, autorização/entrada, mesmas fontes,
mudança/ABA da raiz e controle, ausência/presença de progresso, masks/I/O limitado,
universo ausente/revogado sem perda do próprio, metadata inválida e nenhum write.
Executar Node afetado, lint/sintaxe/docs/format/diff. Validate integral somente
no fechamento do próximo bloco P2, conforme orientação do operador; não alegar
que o resultado P1 certifica código posterior.

## Aceites deste incremento

- [x] Fonte fechada, metadata somente e sem dependência do universo.
- [x] Autorização, tokens nativos, mudança/ABA e ausência comprovados.
- [x] Testes dirigidos e checks, revisão/docs/commit locais.
- [x] Demais P2/P3/D e gates mantidos abertos explicitamente.

### Revisão antes de fechar a fonte

Exigir getAll com máscaras no port transacional; não permitir fallback de leitura
integral. Controle presente lê somente schemaVersion e deve estar na versão 1;
ausência continua explícita. Não depender da interpretação de fieldMask vazio.
Reforçar prova de ABA com exclusão/recriação em commits separados e caso isolado
de nascimento, além de token de outra aventura e controle inválido.

## Resultado do primeiro incremento

26 Node passaram, sem skip, em 110,1388 ms na seleção final. A revisão separou
exclusão/recriação em commits distintos para raiz e controle e conferiu novo
nascimento; não apenas write duplo no mesmo commit. Lint dirigido, sintaxe e
checks documentais/arquiteturais/formatação/diff acompanham o commit.
[ADR 0170](../../../decisions/0170-adventure-backup-root-progress-anchor.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-fonte-do-backup-de-aventuras.md).
P2 integral permanece aberto; próxima entrega é o contrato/inventário e a
captura de recursos próprios, sem reutilizar base parcial de campanha como dump.

## Continuidade de captura

148 acrescentou raiz/partes; 149 acrescenta oito famílias de cenas/blocos,
controles de ordem, corpos, planner e referências. São leitores internos com
provas próprias, não selo global ou backup integral. 118 Node e três SDK
positivos no incremento 149. Narrativa/lore/demais famílias, pacote/restore/UI
e validação integral de P2 continuam pendentes.
