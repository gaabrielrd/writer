# P1 / M36b — Instalação das cópias globais de personas

## Objetivo e contrato

Instalar as definições preparadas como novas cópias próprias, preservando
literalmente perfil/revisão/datas/arquivo e a biblioteca existente. O lote
permanece preparing; somente a ativação final poderá liberá-lo.

- Uma definição por transação, ordenada por ID, sem limite de quantidade.
  Fonte preparada e hash são autenticados pelo journal/recibos nativos.
  Unicode malformado ou revisão sem representação inteira segura são rejeitados;
  não converter silenciosamente dados durante a escrita no Firestore.
- Inventário v14/progresso v11 antes do primeiro lote/perfil global.
  Certificar lote ausente e ausência de cópias/journals no namespace reservado.
  Colisão de ID falha sem adotar ou sobrescrever perfil existente.
- Perfil users/UID/aiPersonas/custom-hex64 com restoreOrigin fechado M36a.
  Perfil/journal/cursor/contador/lote/recibo são atômicos. Repetição/CAS/retry
  não duplicam cópias ou contagem. Não copiar biblioteca inteira nem perfis
  presentes somente no histórico; incluir a definição exclusiva do rascunho.
- Lote permanente por bookId: preparing, profileCount e recibos primeiro/último.
  Autenticar nascimento e última alteração por recibos imutáveis e contexto atual.
  A mesma prova serve aos estados preparing/active/cancelled; consumidores
  continuam aceitando apenas active.
- Ao esgotar definições, conferir total exato validado e chegar a
  resources-finalize, sem avançar o cursor do arquivo. Raiz ausente/countReady false.
- Cancelamento v14 começa em persona-library, marca o lote cancelled no servidor
  antes de Storage/recursos e preserva esse marcador permanente. Depois segue
  cover-storage e os inventários anteriores; limpeza de cópias globais é por
  journal/nascimento/última alteração, com metadata-only e certificação final.
  Proteger biblioteca atual, outros jobs/UIDs e encarnações recriadas.
- Lote/recibos ativos deverão sobreviver à exclusão do livro. Limpeza de
  preparação após ativação precisará aposentar journals sem excluir a biblioteca;
  isso pertence ao protocolo final, não ao cancelamento.
- Nenhum perfil será liberado aqui; todos os gates/Rules/cliente M36a devem estar
  implantados antes de habilitar produtores. A API continua interna e não há deploy.

## Sequência e aceites

1. [x] Contratos de progresso v11/inventário v14 e prova de lote compartilhada.
2. [x] Instalador unitário e invariantes de contagem/metadados/colisões.
3. [x] Revogação/limpeza limitada e compatibilidade v1–v13/recibos anteriores.
4. [x] Testes dirigidos Node/SDK, dados inválidos, mais de 500 perfis, replay/retry,
       cancelamento, metadata-only e proteção de registros recriados.
5. [x] Revisão, ADR/documentação/evidência e commit local.

## Continuação

A instalação não satisfaz ativação: faltam disponibilização da capa/biblioteca,
campos grandes/consumidores, certificação/ativação, limpeza pós-ativação e
host/UI/roundtrip/validate integral. P1/F2-09 e Writer V2 continuam abertos.
Sem dependência, crédito, Rule, componente visual, API pública, subagentes,
CI/push/PR/deploy novos.

## Evidência

[Entrega M36b](../../../entregas/2026-10-23-writer-v2-instalacao-das-personas-restauradas.md)
e [ADR 0084](../../../decisions/0084-restored-persona-installation.md):
341 backend distintos, 39 Vitest e sete SDK positivos; tipos, arquitetura,
sintaxe e build/smoke passaram. Validate integral reservado ao fechamento de P1.
