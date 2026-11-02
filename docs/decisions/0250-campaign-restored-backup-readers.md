# ADR 0250 — Reexportação das bases restauradas de campanha

- Data: 2026-10-29.
- Estado: aceita para leitores internos, sem materializador persistente.
- Relacionadas: [0249](0249-campaign-restored-source-readers.md) e
  [0248](0248-campaign-derived-semantics-and-review.md).

## Contexto

Os leitores normais reconhecem as testemunhas privadas da restauração. O backup
também precisa reconhecer essas fontes para não autorizar uma origem recriada
usando como limite o nascimento mais recente da cópia privada.

## Decisão

Compartilhar a validação pura de testemunha de item e o núcleo de acesso exato.
Os contextos derivados, de base/âncoras e de corpos de variantes selecionam os
marcadores privados e conferem sua consistência antes de prosa. A prova entra
nos tokens de captura, sem depender somente do updateTime do registro.

A base restaurada deve continuar vinculada à aventura original autorizada.
Lore exige a ficha original, incluindo universo global ou vínculo local à
encarnação da aventura. Testemunha indisponível não recebe uma origem nova.
Capturas nativas sem marcadores mantêm o contrato anterior.

Uma nova emissão usa o ID privado atual da base e os nascimentos originais
comprovados. capturedAt e edição congelada são preservados. Isso permite
reexportar sem consultar a campanha/base antigas do arquivo anterior.
As testemunhas públicas são produzidas pelos serviços existentes; os marcadores
privados de restauração não são serializados nos DTOs/arquivo.

Âncoras retidas resolvem sua própria base privada restaurada mesmo após adoção
de uma candidata nativa. O endereço do corpo de variante prova armazenamento
próprio; a autorização da ficha continua vindo da âncora/item. Em bases
restauradas, conferir a prova exata em vez de atribuir autoridade à data nova.

## Consequências e limites

A cadeia privada da restauração participa da invalidação das capturas. Recriar
aventura torna a base indisponível; recriar universo/ficha suprime somente o
derivado correspondente, preservando o material da aventura autorizado.
Arquivo assinado, revisão semântica e autorização atual continuam gates distintos.

Não há novo formato, dependência, endpoint ou produtor persistente. Fixtures
de cópia e índices de revisão existem somente em memória nos testes.
Antes de persistir jobs/prosa/pins/índices, concluir consumidores de referências
opacas e inventário/cleanup C4 v1–v4. Depois: upload/retomada,
remapeamento/materialização/ativação e interface/ciclos. P3/D/F2-09 continuam abertos.
