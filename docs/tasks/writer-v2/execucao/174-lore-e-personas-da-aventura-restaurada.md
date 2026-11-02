# P2 — lore e personas privados da aventura restaurada

Base: 648f63a. Contratos reais de adventureLore, identidade de raiz, persona
portátil/disponibilidade e captura nativa conferidos. Grafo parcial consultado,
insuficiente para estes módulos; fonte atual é autoritativa.

## Objetivo e escopo

Continuar resources-ready até profiles-ready, montando lore nativo e definições/
vínculos de personas privados. ItemIndex prossegue pela seção de lore/personas;
resourceIndex fica congelado no fim anterior. Nenhuma ativação ou endpoint.
Histórico/draft em partes, universo, mídia, agregados/audit/ativação e UI continuam
obrigatórios nos próximos incrementos; não adaptar contratos de livro por cast.

## Sequência

1. Evoluir fases/metadados/views/recibos compatíveis, com contagens de heads,
   bodies, bindings e perfis únicos. Validar contra totais e manifestos; não
   perder contadores/recibos anteriores. Não aceitar cursor ou overrides do cliente.
2. Lookup autenticado de lore pelo índice e ordinal da unidade, cobrindo chave,
   operação/nascimento/hash e sourceItemIndex, unidade e fonte. Conferir provas
   na mesma transação que consome o resultado, inclusive consulta do par.
3. Ampliar endereços/journals/cleanup antes de escrever lore/loreBodies e
   definições/bindings de persona dentro de preparedRoot, sem biblioteca pública.
   Criar/ensure somente documentos comprovados; cleanup antigo recusa órfãos.
4. Montar par de lore vivo atomicamente e tombstone sem corpo, independente da
   ordem do arquivo. Identidade nativa usa nascimento comum da raiz/job comprovado
   pelo store. Revision operacional 1; loreVersion da definição acompanha heads.
   Preservar nomes/textos/datas/aliases/relações, remap local e ponteiros externos,
   mantendo isPublic false e limites nativos sem normalização silenciosa.
5. Personas: conservar perfil portátil completo com ID remapeado, hash e dedupe
   por ensure idêntico; registrar todo binding, inclusive null. Conferir binding
   contra definição/scene head comprovados. Não criar aiPersonas nem contornar
   prova/lote de disponibilidade; integração de biblioteca precederá ativação.
6. Conferir manifestos e contagens, depois profiles-ready. Root sem ownerId e
   countReady false; não reviver fonte somente histórica nem copiar universo.
7. Testes Native/Vitest, Node adversarial e SDK demo: pares/tombstones, ordens
   invertidas, dedupe/null/overrides, snapshot, replay/conflito/retry/rollback,
   cancelamento durante leitura, índice/origem/target/journal adulterados,
   órfãos, limites e limpeza completa com versões/recibos anteriores válidos.
8. Checks dirigidos, revisão, ADR/docs/evidência e commit local com hooks normais.
   Suíte integral no fechamento do bloco maior. Sem CI/push/PR/deploy/agentes.

## Riscos e suposições

O arquivo autenticado já valida os formatos e relações; a escrita ainda deve
provar representabilidade nativa após remap e não truncar. Lore externo permanece
ponteiro sujeito ao acesso atual. Profiles-ready não integra personas à biblioteca,
não confirma universo/autorização nem habilita consumo autoral da aventura.
Não é necessário novo consentimento de produto para esses contratos aprovados.

## Aceites

- [x] Lore nativo preservado, com pares atômicos, tombstones e identidade correta.
- [x] Perfis únicos e todos os bindings privados, coerentes com os cabeçalhos.
- [x] Metadata/recibos/cleanup compatíveis, sem adoção ou exposição prematura.
- [x] Testes dirigidos/SDK/checks, revisão/docs/evidência e commit local.

P2/P3/D/F2-09, gates humanos/comerciais e contagem macro 8/35 continuam abertos.

Evidência: [lore/personas privados](../../../entregas/2026-10-27-writer-v2-lore-personas-privados-de-aventuras.md).
13 Node novos distintos e regressões dirigidas, 11 Vitest conjuntos e três SDK
distintos positivos em seleções. Falha real na versão de escrita idêntica foi
reproduzida/corrigida; não somar a tentativa SDK inicial como suite verde.
Sem novo validate integral: fechamento do bloco maior permanece obrigatório.
