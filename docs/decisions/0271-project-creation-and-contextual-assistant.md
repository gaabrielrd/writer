# ADR 0271 — Criação unificada e ações contextuais da página

Data: 2026-11-02. Estado: implementação local.

## Contexto

A criação assistida era exclusiva de livros e terminava antes do primeiro
conteúdo. O Estúdio oferecia métodos e tipos misturados em um menu.

## Decisão

Compor uma feature project-creation na rota /studio/new. A sessão assistida
recebe versão aditiva 2, tipo, método, universo e persona imutáveis. Sessões
legadas continuam sendo livros. O preço textual dos três tipos é 2 créditos,
confirmado pelo operador; criação manual não cobra pacote textual.

A ativação pequena é uma transação: raiz nativa, vínculo de universo, persona,
uso de capa, recibo e crédito. Reservas de exclusão/importação/restauração são
conferidas. Universo/persona são reautorizados por identidade nativa e versão
antes/depois do provedor e na ativação; perfil restaurado exige lote ativo.
O contexto de universo é limitado à descrição e até 12 resumos de lore.

O contrato puro pageAssistantCapabilities valida e anonimiza o catálogo tanto
na concepção quanto no projeto. Sugestões da concepção ficam vinculadas ao ID do
pedido original e nunca são reexecutadas ao retomar. Conversar não sobrescreve
rascunhos locais nem salva metadados implicitamente.

Uma feature page-assistant propõe ações de um catálogo efêmero de controles
visíveis/habilitados. IDs não são seletores. Nomes dinâmicos são anonimizados
antes do provedor; os rótulos exatos ficam locais para revisão humana. Campos
atuais não são enviados. Cada ação exige confirmação e rechecagem local; usa
os handlers já responsáveis pelos contratos transacionais de cada feature.
Texto rico segue pelo chat nativo, com seu host/bridge e aceite próprios.

O servidor oferece pageAssistant como ação de generationApi, preservando as
30 Functions e a infraestrutura por setor. Geração e raciocínio continuam no
contrato puro chatGeneration. Nenhuma chave vai para a sessão ou o catálogo.

## Consequências

A interface pode acompanhar controles novos sem duplicar seus escritores.
A automação é progressiva: uma ação por vez, inclusive em diálogos. Não há
promessa de uma transação envolvendo vários cliques ou de cobertura das APIs
internas que não têm uma ação disponível na página. Há limite de 80 controles.

A conversa contextual fica somente em RAM, por conta/projeto. O diálogo inicial
é relido por ID sob autorização e retenção existentes. Abrir o projeto não copia
conversas para o manuscrito. A recuperação de criação confirmada usa recibo,
nunca igualdade do título/conteúdo atual.
