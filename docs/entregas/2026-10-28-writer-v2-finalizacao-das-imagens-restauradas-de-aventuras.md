# Writer V2 — finalização das imagens restauradas de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: b6d2f62.
- Plano: [187](../tasks/writer-v2/execucao/187-finalizacao-das-imagens-da-aventura-restaurada.md).
- Decisão: [ADR 0209](../decisions/0209-adventure-restored-media-units.md).

## Objetivo e funcionalidades

O serviço interno finaliza uma imagem restaurada por chamada, depois da ativação
real. O controle separado preserva o job congelado; imagem/outcome/controle/recibo
confirmam juntos. Consultar estado e repetir o pedido recuperam o progresso sem
novo I/O ou duplicação. A conclusão exige a leitura vazia final, inclusive sem imagens.

Desvincular preserva a cópia na biblioteca pessoal. O protocolo não altera ou
religa cenas/blocos, textos ou a raiz atual. Imagem em retirada só recebe resultado
indisponível depois do encerramento permanente no Storage, mesmo com o removedor
original ainda pendente. Recriação/origem/geração estrangeiras falham preservando
o substituto. Histórico não implica grant ou disponibilidade atual.

## Aceites

- [x] Uma imagem por unidade, final vazio, checkpoint separado e parent imutável.
- [x] Instalação provada, aceitação/retirada física e ACK revalidados.
- [x] Resultados atômicos, CAS/replay e respostas perdidas.
- [x] Detach/edições preservados, sem ressurreição na retirada/ABA.
- [x] Testes Node, corpus, sintaxe, lint e arquitetura dirigidos.
- [x] SDK integrado e revisão/documentação finais.
- [ ] Coleta da fonte, recuperação/transportes/UI/roundtrip.
- [ ] Validate integral do próximo grande bloco.

## Arquivos alterados

MediaContracts, MediaRead, MediaStore e Media novos; helper puro de journal
extraído de Artifacts preservando a leitura anterior; composição no Transfer.
Testes Node/helper, corpus real e SDK novos. ADR, arquitetura, AGENTS, plano,
índice de execução e progresso documentam o contrato.

## Testes e verificações

**59 Node distintos positivos**: rodada de **55/55** em **39.767,157 ms** totais,
mais quatro casos novos dirigidos em **3.860,197 ms**. São **18 casos novos** e
41 regressões de ativação, auditoria, contagens e biblioteca. Sem skips/falhas
nas rodadas finais; cobertura/limites não foram alterados.

Cobrem nascimento e provas nativas, vazio, um ativo por unidade, parent congelado,
rollback dos quatro writes, PATCH/commit com ACK perdido, conta/token/checkpoint/
campos fechados, missing/ABA/origem/storage/uso/controle/outcome/recibo, detach real,
retirada normal, replay histórico depois de rename/exclusão e decisões concorrentes.
Os quatro casos finais cobrem pré-ativação recusada, geração Storage estrangeira,
imagem recriada durante accept e retirada ainda aguardando I/O.

Primeiro teste falhou por selecionar usos sem campos; corrigido select explícito
de kind/adventureId/resource. Retake **2/2** passou. O corpus inicial encontrou
marker.set ausente no double durante migração da biblioteca; fixture passou a
marcar essa migração preexistente como concluída, mantendo o teste no escopo de
mídia. Retake **1/1 Vitest**, **3,64 s** totais/1,23 s de testes: arquivo real
com duas imagens, detach nativo preservado, dois PATCHes, leitores normais
liberados e originais/heads/job intactos.

Na revisão foi removido por engano o import mediaIdentity ainda usado pelo Store.
ESLint detectou no-undef; import restaurado e lint dirigido passou. O SDK iniciado
com esse código foi interrompido pelo único processo Node de teste, após conferir
ancestralidade/command line; runner encerrou o emulador no finally. Não foi
contabilizado como passe ou falha de cenário concluído. A repetição usa código corrigido.

Sintaxe das **383 Functions** e arquitetura passaram. Formatação/lint iniciais
positivos após a correção. Formatação/ESLint finais, documentação e diff verdes;
revisão final sem pendências de escopo ou imports. Scan dos 17 arquivos alterados
sem chaves privadas/tokens identificados ou .env; nenhum artefato acima de 5 MiB.

## SDK integrado

**1/1 verde**, sem skips/falhas, em **244.854,660 ms** totais; cenário em
**243.115,881 ms**. Firestore demo 1.22.0 em loopback 59972 e Storage HTTP local,
com SDK real. Confirma rollback da finalização, recuperação da aceitação já
realizada com somente um PATCH, duas chamadas concorrentes idênticas, nascimento
conjunto de outcome/controle/recibo e updateTime da imagem no mesmo commit,
createTime original da imagem, leitura normal liberada e parent/raiz intactos.

Regras negam outra conta, sidecar ao SDK e escrita do recibo. Detach e retirada
normais após aceitar preservam o replay sem novo I/O nem ressurreição; consulta
vazia final conclui em checkpoint 2. Negativa PERMISSION_DENIED esperada no log.
JVM dedicada encerrada no finally, sem serviços de produção. Não atribuir os
checks integrais de 183–185 a este código novo.

## Revisão e limites

Provas de journal não relaxam os checks do leitor de alvo anterior. Uso corrente
é conferido sem adotar recriações; o token de I/O fixa origem/geração/encarnação,
preservando mudanças legítimas de uso. Status e replay não dependem da raiz atual.

Sem endpoint/UI, dependência, índice, Rules, CI, push/PR, merge/deploy ou subagentes.
Coleta da fonte, recuperação/transportes/UI/roundtrip, P2/P3/D/F2-09, fases 3–5
e gates humanos/comerciais permanecem abertos. Macro 8/35 inalterada.
Validate integral fica no fechamento do próximo grande bloco.
