# ADR 0289 — guias e manifestos como histórico autoral privado

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

Guia e manifesto pertencem ao autor e são consultáveis pela origem da edição,
mesmo após mudanças no manuscrito. Usar o current mutável da publicação no backup
alteraria estado e perderia história permitida. Achatar o guia em texto perderia
revelações, relações e vínculos específicos das citações.

## Decisão

Capturar guia atual/versões e job/capítulos/retiradas do manifesto por registros
limitados. Conferir dono/nascimento do livro e pai antes de abrir o corpo do guia,
seguindo o leitor nativo histórico. Validar hashes, IDs e schema. Não publicar,
reativar consentimento ou copiar corpos/ponteiros públicos.

Acrescentar readerGuide estruturado e editionKey ao documento portátil, exclusivos
dos seus papéis. Usar chaves lógicas de conteúdo, sem grant. Preservar retirada
como entrada null e consolidar versões iguais à cabeça como aliases verificáveis.
Citações autorais mantêm offsets ausentes e classificação unclassified, mesmo se
a certeza declarada do fato for fact. Identidade do capítulo é conferida separada
da validade atual da citação.

Remapear chaves, vínculos e citações de forma consistente e privada. O verificador
semântico exige tipo evidence nos vínculos de citação, impede chaves misturando
linhagens/edições e avisa sobre alvos históricos ausentes sem inventar entradas.

## Consequências

24 famílias internas, sem endpoint ou produtor habilitado. Até 57 artefatos/1 MiB
por bundle, partes de 64 KiB. Vinte e seis casos preparados, nenhum executado.
Produtor, restauração v2 e fechamento das cinco etapas continuam pendentes.
Detalhes no [incremento 41](../tasks/producao-literaria/41-captura-de-guias-e-manifestos.md).
