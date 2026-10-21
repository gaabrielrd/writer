# ADR 0042 — Importação revisada de aventura

**Estado:** concluída tecnicamente em ffc01d9, com CI geral/regras verdes; sem rollout.
**Contrato:** [plano I](../tasks/writer-v2/execucao/27-importacao-revisada-de-aventura.md)
e [ABI fechada](../tasks/writer-v2/execucao/28-contratos-da-importacao-de-aventura.md).

## Contexto

O parser e a revisão de livros precisam servir à aventura sem criar um livro
intermediário. Uma gravação grande pode perder a resposta ou ser interrompida;
expor a raiz antes da composição completa produz projeto utilizável incompleto.
O operador escolheu guardar uma cópia protegida da revisão confirmada no mesmo
dispositivo, sem guardar o PDF, preservando seleção, divisões, uniões e títulos.

## Decisão

Extrair a folha pública document-import e conservar os reexports de books.
Cada seção selecionada, segura e congelada gera uma parte e uma cena com principal
virtual privado. Não inferir audiência, lore, missões ou direitos comerciais.

Reservar o ID global permanentemente; criar somente filhos privados durante
upload/preparação. UID, importId, createTime preciso, revisão congelada e cadeia
preparada prendem todos os passos. Materializar uma seção por transação usando os
inicializadores reais e o ledger. Ativar raiz, vínculo e recibo atomicamente.
Recibos/fences são projeções fechadas sem prosa; retries reconhecem o evento antigo.

Guardar journal somente de metadados antes da rede. Após start autorizado, obter
chave de 32 bytes por endpoint HTTP com Auth e App Check, private,no-store em
respostas controladas e nenhuma regeneração em estado terminal. Hosting encaminha
a rota antes da SPA; desenvolvimento usa proxy exato do mesmo projeto Firebase.
A chave fica em memória e no documento secreto de servidor, fechado ao SDK direto.

Cifrar a revisão com AES-256-GCM, IV aleatório novo e AAD de UID/importId/token/
keyId/reviewHash/count. Persistir ciphertext no IndexedDB e aguardar oncomplete
antes do primeiro append. Web Locks cobrem somente CAS local, nunca HTTP.
Comparar o registro integral, inclusive nonce/ciphertext, e invalidar continuações
após troca de conta. Antes de limpar/repetir controles, conferir o vínculo à
encarnação atual; snapshot inválido não impede cancelamento autorizado nem vira
prova para apagamento local. Não persistir PDF, chave ou prosa em claro no cliente.

Cancelamento fecha admissão antes de limpar até seis índices por passo. Projeto
ativado não pode ser removido por essa limpeza. Estados terminais removem chave
e sinopse temporária do controle, mantendo somente metadata necessária aos
recibos/progresso; a raiz ativada conserva a sinopse integral. Reservas e fences
permanecem. C4 e seus inventários continuam inalterados.

## Consequências

Reload pode retomar revisão confirmada após nova autorização, no dispositivo que
possui a cópia. Sem cópia válida, não prometer recuperar divisões/uniões anteriores.
Reanexar o mesmo PDF é opcional e restaura apenas a prévia em memória, após conferir
hash/bytes/tipo. Revisão anterior à confirmação não tem autosave novo.

Limites técnicos são medidos no corpo e no envelope completo, sem truncamento ou
quota comercial agregada inventada. OCR, mapas/imagens, IA, publicação, backup e
exclusão integral de aventura continuam fora desta vertical. Implantar guardas,
Functions, regras, índices e rewrite conjuntamente antes de habilitar a capacidade;
testes locais não comprovam configuração produtiva, piloto ou licença de revenda.
