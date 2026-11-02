# P1 / M38 — Campos grandes dos recursos e metadados

## Problema e resultado exigido

Um item portátil válido pode conter mais de 1 MiB em nomes, aliases, textos,
planejamento, relações ou metadados. Não basta suportar o texto do capítulo e
original.content. O remapeamento também pode aumentar um item além dos 8 MiB
permitidos na entrada. A restauração deve conservar todos os valores, ausências,
ordens e referências sem truncar, impor limites menores ou ativar conteúdo parcial.

## Decisão de implementação

Usar gerações imutáveis de JSON em partes de 64 KiB, em bookResourceBodies,
separadas dos corpos de capítulos. O endereço inclui livro e geração; o cabeçalho
inclui proprietário, recurso tipado, hash integral, tamanho, número de partes e
raiz de integridade. Partes têm prova binária até essa raiz: uma página pode ser
conferida sem ler todos os bytes ou guardar uma lista crescente no cabeçalho.
O número de partes decorre do tamanho real após remapeamento, sem teto de 128.

As partes são criadas antes do cabeçalho final. Cada parte é imutável e deve ter
nascimento nativo anterior ou igual ao cabeçalho imutável. Recriação/alteração
depois do fechamento falha mesmo quando os bytes são iguais. O ponteiro deve
fixar o nascimento nativo do cabeçalho, obtido após sua criação, para detectar
recriação do próprio cabeçalho. No-op que preserva updateTime preserva a identidade.
A origem da
produção continua exigindo arquivo validado, journals, recibos e CAS; a prova de
bytes não substitui autorização, inventário, cancelamento ou certificação.

O documento nativo pequeno passa a apontar para a geração, mantendo somente os
campos explicitamente necessários a consulta/estado. Todo consumidor deve obter
o objeto lógico completo antes de usar ou editar seu conteúdo. Definir overlays
de estado por tipo, sem prevalência implícita de um stub sobre o JSON.
As projeções portáteis nunca incluem ponteiros físicos.

## Sequência obrigatória

1. M38a: contrato fechado, codec, leitura interna autenticada por escopo nativo,
   paginação independente, SHA integral/UTF-8 e testes Node/SDK. Ainda sem
   produtor habilitado, namespace gravado pelo produto, callable ou Rules novas.
2. M38b: materialização de lore, incluindo relações após remapeamento, por
   unidades retomáveis. Inventário ampliado, journals/recibos de cada unidade,
   namespace vazio antes da transição, cancelamento/limpeza e compatibilidade
   com jobs anteriores antes de gravar o primeiro payload.
3. M38c: integrar leitura/lista/assinatura/edição/exclusão e consumidores de lore
   (backup, contexto de IA, publicação, contagem/captura quando aplicável).
   Toda edição cria geração nova e troca o ponteiro por CAS; geração antiga
   só é coletada depois de provar ausência de referências.
4. M38d: aplicar o mesmo mecanismo aos campos grandes de cenas, planejamento,
   narrativa, estrutura do livro e metadados de versões/rascunho, com contratos
   próprios para os campos usados em consulta e overlays.
5. Resolver a saída portátil que cresceu após remapeamento: representação em
   partes e negociação de formato compatível, sem tentar passar esse JSON pelo
   antigo teto de 8 MiB. Conferir backup-restauração-backup com IDs novos.
6. Migrar jobs privados anteriores quando necessário e certificar todos os
   namespaces antes da ativação. Capa/biblioteca, ativação, limpeza posterior,
   host/UI/roundtrip e validate integral continuam requisitos de P1/F2-09.

## Aceites de M38a

- Nenhum valor é reduzido, normalizado ou perdido; ausente difere de vazio.
- Recursos e manifests fechados; índices/tamanhos seguros e derivados.
- Partes ímpares e fronteiras UTF-8 conferidas; prova de outra geração,
  recurso, posição, tamanho ou conteúdo falha.
- Corpo e partes com caminho/proprietário/livro/recurso/nascimento incorretos
  falham. Índice inválido é recusado antes de ler uma parte.
- Uma página usa um cabeçalho e uma parte; não recompõe o objeto inteiro.
- Leitura completa confere SHA e JSON literal. Nenhuma cache ou persistência
  cliente, dependência nova, crédito ou acesso público.
- Testes reais distinguem contrato de bytes, autorização do chamador e fluxo
  de restauração: M38a não comprova ainda a materialização nem habilita P1.

## Suposições e riscos

O produtor recebe objetos já validados pelo esquema de domínio; o codec também
recusa valores não representáveis em JSON. O limite de entrada continua o do
formato atual; o armazenamento físico não repete esse limite depois do
remapeamento. Operações serão paginadas pelo tamanho, não pelo total de recursos.

Uma prova de integridade não autentica, por si, o hash fornecido. O cabeçalho
deve vir de um ponteiro autorizado e ser recertificado no protocolo do job.
Mutação Admin fora do protocolo continua motivo de falha/certificação adicional.
Não reutilizar corpos de capítulo com IDs de lore disfarçados de capítulos.

Somente commits locais; CI ignorada; testes dirigidos por ajuste e validate no
fechamento de P1. Checkout original e dev server preservados.

## Evidência M38a

Codec e leitura interna implementados; 41 Node e dois cenários SDK reais positivos.
O corpo sintético acima de 8 MiB usa 141 partes e cabeçalho constante; leitura de
uma página exige dois documentos. A identidade esperada do cabeçalho é obrigatória.
Consultar a [entrega M38a](../../../entregas/2026-10-23-writer-v2-contrato-de-payloads-grandes.md)
e a [ADR 0088](../../../decisions/0088-large-resource-payload-contract.md).

Somente a primeira etapa técnica está implementada. M38b é a próxima tarefa;
nenhuma restauração grande de lore ou ativação foi comprovada por esta evidência.

## Evidência M38b e sequência restante

O [plano 78](78-producao-privada-de-lore-grande.md) materializa novos lores grandes
privadamente, com dados gerais e páginas de relações, inventário/cleanup e
reconciliação. [Evidência](../../../entregas/2026-10-23-writer-v2-producao-privada-de-lore-grande.md):
487 backend e quatro SDK distintos positivos. A emenda da ADR 0089 usa coleções
planas para que partes sem cabeçalho também sejam enumeráveis/canceláveis.

A etapa de compatibilidade foi validada em M38b2 no [plano 79](79-migracao-dos-prefixos-de-lore.md).
M38c deve integrar consumidores e mutações antes de ativar qualquer raiz.
O resultado técnico não fecha o conjunto M38, P1/F2-09 nem Writer V2.
