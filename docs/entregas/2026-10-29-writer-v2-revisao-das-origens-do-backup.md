# Writer V2 — revisão atual das origens do backup

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 214](../tasks/writer-v2/execucao/214-revisao-autorizada-das-origens.md).
- Decisão: [ADR 0244](../decisions/0244-campaign-backup-origin-review.md).
- P3/D/F2-09 e macro 8/35 abertos; somente commit local.

## Implementado

Depois de autenticar o arquivo completo, o servidor confere aventura, universo
e fichas atuais contra o nascimento exportado. Origem recriada não herda acesso;
C4 permanente impede derivados mesmo que a raiz da aventura ainda exista.
Campanha/base antigas não precisam existir para essa revisão.

As evidências passam por índice temporário com MAC por registro antes das
consultas. A revisão trabalha em páginas de até 25, com dados desprendidos,
clock global e duas passagens completas. Não há prosa ou escrita nativa.
Arquivo alterado após sua validação não consegue trocar o índice autenticado.

Próprios não são apagados nem derivados são promovidos a notas. Ausências são
explícitas. A revisão devolve só IDs/disponibilidade e prova efêmera; não ativa
restauração. Assinatura pública é revalidada ao final contra revogação de chave.

## Arquivos

- campaignBackupOriginAccess.mjs: gates atuais de nascimento/owner/C4 e clock.
- campaignBackupOriginReview.mjs: índice MAC, paginação e reconferência.
- campaignBackupFileValidation.mjs: callback provisório de evidências e
  atestação pública validada no resultado.
- campaignBackupOriginReview.test.mjs, plano, ADR, arquitetura, regras e progresso.

## Testes e validações reais

- Primeiros 21 testes novos Node passaram, saída 0, 3.591,5408 ms.
- Onze casos adicionais passaram, saída 0, 1.897,0428 ms. Um patch atômico
  inicialmente recusou uma substituição ambígua; foi reaplicado com contexto.
  A execução sem casos correspondentes não foi contada como validação.
- Dois reforços finais passaram, saída 0, 829,6082 ms.
- Campanha independente vazia passou, saída 0, 516,004 ms, preservando clock ausente.
- Total novo distinto: 35 testes.
- Regressões dirigidas: 60 testes Node passaram, saída 0, 4.161,8191 ms:
  29 de arquivo e 31 de assinatura. Total distinto deste incremento: 95 testes.
- Casos incluem fonte removida/recriada, troca de dono, C4, legado, lore local/
  token, omissão exportada, ausência de IDs antigos, arquivos inválidos sem
  consultas de origem/clock, alteração/troca/repetição/falta no índice, registros
  de outra revisão, fonte mutável, clock recriado, revogação de chave, métodos
  capturados, sparse/custom iterator, paginação e falhas/abort/limpeza.
- Cenário read-only recusa escrita e leitura integral de documentos; máscaras
  não incluem nome/título/content/details/body. Prova/decisões não revelam prosa
  ou tokens. Banco permaneceu igual antes/depois.
- Lint inicial encontrou uma inicialização sem uso; foi removida. Lint dos
  quatro arquivos passou depois da correção, saída 0.

## Limites e reprodução

Índice e chaves de teste vivem em memória; nenhuma chave persistente ou recurso
do projeto foi criado. O índice real ainda precisa de adaptador privado, cleanup
e retomada. O MAC não substitui autenticação do arquivo nem sua assinatura.

Reproduzir com Node em campaignBackupOriginReview.test.mjs. Todos os testes
usam produtores nativos e arquivos assinados reais sobre banco/bucket simulados,
com criptografia Node. Não provam concorrência ou credenciais reais.

A prova é vinculada à cadeia validada e à observação atual, não ao conteúdo de
um source que mudou depois. Vínculos semânticos completos, materialização,
reautorização por unidade/ativação, C4, persistência/retomada e UI/ciclo seguem
pendentes. Não há endpoint, interface, Rules ou dependência nova.

Validate integral permanece no fechamento do grande bloco P3. Frontend de
produção não mudou; typecheck/build/navegador não foram repetidos.
Sem CI/push/PR/merge/deploy.

## Revisão final e próximo contrato

Lint final dos quatro arquivos de código, sintaxe, arquitetura e check:docs
passaram, saída 0. A revisão conferiu MAC por posição, autenticação de toda a
página, contagem completa, mascaramento, C4, nascimentos e descarte. Nenhum
bloqueador pendente no recorte de origens derivadas.

Foi identificada uma lacuna para o próximo incremento: universeId organizacional
da raiz não é necessariamente o universo da base e ainda não tem evidência própria
de nascimento no arquivo v1. Ele não pode ser religado por ID solto. O contrato/
compatibilidade desse vínculo será implementado antes da materialização, sem
declarar essa validação concluída aqui.
