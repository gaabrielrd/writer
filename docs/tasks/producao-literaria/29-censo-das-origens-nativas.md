# Incremento 29 — censo de origens nativas sem índice

Estado: implementação local, revisão de fontes e testes preparados. Nenhum gate executado.
Não encerra uma etapa do plano integral.

## Problema e comportamento

O mapa anterior examinava os índices do livro, mas não provava que uma origem privada
antiga possuía índice correspondente. Um marcador incondicional mantinha todo mapa
parcial, inclusive em livro sem qualquer dado legado. Remover apenas esse marcador
confundiria ausência de índice com ausência de origem.

O novo `literaryImpactNativeAudit.mjs` substitui o marcador por um censo paginado:

1. Catálogo nativo de conversas e sua capacidade de acompanhar alterações.
2. Cabeçalhos de contextos e de seus corpos privados.
3. Cabeçalhos de conversas nativas.
4. Turnos, cabeçalhos de corpos e perguntas.
5. Recibos de aplicações nativas.
6. Conversas, mensagens e recibos do chat de capítulo legado.

São onze segmentos internos, com consultas de no máximo um documento por passo.
Não há limite arbitrário de capítulos, turnos ou páginas. A seleção do livro exige
autorização atual e seu nascimento nativo entra na prova do item. O cursor é privado,
fixa segmento/caminho e não aceita troca de conta ou coleção.

A busca inclui o catálogo privado do próprio ator para identificar origens sem escopo
comprovável. Cabeçalhos atribuídos explicitamente a outro livro ou aventura não criam
vínculos no livro selecionado. Origem sem escopo recuperável permanece como lacuna,
sem afirmar que foi consumida por aquele livro.

## Leitura, vínculo e prova

As projeções são fechadas: IDs, proprietário, escopo, estado, hashes, tokens e partes
metadata dos recibos. Perguntas, respostas, instruções, seleção de manuscrito, corpos
congelados, histórico de mensagens e credenciais não são abertos nem copiados.

Coleções de grupo são limitadas por referências do UID e paginadas por nome nativo.
A ordem de referências por segmentos e o limite UID + NUL foram conferidos na fonte
local do SDK; os testes com Firestore real precisam comprovar o comportamento antes
do fechamento. Não confiar somente no double em memória para esse contrato.

A descoberta por grupo inclui filhos cujos pais desapareceram. A motivação é que
[excluir um documento não remove suas subcoleções](https://firebase.google.com/docs/firestore/data-model).
A ordenação por segmentos consta dos [tipos do Firestore](https://firebase.google.com/docs/firestore/manage-data/data-types).

O censo cruza tokens do cabeçalho com o índice correspondente, sua origem nativa e,
quando aplicável, o pai e o recibo. A validação integral das dependências e dos manifests
continua nos leitores/verificadores canônicos já existentes. Presença de índice não
vira prova de leitura, acesso histórico ou integridade dos bytes do manuscrito.

Uma lacuna cria check metadata e associação possível, com `capture: null`, identidade
e versão desconhecidas. É uma pendência de cobertura, não uma relação de fonte
comprovada. O painel mostra causa legível e preserva a distinção entre decisão do autor
e cobertura técnica. Resolver a nota não fabrica o índice ou reduz a lacuna.

## Três passagens e estabilidade

Coleta, confirmação e censo final repetem os segmentos, hashes e nascimentos nativos.
Prova diferente, item desaparecido ou novo item interrompe a investigação como stale.
Checks, grafo, cursor e recibo do passo continuam na mesma transação. O cursor nativo
é reiniciado entre inventários/passagens e não é fornecido pelo cliente.

O registro de capacidades passou para versão 2 e inclui o schema da auditoria.
Mapas anteriores não são migrados silenciosamente: sua revisão de capacidades diverge;
consultar notas próprias, reconciliar recibos e cancelar continuam possíveis.

`literaryImpactCatalog.mjs` distingue catálogo ausente com coleção vazia de catálogo
ausente com conversas antigas. Neste último caso, retorna observação explicitamente
untracked e o censo registra a lacuna. Não inicializa catálogo, não inventa clock e não
altera o contrato estrito dos escritores de chat. Catálogo existente malformado continua
bloqueante. Mudanças nativas rastreadas continuam no fence do mapa.

Antes de habilitar em produção, os escritores atuais precisam estar coordenados e as
instâncias antigas drenadas. Escritores sem os clocks contratados não podem sustentar
uma afirmação de estabilidade. Observações untracked nunca encerram cobertura completa.

## Resultado que pode ser declarado

Sem lacunas reais, o mapa pode encerrar **o inventário das dependências registradas**.
Isso não certifica todas as origens históricas, relações implícitas, leitura integral,
qualidade editorial ou autorização de publicar. Com lacunas, encerra parcial e mostra
suas causas. A interface deixou de anunciar lacuna histórica incondicional em todo livro.

## Testes preparados e pendências

- 15 casos novos do censo: ausência real, filhos órfãos, vizinho de UID, tokens,
  recriação, índices ausentes, sidecars, catálogos e cursores.
- 3 casos do controlador completo: livro sem lacuna, inclusão tardia sem clock na
  reconferência e conversa antiga com catálogo ausente.
- 3 casos SDK nativos: limites por referência/UID e paginação, corpos/perguntas órfãos,
  catálogo antigo observado sem reparo. Rules continuam negando leitura SDK privada.
- 1 caso de interface para distinguir inventário registrado de completude histórica.

O fixture do controlador agora contém uma mensagem antiga realmente sem índice para
os cenários parciais; um parâmetro explícito permite testar livro sem esse dado. O
helper studioDb ganhou collectionGroup e cursores por DocumentReference, preservando
a comparação anterior de campos ausentes e a exigência de leituras antes dos writes.

Nenhum teste, typecheck, lint, formatter, build, navegador, cobertura ou validate rodou
neste incremento. A implementação e os limites por referência precisam dos gates
finais; não há nova rodada verde. Cobertura de funções de 90% e Rules completas seguem
obrigatórias. A rodada antiga de 5.422/86,24% não valida 24–29.

Permanecem portabilidade editorial `.writer`, restauração em nova cópia privada sem
reativação, auditoria E1–E4 e revisão integral dos aceites de E5. O objetivo mantém
**0/5 etapas formalmente encerradas**. Sem commit, integração de volta, push ou deploy.
