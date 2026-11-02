# ADR 0247 — campos UTF-8 no conteúdo portátil de campanha v2

- Data: 2026-10-29.
- Estado: implementado internamente; P3/D continua aberto.
- Complementa [ADR 0243](0243-campaign-native-backup-file.md) e
  [ADR 0246](0246-campaign-own-backup-semantics.md).

## Problema comprovado

O armazenamento nativo usa splitHistoryContent: cada parte termina no último
caractere UTF-8 completo que cabe em 65.536 bytes. O arquivo/auditor exigiam
partes fixas de 65.536 bytes. Uma cena real com 90.007 bytes e emojis foi
capturada corretamente, mas falhou na exportação com campaign-backup-audit-changed.
Também pode haver mais partes que ceil(bytes/65536), sem perda ou corrupção:
131.072 bytes podem resultar em [65535, 65536, 1].

## Decisão

Novos arquivos e manifesto usam contentVersion 2 e domínio lógico
writer-campaign-logical-units-v2. O auditor declara a versão efetivamente
capturada; o emissor assina essa versão. Header/manifesto devem concordar.
Framing permanece 1 e emissão de procedência permanece provenanceVersion 2.
As versões de conteúdo e procedência são independentes, ambas cobertas
pela assinatura. Não substituir versão/domínio só reencadeando bytes.

Apenas base:field e anchor:field usam as partes nativas. O contrato puro
compartilhado campaignBackupTextChunks.mjs serve produtor e leitor:

- Contagem entre max(1,ceil(bytes/65536)) e max(1,ceil(bytes/65533)).
- Parte não final com 65.533–65.536 bytes; última de até 65.536.
- Cada parte é UTF-8 válida, sem pares substitutos/overlong/incompletos.
- Quando a parte anterior tem sobra, o primeiro caractere da seguinte deve
  ser maior que essa sobra; não aceitar fronteira artificial menor que a nativa.
- Campo vazio tem uma parte vazia; campo não vazio não admite partes vazias.
- Ordinais, soma/tamanho/SHA completos e limite por parte continuam obrigatórios.

A auditoria nativa de campo aplica o mesmo contrato, inclusive na emissão sem
callback de publicação; não assinar um manifesto que o leitor recusaria por
fronteiras não máximas, mesmo com texto e SHA completos inalterados.

O leitor decodifica somente uma parte de cada vez para validar UTF-8, sem
concatenar o campo inteiro. BOM, NUL, espaços e quebras de linha não são
normalizados pelo arquivo. Dados próprios JSON, outros metadados e imagens
mantêm partes fixas; a nova regra não é fallback para bytes arbitrários.

## Compatibilidade

Aceitar contentVersion 1 com domínio e tamanhos fixos originais. Não reinterpretar
v1 com a gramática v2. Os testes criam arquivos v1 realmente assinados com
provenanceVersion 1 e 2 e chave verify-only; leitura própria continua funcionando.
Reframing com divisão no meio de um caractere é recusado mesmo se a concatenação
e seu SHA forem idênticos. Versão desconhecida ou discordante também recusa.

Emissores antigos não entendem contentVersion 2; a versão explícita permite
recusa segura, em vez de anunciar a gramática anterior para dados novos.
Não houve arquivo de produção/chave real configurado ou migração persistente.

## Limites e validação

19 cenários novos e 231 regressões Node passaram; consultar a
[evidência parcial](../entregas/2026-10-29-writer-v2-campos-utf8-no-backup-de-campanhas.md).
Há ciclo com cena/blocos/lore reais, âncora legada após adoção e remoção da base
antiga, leitura própria e revisão de origens. Textos de lore são comparados à
edição nativa capturada, preservando a normalização prévia já feita pelo escritor.

A correção remove um bloqueio de exportação; não prova todos os joins semânticos
derivados ou a restauração/materialização/ativação. Não muda limites dos domínios,
autoria/acesso, pin/geração de imagens, Rules ou C4. Sem persistência nova, UI,
endpoint, chave real ou grant. Validate integral no fechamento do grande bloco.
