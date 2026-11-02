# ADR 0054 — Pacote de livro por fluxo e confirmação do arquivo

- **Estado:** adotado localmente em 2026-10-22, sem deploy.
- **Contrato:** [P1 M10](../tasks/writer-v2/execucao/43-pacote-integral-e-gravacao.md).

## Decisão

O novo .writerbook usa framing M2 v1 e envelope writer-book-archive v1.
Não confundir com JSON legado writer-book-backup v1–v6. Cabeçalho canônico
book-package fixa livro e sete seções obrigatórias em ordem: structure, resources,
personas, universe, history, draft, cover. Kinds desconhecidos falham.

Cada seção conserva seus produtores M3b–M9 e marcadores de ausência/índices.
Footer book-package-end inclui sete contadores seguros de registros/bytes;
payload até 64 KiB. Emiti-lo somente após provas retornadas, conferência de todas
as capacidades e nova autorização da raiz fixada. Selo M2 vem depois.

readBookBackupPackage expõe registros provisórios e só retorna relatório após
footer, selo e EOF exatos. validation é envelope-only: presença/ordem/contagens
não validam DTO, duplicatas/partes, relações, remapeamento ou direito de restaurar.
Validação semântica completa continua obrigatória antes de revisão/ativação.

## Fluxo e fronteiras

streamBookBackup congela o rascunho antes de next/await. Capacidades compartilham
origem fixada; guardas verificam sinal/contexto antes e depois de RPC.
Histórico entra por port obrigatório, tipado pela interface pública da feature;
composition root do editor injeta seus serviços públicos. O barrel de
book-portability não importa UI/Firebase do histórico em runtime.

recordCaptureStream é uma ponte interna de uma posição. Produtor aguarda
reconhecimento depois de yield; não acumular registros ou frames do projeto.
Cancelamento rejeita escrita pendente e observa conclusão tardia do produtor,
sem aguardar RPC não cancelável ou permitir escrita posterior.
Limites por item/página existentes continuam; não prometer memória independente
do maior item, nem snapshot no instante posterior à conferência.

## Arquivo

BookBackupSink exige write/close/abort assíncronos. Adaptador FileSystemFileHandle
usa createWritable com keepExistingData false; espera cada escrita e confirma
close só após o produtor retornar selo completo. Falha/contexto/cancelamento
antes de commit fecha fluxo e aborta arquivo temporário. Falhas de cleanup
preservam erro primário via AggregateError/cause. Close confirmado é recibo local;
troca posterior de sessão não desfaz arquivo já confirmado.

saveBookBackup congela contribuição antes de aguardar promessa de sink. Host
futuro deve vincular UID/livro por isCurrent e AbortSignal e obter permissão normal
do seletor; não há botão/seletor/fallback de Blob acumulador neste marco.
Prova OPFS é gravação real da plataforma, sem comprovar diálogo externo ou UX.

## Consequências

Sem novas dependências, RPCs, coleções, Rules, créditos ou writes do livro.
[Evidência M10](../entregas/2026-10-22-writer-v2-pacote-integral-por-fluxo.md)
separa testes unitários, OPFS/emuladores reais e limites. Schema completo/leitor
legado, preparação/remapeamento/ativação/cleanup/recuperação e UI continuam em P1.
Avanço somente local, sem CI/push; validate completo no fechamento do bloco.
