# P1 / M38c7 — Chaves de recuperação na exclusão do livro

## Objetivo e requisitos

Excluir o livro deve revogar as chaves de recuperação de lore que pertencem
à encarnação original, antes de remover a raiz. Negar acesso HTTP não significa
apagar a chave. Preservar controles, provas, fences e resultados históricos,
sem buscar prosa, ciphertext local ou material de chave na coleta.

## Decisão técnica e suposições

Todos os produtores nativos de recuperação reautorizam o livro dentro da
transação e recusam deleting. A marca/revogação pública vem antes da coleta;
a varredura de controles legados é estável diante desses produtores. SDK não
pode escrever controles, chaves ou o novo inventário. Rollout conjunto e drain
de versões anteriores continuam obrigatórios; não executar contra produção.

Novas reservas criam índice privado books/bookId/bookLoreRecoveryKeys/writeId
no mesmo commit de raiz/prova/chave. A raiz imutável declara keyInventory:1.
O índice fixa UID/writeId/bookId/bookBirth/requestHash/keyId e compartilha
nascimento com a raiz. Não é grant e não contém material AES. Ausência/corrupção
não permite regenerar chave ou inventário.

Controles v1 sem keyInventory continuam legíveis e revogáveis, sem inventar
índice retroativo. Revogação explícita e exclusão removem somente chave/índice
originais; recriados ou divergentes bloqueiam. Controle já fechado com resíduo
inesperado não autoriza varrer esse resíduo.

## Sequência e arquivos

1. Extrair carregamento/prova da recuperação para store interno compartilhado,
   sem mudar respostas públicas ou os conjuntos fechados de RPC.
2. Integrar inventário na reserva, HTTP de chave e revogação explícita.
   Preservar metadata após revogação e origem ausente; sem recriação automática.
3. Na exclusão, visitar um controle por unidade por UID/bookId, com cursor.
   Exigir abertura nativa de exclusão na mesma transação, bookBirth/cutoff e
   provas do controle. Ler da chave somente schema e timestamps nativos.
   Criar terminal/prova e remover chave/índice atomicamente com o checkpoint.
4. Estado de exclusão v2 conserva fase/cursor/corpo/contadores anteriores e
   acrescenta progresso da recuperação. Verificar evento/hash v1 antes de
   migrar, incluindo controladores já complete com a raiz ainda existente.
   Não pular chaves em checkpoints antigos avançados. Preservar aliases.
5. Incluir raízes de recuperação/índice na descoberta sem flags e reconferir
   inventário vazio no finish do lore e no finish externo do livro. Resíduo
   desconhecido bloqueia; não apagar namespace ou controles por heurística.
6. Testes Node de reserva/HTTP/revogação e exclusão; SDK real dirigido para
   namespace, reserva/retomada e transações. Regressões dos protocolos afetados,
   lint/sintaxe/checks, revisão, ADR/AGENTS/arquitetura/testes/evidência.
7. Commit local. Validate integral no fechamento de P1; sem CI/push/PR/deploy.

Arquivos previstos: bookLoreWriteRecovery/Contracts e novo Store/Inventory,
novo bookLoreRecoveryDeletion, bookLoreDeletion/Store, firestore.rules,
testes Node/SDK e documentação. Sem UI, endpoint ou dependência nova.

## Aceites e riscos

- Criação e edição; múltiplas recuperações, outro livro/UID e v1 sem índice.
- Livro sem flags mas com chave; origem/ficha já ausente não exige abrir texto.
- Chave/índice/raiz/provas recriados, cutoff e encarnação divergentes bloqueiam.
- Chave ausente pode fechar sem regenerar; chave fechada não reaparece.
- Cursor/checkpoint/terminal/deletes são atômicos; rollback e retomada reais.
- Estado v1 avançado/completo migra sem perder fase ou contadores.
- Índice tardio/órfão bloqueia o finish; metadata e recibos sobrevivem à raiz.
- Não ler keyBase64, prosa ou ciphertext durante exclusão.
- Preservar captura/edição/criação/retirada já implementadas e limites de I/O.

Cópias locais não são apagadas remotamente; o Writer recusa reabri-las após
revogar a chave e exige descarte explícito no dispositivo. Material já autorizado
em memória não pode ser apagado remotamente. Retirar uma ficha não
é este protocolo de exclusão integral. Chaves históricas de livros já apagados
exigem auditoria/reconciliação própria antes do rollout, sem purge automático.
Demais produtores/consumidores, backup/restauração, drain/rollout/validate de P1,
fases 3–5 e gates humanos/comerciais permanecem no objetivo.

## Evidência e continuidade

[ADR 0145](../../../decisions/0145-book-lore-recovery-key-deletion.md) e
[entrega](../../../entregas/2026-10-25-writer-v2-chaves-de-lore-na-exclusao-do-livro.md):
85 Node distintos e 12 SDK positivos; sintaxe de 258 módulos, lint/arquitetura
e checks locais positivos. Inventário, revogação coordenada e migração v1/v2
implementados localmente. Sem CI/envio remoto/deploy.

Chaves históricas de livros já apagados ainda exigem auditoria/reconciliação
específica, sem inventar raiz/identidade. Demais namespaces/writers/consumidores,
backup/restauração, drain/rollout/validate de P1 e fases/gates seguem no objetivo.
