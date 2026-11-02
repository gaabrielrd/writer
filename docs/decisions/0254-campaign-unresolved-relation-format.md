# ADR 0254 — Relações não resolvidas no arquivo de campanha

- Data: 2026-10-29.
- Estado: aceita para emissão e revisão do arquivo; codec privado ainda pendente.
- Relacionadas: [0247](0247-campaign-backup-utf8-fields-v2.md),
  [0253](0253-campaign-portable-frozen-lore-relations.md).

## Contexto

Uma variante restaurada pode conservar a chave de uma relação cujo descritor
não foi incluído no arquivo. A chave precisa sobreviver à edição e à adoção
de outra base mesmo quando o alvo passa a estar disponível. Nas versões de
conteúdo 1/2, available false exige indisponibilidade do alvo no arquivo.
Marcar true inventaria descritores; conservar false contrariaria esse join;
remover a chave perderia informação.

A dependência foi registrada no plano 224 antes de alterar o código. Primeiro
versionar o arquivo; depois implementar o codec privado e o ciclo da variante.

## Decisão

A emissão passa a contentVersion 3, com domínio lógico
writer-campaign-logical-units-v3. Header, prova auditada, manifesto e assinatura
devem concordar. O framing continua 1 e a procedência continua 2.
Leitura mantém versões 1/2 com as gramáticas e joins originais; campos textuais
nas versões 2/3 conservam os chunks UTF-8 nativos completos até 64 KiB.

Somente relações de variant.entity podem acrescentar unresolved true, sempre
com available false e sem tipo, descrição ou campos adicionais. A chave
permanece válida, limitada e diferente da ficha de origem. O marcador é
rejeitado nas versões 1/2, em base/âncora, em relações true e em qualquer valor
diferente de true. Relações sem marcador conservam o join estrito anterior.

O índice autenticado confere o tipo lore quando há alvo disponível na base.
Ausência ou disponibilidade do alvo não resolve a relação marcada; a chave
não autoriza consultas à origem viva nem recupera descritores. A prova interna
conta unresolvedRelations, sem devolver uma entidade nativa ao cliente.

O callback provisório onDerivedUnit recebe a versão do header validado para
escolher a gramática. Seus dados continuam provisórios até a autenticação
integral do arquivo e não permitem escrita ativa ou concessão de acesso.
A revisão composta mantém o resultado campaign-backup-review-only.

## Limites e sequência

Esta etapa não cria bodyCodec, persistência de variantes portáteis ou um
produtor de restauração. O escritor nativo atual emite versão 3 com relações
já conhecidas; os casos novos são exercitados por arquivos reais reassinados
com chave de teste confiável.

O próximo incremento precisa conservar chaves opacas durante leitura,
save/remove/restore/discard, adoção e reexportação, permitindo resolução apenas
por seleção explícita de alvo autorizado. Depois vêm inventário e cleanup C4
v1–v4, upload/retomada, materialização/ativação e integração no Estúdio.
