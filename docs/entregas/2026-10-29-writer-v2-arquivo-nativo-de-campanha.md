# Writer V2 — arquivo nativo de campanha por fluxo

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 213](../tasks/writer-v2/execucao/213-arquivo-nativo-de-campanha.md).
- Decisão: [ADR 0243](../decisions/0243-campaign-native-backup-file.md).
- P3/D/F2-09 e macro 8/35 abertos; somente commit local.

## Implementado

O servidor consegue montar um arquivo de campanha com próprios, base congelada,
campos, PNG, variantes/âncoras e evidências. O contêiner tem assinatura de
formato própria e termina com manifesto assinado e footer. O destino temporário
só recebe confirmação após a segunda passagem nativa e o encerramento completo.

Um leitor separado valida os bytes de cada unidade, cadeia/ordem/limites,
raízes de conteúdo/evidências e assinatura da mesma conta. Arquivos adulterados
e reencadeados são recusados. Origem indisponível preserva próprios com omissões;
campos vazios, BOM e Unicode continuam literais. Integridade não concede acesso
atual nem habilita restauração.

Encoder incremental reutiliza os helpers do framing neutro. Formatos anteriores
de livros/aventuras permanecem byte a byte iguais aos vetores existentes.
Não foi criado adaptador persistente ou habilitado download na interface.

## Arquivos

- portableBackupContainer.mjs: encoder incremental adicional.
- campaignBackupContainer.mjs e campaignBackupFileRecords.mjs: formato/gramática.
- campaignBackupAudit.mjs e campaignBackupAttestation.mjs: saída interna opcional.
- campaignBackupFile.mjs e campaignBackupFileValidation.mjs: destino e validação.
- campaignBackupFile.test.mjs, plano, ADR, arquitetura, regras e progresso.

## Testes e validações reais

- Primeira suíte nova: 22 testes Node passaram, saída 0, 2.560,0421 ms.
- Mais três cenários passaram, saída 0, 729,1433 ms. Foram executados somente
  os casos adicionados: dados próprios completos, legado e campanha vazia.
- Mais quatro casos dirigidos passaram, saída 0, 816,4542 ms: intenção/conta antes
  de I/O, dois ataques que refazem hashes/raízes/cadeia e JSON não canônico.
- Total novo distinto: 29 testes.
- Regressões dirigidas: 81 testes Node passaram, saída 0, 2.592,0991 ms:
  20 de contêiner de livro, 8 de aventura, 22 da auditoria e 31 de assinatura.
- Total distinto neste incremento: 110 testes Node positivos.
- Casos incluem equivalência do encoder, cópia antes de await, concorrência/
  abort, PNG e lore multichunk, todas as famílias próprias e controles omitidos,
  vínculos S3, âncora antiga, origem indisponível, vazio, falha de escrita/commit,
  captura alterada, pressão de consumo e intenção/métodos desprendidos.
- Ataques reencadeados alteram dados, hash de descritor, nascimento, ordem,
  partes, omissão/duplicação, propriedade extra e manifesto. Truncagem, falta/
  sobra de footer, conta incorreta, outro magic e mudança de tamanho recusam.
- Arquivo já emitido continua validável após remover campanha/bases/origem;
  o retorno não afirma autorização atual.
- Lint inicial dos oito arquivos de código passou, saída 0.

## Limites e reprodução

Os testes usam produtores nativos, PNG e buckets/banco em memória, com chaves
efêmeras. O sink de teste acumula bytes para conferir o arquivo; não é o
adaptador de download para campanhas reais. A produção trabalha por partes,
página/unidade atual e hashes, sem array ou texto do projeto inteiro.

O sink injetado deve armazenar bytes fielmente e implementar commit/abort do
temporário. O source é emprestado e seu host mantém os handles. Nenhum arquivo
do usuário foi criado, alterado ou apagado por esses testes.

Reproduzir com Node em campaignBackupFile.test.mjs. Ainda faltam consumidores
de vínculos/autorização atual por nascimento, cleanup C4 v1–v4, persistência/
retomada, restauração e UI/ciclo. Não há endpoint, interface, chave real, Rules,
dependência ou recurso persistente novo.

Validate integral fica para o fechamento do grande bloco P3. Não houve mudança
de frontend de produção; typecheck/build/navegador não foram repetidos.
Sem CI/push/PR/merge/deploy ou credenciais reais.

## Revisão de integridade e escopo

Dois ataques atualizam os bytes/nascimento, seus hashes, a raiz correspondente
no manifesto e toda a cadeia do contêiner. Ambos são recusados especificamente
por assinatura inválida. Isso distingue a conferência criptográfica de uma
mera recusa por SHA local ou footer malformado.

Intenção e conta são conferidas antes de I/O; source/sink têm métodos capturados.
A revisão preservou a responsabilidade do host sobre handles e armazenamento
temporário real. Não foi criada limpeza persistente fora de C4 nem habilitada
restauração a partir da prova de integridade.

## Checks finais locais

Lint dos oito arquivos de código, sintaxe dos oito arquivos, arquitetura e
check:docs passaram, saída 0. Revisão conferiu manifesto/cadeia, comparação
independente das raízes, autorização dos leitores usados na publicação e
ausência de novo produtor persistente. Nenhum bloqueador pendente neste
incremento interno. A validação integral e os consumidores de restauração
continuam nas etapas seguintes.
