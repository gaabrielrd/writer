# P1 / M38c5i — Coordenador persistido da edição de lore

## Objetivo e fronteira

Compor coordenador, draft, mapa, checkpoints e transporte em uma operação que
grave automaticamente antes de RPC e confirme resultado/checkpoint juntos.
Retomar após recarga sem perder cursores, repetir bytes ou aplicar sem intenção
explícita. Cancelamento metadata continua independente de chave/produtor.

Este incremento recebe journal reservado e se vincula à sessão Auth existente.
Bootstrap da reserva/chave e host visual permanecem próximos; não habilitar
rollout, demais writers ou concluir P1/F2-09/V2 por esta composição.

## Requisitos e sequência

1. Controller conserva input congelado e dívida local após falhas. Inicializar
   mapa/draft/checkpoint antes de produzir; snapshot só metadata, distinguindo
   cópia de recuperação, draft confirmado, save pendente e apply permitido.
2. Port persiste checkpoint com pedido exato antes de enviar por j.send.
   Resultado é aceito pelos parsers/core antes de confirmar unidade. Falha de
   post-save bloqueia novos produtores; retry primeiro resolve dívida, sem
   enviar outra unidade por acidente.
3. Guardar ponte metadata do resultado já validado, antes da cópia post-save.
   Root não pode ter wires pendentes/prosa; inclui no máximo uma página de
   controles alterada e confirmações. Vínculo à geração pre, receipt local
   idempotente e troca/ACK/remoção da ponte no mesmo commit.
4. Recuperar resultado da ponte mais páginas pre (ou mapa inicial), sem novo
   RPC. Verificar prefixos de ciphertext e active idempotente antes de declarar
   cópia salva; não promover cópia corrompida ou coletar a anterior por esse retry.
5. Retomada resolve ponte antes de hidratar core. Staging pre parcial é
   recomputada do draft/cursor original e só pode ser completada se idêntica,
   antes de RPC. Legado contraditório fica preservado e pode usar cleanup.
6. Cancel marca core sincronamente, persiste intenção e avança worker metadata;
   não espera produtor ou chave. Apply explícito, recibo vencedor e cancel
   monotônico preservados. Conta/contexto em todo I/O; signal bloqueia produção
   sem impedir persistência local/cleanup necessários.
7. Sessão Auth vincula controller com UID capturado, sem expor port ou aceitar
   journal de outra conta. Não fazer env/storage em componentes ou adicionar
   dependências/backend/Rules.
8. Testes dirigidos com serviços reais/double: cada resposta perdida, init/pre/
   post-save/ACK interrompidos e reload, prefixo corrompido, rollback, multipart,
   ready/apply, conta/signal, cancel em voo/key denial e metadata winner.
   Chromium real em harness leve, revisão/docs/ADR/evidência e commit local.

## Arquivos, riscos e aceite

Novo contrato de outcome metadata e adaptador persistido; journal/header/
checkpoint/mapa/sessão/barrel e testes. Banco/stores/versão e formatos nativos
não mudam. Ponte nunca contém texto/base64/credenciais ou é grant de leitura.

Somente resultado já validado pode originar ponte; registro/receipt locais
não são recibos nativos. Geração parcial divergente permanece preservada.
Setup ainda não confirmado não deve ser anunciado salvo; mapa deve ficar
pronto antes de qualquer envio. Não rebasear CAS ou regenerar intenção.

Aceite: caller só dirige initialize/advance/apply/cancel; persistência e ACK
são automáticos e recuperação não repete RPC já confirmado pela ponte.
Cancel funciona com produtor pendente sem ler prosa, e dados/recibos/clock/
créditos permanecem consistentes. Bootstrap/host/ciclo de vida, demais
writers/consumidores/backup/ativação/rollout e fases 3–5 continuam abertos.
Validate integral no fechamento de P1; sem CI/push/deploy.

## Resultado do incremento

Controller persistido e vínculo Auth implementados, com ponte metadata,
recuperação antes de restore, dívida local e verificação de ciphertext antes
de idempotência/coleta. Cancel independe de produtor/chave e preserva adoção.
Veja [ADR 0122](../../../decisions/0122-persisted-coordination-of-manual-lore-edits.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-coordenador-persistido-da-edicao-de-lore.md).
Bootstrap/host/ciclo de vida e demais gates seguem abertos; validate no fim de P1.
