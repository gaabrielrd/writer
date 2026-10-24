# Writer V2 — Coordenador cliente da criação de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2; somente commit local.
- **Plano**: [112 / M38c5n](../tasks/writer-v2/execucao/112-coordenador-cliente-da-criacao-de-lore.md).
- **Decisão**: [ADR 0127](../decisions/0127-client-native-lore-creation-coordinator.md).

## Funcionalidade implementada

Coordenador cliente executa criação nativa por reserva, uploads, composição e
adoção explícita, com IDs/manifesta estáveis. Snapshot sem prosa, controles até
50 e checkpoint privado restaurável preparam a integração durável seguinte.
Sessão Auth oferece prepareCreation pelo UID atual e protege dados privados
depois de troca de actor/contexto.

Dados são congelados antes de await, sem trims/caps ou datas do cliente.
Preserva ausências, vazios, duplicados, BOM/CRLF e formato de relações.
Ready conserva a cabeça ausente; somente apply cria a ficha. Confirmar pedido
já aplicado não cria outra ficha nem repete clock.

Pedidos incertos conservam wire/CAS/bytes. Restaurar valida escopo, manifesto,
páginas/hash/cursores/progressos e wire reconstruído sem enviar RPC.
Apply incerto aguarda ação explícita, inclusive após restauração.

Cancel é independente do produtor e delega fechamento/coleta à reserva nativa.
Reconcilia CAS de cleanup por metadata. Adoção própria vencedora é confirmada;
adoção de outra tentativa fica em conflito, sem anunciar sucesso próprio ou
excluir cabeça ativa. Conflito não autoriza liberar chave/purgar cópia.

**Sem criação nova na navegação normal**: não há ticket/cópia cifrada de criação
integrados ao armazenamento neste incremento. O checkpoint tem bytes privados
e exige cifra/grant fresco no futuro host. Não anunciá-lo como recuperação
durável nem ativar UI apenas porque o coordenador passou nos testes.

## Critérios de aceite e revisão

- [x] Criação literal por unidades, partes/páginas limitadas e sem caps legados.
- [x] Ready sem cabeça e apply explícito, com replay idempotente.
- [x] Pedidos incertos e restauração de checkpoint sem RPC na abertura.
- [x] Snapshot limitado, controles paginados e input congelado.
- [x] Cancel com produtor em voo, limpeza e adoção própria reconciliadas.
- [x] Respostas/escopos/checkpoints incorretos recusados.
- [x] Auth/actor/host fenceiam I/O e leitura de checkpoint privado.
- [x] Regressões de edição, plano e checkpoint existentes preservadas.
- [ ] Ticket, chave e armazenamento cifrado duráveis da criação.
- [ ] Host, exclusão integrada, lifecycle/consumidores/rollout e validate de P1.

Revisão corrigiu o contador alterado por resposta tardia depois do cancel,
endureceu coerência de estágios na restauração e capturou guardas do host.
Checkpoint, snapshot e páginas conferem actor; cancelar ignora AbortSignal da
produção, mantendo autorização de conta/contexto. Listas/journals existentes
não foram ampliados. Sem dependências ou alteração de backend/Rules.

## Testes e validações reais

**209 Vitest distintos positivos**, em cinco arquivos; **50 casos novos**:
48 do coordenador e dois da sessão Auth. O conjunto inclui 159 regressões.

- Inicial: 3/3 em 1.92 s.
- Concorrência ampliada: 13/14 em 3.78 s; resposta tardia alterava contador
  após encerramento. Corrigido; retake **14/14 em 4.30 s**.
- Grandes/paginados/checkpoint: **35/35 em 12.77 s**.
- Respostas/CAS/autorização ampliados: **48/48 em 14.53 s**.
- Sessão Auth ampliada: **29/29 em 1.83 s** (inclui 27 regressões).
- Integração final dirigida: **209/209 em 15.39 s**; criação, sessão, plano,
  operação de edição e checkpoint existentes. Retakes não somam casos.
- Campo acima de 8 MiB/128 partes e resumo acima do cap legado;
  3.265 relações/54 uploads/controles paginados. Formato literal,
  ausências e original inline conferidos no leitor nativo.
- Perda de resposta em reserva/append/reserva de slot/compilação/apply,
  cancel com reserva ou append retidos, outro cleanup avançando CAS,
  autorização retirada/restabelecida, adoção estrangeira e adulterações.
- Build final passou: typecheck, bundle e smoke. O typecheck inicial pegou
  import não usado; removido antes dos resultados finais.
- Lint dirigido passou sem warnings; arquitetura/docs/formatação/diff no
  fechamento. Avisos existentes de chunks/imports dinâmicos permanecem.
- Não executados: validate integral/coverage, backend/Rules, SDK ou Chromium.
  Nenhuma UI/backend foi alterada; validate integral fica no fechamento de P1.

Testes chamam serviços nativos reais de Functions sobre double com identidade/
recibos nativos simulados, sem rede ou dados reais. Isso não certifica SDK,
Auth/App Check reais, persistência após reinício do browser ou navegação normal.
A retomada aqui reconstrói outro coordenador a partir de checkpoint em memória.

## Arquivos e próximos passos

Novos plano/parser/coordenador e harness/testes da criação; schema de dados
reutilizado, sessão e exports ampliados. Docs/ADR/AGENTS alinhados.

Próximo: ticket antes de qualquer RPC, reserva incerta e cópia cifrada
confirmada, checkpoint persistido e cancel/descarte por metadata, sem misturar
o formato dos journals de edição. Também faltam host de criação/exclusão,
ciclo de chaves ao excluir livro, demais writers/contextos/publicação/backup,
rollout e validate. P1/F2-09/V2, fases 3–5 e condições humanas/comerciais abertos.
Somente commit local, sem CI/push/PR/merge/deploy.
