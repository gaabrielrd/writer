# ADR 0194 — Estrutura privada da aventura restaurada

Data: 2026-10-27. Status: aceita para incremento interno.
Base: planos 170–172 e ADRs 0192/0193.

## Decisão

advanceAdventureRestoreStructure prepara documentos nativos sob a raiz reservada,
que permanece mínima e sem ownerId. A definição da raiz fica em preparedRoot/current,
no job privado. Studio, Functions autorais e Rules continuam recusando o projeto.

O leitor passa a oferecer findResource: o índice privado aponta ao ordinal da
unidade, com contexto/operação/nascimento/hash e unitHash conferidos. Sua prova
inclui índice, item e fonte; o consumidor aguarda verify(tx) na transação da escrita.
Isso permite juntar cabeçalho/corpo ou parte/controle sem varrer todo o arquivo.

Partes, controle sem parte, cenas/blocos com corpos e workProgress são preparados
na primeira passagem até o manifesto de recursos. Demais recursos conservam o
bookmark para a próxima passagem. Cada cabeçalho de cena/bloco nasce com o corpo
correspondente, texto exato, hash/bytes/contagem principal recalculados e revisão 1.
Audiência/arquivo/ranks/referências mapeadas e datas autorais presentes são mantidos.

O controle de progresso tem countReady false. Agregados de grupos/blocos e índices
ainda serão reconstruídos. structure-ready marca somente o término desta passagem;
não autoriza ativação ou consumo autoral do projeto.

## Prova dos documentos e limpeza

Cada target possui journal determinístico pelo endereço relativo fechado, sem
caminhos arbitrários. Targets/journals/checkpoint/recibo são atômicos. Nascimento
comum ao criador e última atualização ligada a operação imutável, efeitos e hash
protegem o documento. Documento ou filho inesperado não é adotado pelo stager.

Cleanup usa metadata nativa para conferir corpos grandes antes de removê-los,
sem abrir sua prosa. Confere contagens e namespaces finais, removendo target e
journal juntos. Antes de descartar o índice de validação, confere os namespaces
dos cabeçalhos derivados da fonte, incluindo aqueles ainda não criados: corpo/
planejamento/referência estrangeiros impedem certificação e não são apagados.

O registro de cleanup inclui stagingArtifacts/preparedRoot para jobs antigos
também; ausência de metadata não autoriza adotar um órfão. A reserva/raiz mínima
aposentada permanece. Essa prova por etapas não é snapshot atômico contra mutações
administrativas fora do protocolo, nem varredura de namespaces arbitrários.

Novas famílias/filhos exigem estender endereços, prova e limpeza antes de escrever.
O protocolo atual permite somente os targets estruturais desta entrega. Um futuro
atualizador deve provar a versão anterior e manter o criador original ao registrar
a nova operação/hash; não alterar cabeçalho por fora do journal.

## Compatibilidade

Usar o orçamento nativo de 800.000 bytes de texto e 900.000 bytes JSON por documento.
Arquivo semanticamente válido pode exigir revisão de representabilidade nativa.
Unidade incompatível falha explicitamente sem truncar ou salvar metade do par;
fonte e checkpoint anterior permanecem, com cancelamento disponível.

Sem endpoint/ativação/Storage/biblioteca/UI. Recursos restantes, origens externas,
histórico/draft em versão separada, contadores/audit e recuperação ainda são gates.
