# ADR 0106 — Composição de lore por origem de criação e tentativas nativas

- Data: 2026-10-24.
- Estado: aceito para preparação interna; ativação da criação continua pendente.
- Plano: [91 / L3A](../tasks/writer-v2/execucao/91-composicao-do-lore-a-partir-da-reserva.md).
- Antecedentes: [ADR 0104](0104-permanent-book-lore-creation-reservation.md) e
  [ADR 0105](0105-native-creation-field-uploads.md).

## Contexto

A reserva e seus uploads não possuem ficha de origem. O editor existente usa
uma inspeção de cabeça real para fixar campos herdados e versões nativas.
Simular uma inspeção ou uma cabeça permitiria confundir nascimento de reserva
com nascimento da ficha futura. Além disso, o cancelamento do criador precisa
conhecer campos reservados e tentativas antes de permitir a composição.

## Decisão

Intenção de edição tem exatamente uma origem: inspection ou creation.
Criação exige os uploads name/category, sourceToken do criador e relações
explícitas. Campos opcionais ausentes não são herdados; null continua explícito.
Contexto creation fixa bookBirth/creationBirth e metadata vazia real,
sem sourceBirth/sourceUpdate/inspectionBirth ou base. Cada unidade de preparo
reabre a reserva viva, livro original e ausência de cabeça/tombstone.

Start grava job da tentativa e binding/prova imutáveis no criador na mesma
transação e com o mesmo nascimento. Binding fixa hash de intenção/contexto;
get/cleanup conferem procedência histórica, sem conceder acesso ao conteúdo.
Recibos e gerações continuam usando os protocolos de edição existentes.

O contexto do inventário de geração usa schemaVersion 2 somente para criação,
com creationSource {reference, birth} e preparation obrigatória. Não inclui
sourceBirth/sourceUpdate/storageHash de uma cabeça inexistente. Gerações de
edição existentes conservam schemaVersion 1 e seus hashes. Isso não altera
a versão do descritor payloadStorage nem o contrato dos corpos.

Cancelamento do criador fecha todos os produtores antes da limpeza. Com
tentativas, journal inicia em attempts e coordena um passo de cancelamento
do filho por transação, antes de uploads. O filho limpa os campos reserved
pela capacidade nativa já existente, até 16 partes e header por último.
Checkpoint, recibo do pai e mutações do filho compartilham a transação.

Auditorias limitadas de edits/generations/bodies confirmam tentativas
canceladas, gerações canceladas e inventários collected ligados à tentativa.
Metadata e provas permanecem; bytes/segmentos precisam estar ausentes ao fim.
Campos reservados só passam pela auditoria do criador após cancelados e com
prova de slot/geração nativa. Controles recriados ou desconhecidos bloqueiam
a conclusão; nenhum namespace purge. Origem revogada/ausente permite apenas
limpar a preparação própria; livro recriado é preservado.

Compositor inicia sem base nem campos herdados. Todas as páginas de relações
precisam ser selecionadas; não há fallback de origem. Parser/domínio/SHA por
parte e certificado final são reutilizados. Preparar não muda cabeça, clock,
datas do livro, privacidade, publicação ou créditos.

## Consequências e portão seguinte

O endpoint interno de adoção rejeita sourceMode creation até L3B implementar
a prova histórica de sucesso e a ativação atômica de cabeça/geração/leases/
clock/datas/recibo/criador. C1 continua rejeitando qualquer cabeça prematura
com reserva. Não há callable/UI novo, dependência ou Rule nova.

L3B deve reconhecer a origem nativa da primeira cabeça em leituras e reedições,
recusar cancelamento de sucesso e preservar o comprovante após retirada,
edições posteriores e exclusão do livro. Todos os demais writers/consumidores,
backup/cliente e rollout de P1 continuam obrigatórios.
