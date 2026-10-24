# P1 / M38c5d — Reserva e chave da recuperação do lore

## Decisão de produto e objetivo

Operador aprovou em 2026-10-24 preservar rascunho/pedido em cópia cifrada
no dispositivo, recuperável pela mesma conta após revalidar a ficha original.
Implementar primeiro a reserva permanente e liberação autenticada da chave;
journal cifrado/retomada do coordenador e host visual continuam necessários.

## Contrato e sequência

1. Reserva por UID/writeId e intenção fechada bookId/loreId/sourceToken/
   intentHash. Fonte inicial exige CAS C1 e livro/ficha autorizados ativos.
   Fixar encarnações nativas, hash e chave AES de 32 bytes no mesmo commit
   com prova imutável. Reserva/get retornam somente metadata própria.
2. Não regenerar chave ausente/recriada; provar nascimento de raiz/prova/chave.
   Get metadata/retry podem confirmar evento após revogação/exclusão, sem
   devolver chave ou fingir disponibilidade atual do conteúdo.
3. Key exige token próprio e reautorização atual do mesmo livro/ficha por
   nascimento nativo. Revisão posterior não impede recuperar o rascunho,
   mas não muda seu CAS original nem autoriza rebase/aplicação.
   Recusar deleting, tombstone, root excluída/recriada ou troca de dono.
4. Revogação explícita remove somente chave original e cria prova permanente.
   Fence antes de reserva impede reabertura. Não cancela filhos de edição,
   não remove journal/rascunho local e não significa cancelamento da operação:
   o host futuro deve encerrar/reconciliar pedidos antes de oferecer descarte.
5. Callables metadata pelo wrapper existente; chave somente HTTP POST
   text/plain;charset=utf-8 com Auth/App Check, no-store em todos os resultados,
   limites/erros sanitizados e rewrite Hosting. Nenhuma callable devolve chave.
6. Rules negam SDK de todo o namespace. Testes Node da reserva/CAS/identidades/
   provas/replay/revogação/rollback, HTTP e SDK nativos dirigidos. Verificar
   fonte/clock/créditos preservados e bytes privados inacessíveis.
7. Revisão, sintaxe/arquitetura/docs/formato, ADR/evidência e commit local.
   Validate integral no fim de P1; sem CI/push/deploy.

## Arquivos previstos e riscos

Novo serviço/contratos de recuperação e handler HTTP; index, firebase.json,
Rules; testes Node/HTTP/SDK e documentação. Sem dependências ou alterações
em produtores de campos, adoção e inventário de bytes.

Esta reserva não guarda prosa nem produz corpos; controles/provas ficam
permanentes após excluir a origem, e a chave só fica recuperável enquanto
a encarnação original segue autorizada. Chave remanescente no servidor deve
ser explicitamente revogada, sem prometer sua coleta pela exclusão do livro.
Origem ausente/recriada nunca concede acesso à chave antiga.

A autorização do usuário não permite persistir chave no navegador. O host
deve aguardar armazenamento cifrado concluído antes de produzir bytes e
manter metadata dos pedidos incertos mesmo sem chave. Este incremento não
implementa journal, ciphertext local, retomada ou UI, nem habilita rollout.
Criação/exclusão/análise no cliente e demais writers/consumidores/backup/
ativação, P1/F2-09/V2 e fases 3–5 continuam necessários.

## Resultado do incremento

Reserva/prova/chave originais, reautorização, metadata, fence/revogação, HTTP
e Rules implementados. 37 Node distintos positivos em rodadas, três SDK
nativos positivos (10637.01 ms), sintaxe de 248 módulos/lint/arquitetura.
Veja [ADR 0117](../../../decisions/0117-private-lore-edit-recovery-keys.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-chave-protegida-da-recuperacao-do-lore.md).

Journal/retomada/host e ciclo de vida integrado permanecem pendentes.
Não há rascunho persistido no navegador ou autorização de rollout.
P1/F2-09/V2 abertos; validate integral no fechamento de P1. Só commit local.
