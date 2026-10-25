# P1 — preparação retomável no cliente

## Objetivo e descoberta

Avançar o passo 5 do [plano 133](133-revisao-e-ativacao-do-livro.md) após
[transporte 136](136-transporte-da-restauracao.md). O cliente ainda não tem
orquestração de restauração. O serviço possui checkpoints e recibos próprios;
o cliente deve preservar o mesmo comando em pedidos sem resposta.

## Contrato antes do código

Criar um sequenciador de uma unidade por chamada, após upload. Não ativar
automaticamente, escolher arquivos ou publicar. Projetar da resposta apenas
identidade, estado, checkpoint e fase/schema de preparação necessários ao
próximo comando; validar identidade exata e combinações conhecidas.

uploaded/checking escolhem integridade; bytes-verified/validating escolhem
validação. content-verified sem preparação ou structure escolhe estrutura;
resources escolhe lore; scenes escolhe recursos; resource-counts escolhe Counts;
personas/universe/history/draft/draft-finalize/cover escolhem seus comandos.
cover-finalize reserva quando ainda não tem controle Storage, senão materializa.
personas-integrate escolhe biblioteca de personas; resources-finalize escolhe
índices enquanto sourceIndexes.complete não for true e auditoria depois disso.
resources-audit continua auditoria. activation-ready para em review-required.
uploading, rejeição, cancelamento e activated param sem writes remotos.

Um port de journal deve oferecer leitura e CAS estrutural atômico da intenção
completa. Não é persistência implementada nem promessa de recuperação após
reload nesta etapa; adaptador protegido no dispositivo e UI continuam depois.
Guardar somente identidade, ação, operationId, checkpoint e limite fixo de
integridade (16, null nos demais comandos), sem prosa/arquivo/
chave. Antes de RPC nova, persistir intenção por CAS null → intenção.
Se pendente existir, reenviar exatamente a mesma antes de selecionar outro passo.

Confirmar schema/kind/recibo/action/operationId/checkpoint e identidade da resposta
antes de limpar somente a intenção própria por CAS. Erro, identidade alterada,
abort antes da confirmação ou confirmação inválida preservam a intenção.
Invalidação após limpar uma confirmação própria impede a entrega à interface,
sem desfazer o reconhecimento já feito. Resposta histórica válida
pode carregar progresso atual posterior. Não avançar próximo passo na mesma
chamada. Check obrigatório de conta/vida útil antes e depois de cada await;
uma instância não executa duas unidades simultâneas. CAS continua necessário
entre instâncias/abas.

## Arquivos e sequência

1. Tipos do port/intenção/projeção e parser/seleção puros em book-portability.
2. Adaptador callable com nomes fixos e inicialização Firebase adiada.
3. Sequenciador com journal injetado, CAS, confirmação e check de vida útil.
4. Testes dirigidos de fases, pedidos perdidos, replay, concorrência, identidade,
   CAS e adapter; teste com serviço real quando couber.
5. Revisão/checks, documentação/ADR/evidência e commit local.

## Riscos e aceites

- [x] Fases/schemas/identidades inválidos recusados antes de nova mutação.
- [x] Uma unidade; ativação somente em entrega posterior com revisão explícita.
- [x] Intenção persistida antes de envio e mantida até confirmação própria.
- [x] Replay histórico/concorrência/CAS/abort não apagam dívida nem avançam sozinhos.
- [x] Testes dirigidos/checks e commit local; sem claim de adaptador durável/UI.
      [Evidência](../../../entregas/2026-10-25-writer-v2-preparacao-retomavel-no-cliente.md).

Upload inicial, journal cifrado concreto, revisão/ativação/mídia/limpeza no cliente,
UI/roundtrip integral/inventários/writers/exclusão/legados/rollout/validate de P1,
fases 3–5 e gates humanos/comerciais permanecem obrigatórios.
Sem CI, push, PR, merge, deploy ou subagentes; validate no fechamento de P1.
