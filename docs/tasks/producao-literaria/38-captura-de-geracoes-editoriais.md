# Incremento 38 — captura interna de gerações editoriais

## Critérios e limite

Capturar solicitações e resultados nativos de planejamento, auditoria de ficha e
inferência de contrato, preservando entradas próprias e aplicando a mesma regra de
visibilidade do leitor existente. Não transformar resultado em ficha/contrato
ativo, nem transportar controles, credenciais ou autorização de origem.

A família interna `generation`, em `literaryGenerations`, eleva o capturador a
quatorze famílias. O leitor não foi registrado como callable. Produtor do pacote,
upload e restauração editorial v2 continuam fechados.

## Gate nativo compartilhado

`readLiteraryAICaptureContext` centraliza a conferência já usada pelo leitor de
`literaryAI`: recaptura o contexto pelas APIs nativas e compara o proofToken atual
com o original. O leitor público continua com os mesmos resultados para registros
nativos válidos. Captura e interface compartilham esse port interno.

Diferentemente de propostas de prosa, esse fluxo nativo oculta o resultado quando
qualquer fonte muda, mesmo que ainda exista e pertença ao usuário. O backup mantém
essa situação o rascunho e a instrução próprios, com resultado indisponível. Não
reinterpreta um proof antigo como grant histórico mais permissivo.

O capturador lê primeiro schema, estado, solicitação própria, proofToken e índice
metadata de dependências. O índice não contém labels ou corpos. Somente um resultado
done com prova original conferida pode abrir o documento da geração, incluindo seu
resultado e os documentos congelados originais. O gate pode ler fontes atuais por
seus leitores autorizados para calcular a prova; não abre antecipadamente o cache
original. Prova ausente ou schema desconhecido gera indisponibilidade explícita.
Cada parte e conferência final repetem o gate e a projeção.

Estados running, error, stale e canceled não abrem o cache derivado. Cancelar antes
do primeiro envio gera somente checkpoint planning/canceled, sem instrução, ficha
ou alvo inventados. Leituras não alteram estado, quotas, créditos ou manuscrito.

## Artefatos e semântica

O bundle interno continua limitado a 45 artefatos e 2 MiB, transferido em partes de
64 KiB. O host futuro deverá desmembrá-lo em registros editoriais individuais.

- Documento com modo, instrução, fontes de planejamento registradas e configuração pública histórica solicitada.
- Ficha do rascunho submetido, com campos literais e referências de origem.
- Checkpoint histórico de planejamento com execução desabilitada.
- Proposta de ficha somente em propose; auditoria não fabrica outra ficha.
- Proposta de contrato somente em contract, com decisões proposal/gap, sem políticas operacionais.
- Relatório de análise, achados e citações ligadas por IDs de evidência.

Entradas e propostas têm revision nula e não têm lineage. Portanto, não constituem
cabeça ativa nem versão adotada de recurso nativo. O materializador futuro deve
preservá-las como histórico privado: não pode inferir adoção pelo kind plan ou
contract. Revisões correntes adotadas continuam sob suas famílias e linhagens.
O checkpoint separa referências source de saídas subject; vínculos sobrevivem ao
desmembramento do bundle.

IDs incluem livro, nascimento do livro, nascimento nativo do pedido e papel do
artefato. Referências de planos/contrato de origem usam o nascimento registrado na
prova original, evitando relabel de uma encarnação antiga para a raiz atual.
O modelo e raciocínio são os efetivos congelados. Credenciais, budgets, recibos,
operationId, fingerprint, expectedRevision e tokens não são copiados ao pacote.

## Fontes e cobertura

O índice v1 de dependências é usado somente como metadata de procedência, nunca
como autorização. Ele preserva o universo originalmente resolvido. Se o índice
legado faltar e a solicitação usar universo implícito, a origem fica null e
unavailable; o universo atual não preenche essa ausência. Somente aliases
portáteis idênticos são consolidados; papéis e revisões explícitas permanecem.

Referências da seleção continuam tipadas, inclusive volumes. Corpos externos e
labels do snapshot não são copiados indiscriminadamente. Citações são verificadas
no documento congelado autorizado, com classificação unclassified. A inferência
de contrato continua proibida de usar draft como evidência da obra.

Esse produtor nativo não registra offsets. O capturador não escolhe uma ocorrência
por indexOf: start/end permanecem null e offsetUnit not-recorded. O contexto de
evidência admite offsetBase null somente junto da ausência dos offsets; documentId
continua sendo chave histórica do texto fornecido, não loader ou grant.

O relatório declara selected-sources e a contagem exata dos documentos fornecidos.
Essa contagem inclui contrato e rascunho, e não comprova leitura integral do
manuscrito, ato ou livro. Propostas não ganham status aprovado nem consentimento
operacional por terem sido incluídas em um backup.

## Casos preparados e revisão

Foram preparados 25 casos de Functions e três de SDK real. Cobrem proposta, auditoria,
inferência sem políticas, deriva do manuscrito e apoio, revogação global, origem
antiga/legada do universo, estados sem resultado, cancel-before-start, schema/prova
não suportados, Unicode/BOM/CRLF, partes e recheck final, citações adulteradas,
status indevido, offsets ausentes, ausência de credenciais, conta, nascimento,
remapeamento e aliases exatos.

Nenhum teste, typecheck, lint, formatter, build, browser, cobertura, validate ou
`git diff --check` foi executado neste incremento. Houve implementação e revisão
manual. A [rodada anterior](validacao-principal-b666233.md) não valida os incrementos
37 e 38; cobertura e regras integrais continuam pendentes para o fechamento.

## Próximo bloco

Capturar revisão e integração pelos seus leitores nativos, depois reader guide e
manifesto editorial de publicação; completar composição e restauração úteis,
auditoria E1–E5 e gates sobre a principal reconferida. Não houve commit, merge de
volta, push ou deploy. O objetivo integral permanece ativo, 0/5 etapas formalmente
encerradas.
