# ADR 0146 — Auditoria das chaves históricas de lore

- Status: aceito e implementado localmente.
- Data: 2026-10-25.
- Plano: [127](../tasks/writer-v2/execucao/127-auditoria-das-chaves-historicas-de-lore.md).

## Contexto

O plano 126 fecha o ciclo da chave nas exclusões futuras, incluindo operações
já iniciadas com a raiz ainda presente. Livros apagados pelo fluxo anterior
podem deixar capacidades de recuperação inacessíveis no servidor.
Uma limpeza por ausência de documento perderia a identidade dos controles.

## Decisão

Oferecer serviço interno administrativo e CLI, sem callable ou job automático.
Auditar um UID por vez, por páginas de até 50 controles, com cursor explícito.
Consulta e aplicação leem somente metadata; da chave, apenas schema e
timestamps nativos por fieldMask. Nunca carregar AES, prosa ou ciphertext.

Reutilizar o store e índice da recuperação. Exigir raiz/prova/terminal próprios
e originais; chave presente deve compartilhar nascimento imutável com a raiz,
e índice declarado deve ser o original. Controle legado sem índice permanece
compatível, sem criar um índice fictício para fechar a recuperação.

Elegibilidade exige livro atualmente ausente e marcador deletedBooks com
somente deletedAt válido, numérico ou Timestamp legado. A atualização nativa
do marcador deve ser posterior à reserva. A data declarada não substitui
essa cronologia. Reserva tipada de restauração não prova exclusão.

Livro existente, inclusive recriado, fica fora da aplicação automática.
Marcador ausente/inválido, controle divergente, chave/índice recriados e
resíduo em controle fechado exigem revisão. Erro de infraestrutura interrompe
a página; não convertê-lo em um certificado de dado inválido.

O relatório elegível fixa requestHash/jobToken e deletionToken, derivado da
identidade original do controle e dos timestamps nativos do marcador.
A aplicação reconfere ausência, marcador e todos os artefatos na mesma
transação. Reaparecimento do livro ou alteração/recriação do marcador
invalidam a revisão.

Terminal/prova e remoção da chave/índice originais compartilham o commit.
Metadata, recibos, marcador, corpos residuais e cópia local permanecem.
Reaplicação pode confirmar o fechamento original; resíduo posterior nunca
é removido por essa confirmação.

CLI exige projeto e UID explícitos e gera relatório por padrão. Aplicação
exige arquivo revisado do mesmo projeto/UID, de até 50 itens e 1 MiB de
metadata, validado antes de inicializar o SDK. Somente itens elegíveis são
enviados à revogação. Uma falha interrompe a aplicação com resultados parciais
sanitizados; o mesmo relatório permite retomar por confirmação idempotente.

## Consequências e limites

A ausência atual e o marcador permitem revogar uma capacidade própria já
indisponível. Não certificam exclusão completa, ausência global de órfãos
ou identidade inventada da raiz apagada. Não há grant de leitura nem
recriação de livro, chave ou controle.

Órfãos sem controle/prova ou sem marcador permanecem para reconciliação
individual. Paginação não é um snapshot global e não prova inventário vazio
de todas as contas. É necessário percorrer o escopo autorizado e revisar
os casos pendentes antes do rollout.

Operação documentada em [auditoria de recuperação](../lore-recovery-audit.md).
Nenhuma execução contra produção ocorreu neste incremento. Permissões
administrativas e execução real são condições de uma operação própria.

Demais namespaces/escritores/consumidores, backup/restauração, inventário
completo, drain/rollout/validate de P1, fases 3–5 e gates humanos/comerciais
continuam necessários. Somente commit local, sem CI/push/PR/merge/deploy.
