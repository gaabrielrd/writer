# ADR 0282: Linhagem lógica e captura reautorizada de contratos/fichas

Status: leitor interno local; integração e validação pendentes.

## Contexto

Um ID de artefato por versão não informa qual ficha está ativa nem quais revisões pertencem à mesma ficha. Fontes externas podem ser revogadas sem mudar a raiz do livro alvo. Aliases nativos de escopo também podem expressar papéis diferentes para a mesma entidade.

## Decisão

Acrescentar linhagem lógica current/version a contratos e fichas, com ID portátil próprio e remapeamento por novo livro. Conferir unicidade de cabeça/revisão, contrato atual único e tipo de ficha entre versões. Não inferir cabeça de registros sem linhagem.

Projetar somente campos próprios salvos, datas e referências lógicas. Preservar origem de universo desconhecida como null/unavailable, sem outro vínculo. Condensar somente aliases exatamente equivalentes; preservar papéis e observações diferentes aceitos na origem.

Ler metadata/partes por transações reautorizadas, ligadas à raiz, marcador privado e identidade nativa do item. Revalidar as fontes e sua prova em cada parte/rechecagem. Retornar alias sem bytes somente quando a cabeça e a versão imutável forem coerentes. Manter leitor interno até completar todas as famílias e restauração.

## Consequências

A cópia pode preservar a ficha atual e suas versões sem ativar jobs antigos. Texto próprio salvo continua disponível com referências indisponíveis. Caches derivados não adotados exigem outro protocolo; o leitor atual não os exporta. Provas privadas não entram no arquivo e não autorizam materialização.

Ver [incremento 34](../tasks/producao-literaria/34-captura-de-contratos-e-fichas.md). Nenhum produtor/callable novo ou teste executado.
