# ADR 0238 — variantes e âncoras autorizadas no backup de campanhas

- Data: 2026-10-29.
- Estado: leitores internos implementados localmente.
- Base: 49aa782; [plano 208](../tasks/writer-v2/execucao/208-variantes-e-ancoras-do-lore.md).

## Decisão

Inventariar variantes no layout legado ou na geração ready explicitamente
declarada pela campanha. Nunca recuar para outro layout quando um ponteiro
declarado for inválido, inclusive null ou quando a origem estiver indisponível.
Controle, revisão, UID/campanha/encarnação e geração são metadata obrigatória.
Campanha independente não aceita variantes. Inventário conserva removed,
inactive e indisponíveis, com cursor limitado e prova do lookahead.

Antes de nome, categoria, manifestos ou prosa, provar origem da âncora por
metadata. Âncora pode apontar para base antiga do mesmo dono/campanha/aventura.
Factory privada confere base ready, nascimento da aventura, universo e ficha
por suas próprias encarnações e clocks. Leitor atual mantém API; token privado
passa a incluir fatos da captura. Ausência/revogação não transforma derivado em
conteúdo próprio nem impede captura dos próprios do plano 204.

A origem precisa também preceder a base do bodyBinding. Ao adotar uma base mais
nova, a âncora pode avançar e o corpo continuar antigo: isso não reautoriza texto
anterior a uma ficha recriada. Conferir base/geração do binding por metadata
antes do nome/hash/prosa. Para lore legado editado, a base de escrita pode não
conter a ficha; autorização vem da âncora antiga e da encarnação, sem exigir
uma nova cópia automática da ficha na base de escrita.

Somente após comparar variantToken, ler header protegido e aplicar o contrato
overlayRecord. Seguir bodyBinding legado ou geração anterior ready do mesmo
UID/campanha/encarnação; não trocar por corpos da geração atual. Conferir chave
determinística e metadata de cada parte antes de content, com identidade nativa,
UTF-8 literal e limite de 65.536 bytes.

Conferir SHA/tamanho integral e JSON canônico pelo consumidor nativo antes de
qualquer projeção. Uma entidade tem limite existente de 900.000 bytes: é unidade
lógica limitada que pode ser parseada inteira, sem reunir o projeto. Retornar
essa entidade em uma chamada evita reler seu JSON completo para cada fragmento
de transporte. O framing futuro fragmentará a unidade com pressão de consumo.
O DTO acrescenta somente metadata lógica limitada; não há cap total do projeto.

Preservar mode/previousMode, participação e retainedLegacy quando presentes.
Removida mantém corpo restaurável; inativa continua inativa. Manifesto ausente
não gera corpo fabricado. Relação a alvo revogado/ausente/removido/inativo
conserva targetKey e available false, sem tipo/descrição antigos. Alvo autorizado
preserva texto literal. Não normalizar silenciosamente: bytes JSON precisam
corresponder à serialização canônica original.

contentToken privado vincula binding/storage, identidades nativas dos corpos,
projeção e fonte. Bytes idênticos regravados mudam a prova. anchorKey é declaração
lógica e não é grant nem atestado. Leitor de âncora entrega snapshot/cabeçalho
congelados, auditoria dos campos no servidor e partes de texto pelo protocolo
206/207, sem buscar prosa atual da ficha.

## Limites

Ainda falta inventário físico completo do grafo de bindings/gerações, com
órfãos/ausências e segunda passagem conjunta. Gerações operacionais não referidas
não se tornam conteúdo portátil por existirem no armazenamento. Seguem binários/
Storage, reconciliação, manifesto/atestado, arquivo, persistência/cleanup,
restauração e UI/ciclo. Antes de produtores persistentes, ampliar C4 e os
consumidores de procedência restaurada. Não assinar manifesto arbitrário.

Nenhum endpoint, Rules, dependência, chave, job ou pin novo. Bancos de teste não
provam credenciais/concorrência de produção. [Evidência parcial](../entregas/2026-10-29-writer-v2-variantes-no-backup.md).
