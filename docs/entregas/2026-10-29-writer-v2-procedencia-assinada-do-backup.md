# Writer V2 — manifesto e procedência assinada do backup

- Data: 2026-10-29.
- Estado: incremento interno local do [plano 212](../tasks/writer-v2/execucao/212-manifesto-e-procedencia-assinada.md).
- Decisão: [ADR 0242](../decisions/0242-campaign-backup-signed-manifest.md).
- P3/D/F2-09 e macro 8/35 abertos; somente commit local.

## Implementado

O servidor consegue emitir um manifesto compacto após auditar de novo a
campanha completa. A emissão não recebe raízes ou manifesto do consumidor.
Conteúdo e evidências de origem têm raízes separadas, ambas conferidas nas
duas passagens. Evidências preservam nascimento da aventura/universo/ficha,
incluindo âncora legada; não contêm prosa, credenciais ou pins Storage.

A assinatura Ed25519 cobre manifesto, algoritmo, domínio e ID de chave.
Verificação usa somente configuração confiável do servidor e a conta vinculada;
continua funcionando após excluir campanha/base antigas. Isso prova emissão,
sem conceder acesso atual ou validar o corpo de um arquivo ainda não implementado.

Chaves distinguem active, verify-only e revoked; versões públicas anteriores
não expiram automaticamente. Rotação/revogação são consultadas novamente antes
da assinatura. Nenhuma chave real foi criada, gravada ou configurada.

## Arquivos

- portableCampaignProvenance.mjs e portableCampaignManifest.mjs: projeções puras fechadas.
- campaignBackupWitness.mjs: evidências nativas de base/item/âncora.
- campaignBackupBaseContext.mjs: fatos internos de origem já autorizados.
- campaignBackupAudit.mjs: raiz de evidências nas duas passagens.
- campaignBackupAttestation.mjs: emissão nativa e verificação criptográfica.
- campaignBackupAttestation.test.mjs, plano, ADR, arquitetura, regras e progresso.

## Testes e validações reais

- Suíte nova inicial: 28 testes Node passaram, saída 0, 2.178,2963 ms.
- Três casos adicionais passaram, saída 0, 559,1129 ms. A primeira tentativa
  desses casos encontrou um fechamento incorreto no callback de teste; foi
  corrigido e somente os três casos novos foram repetidos.
- Total novo distinto: 31 testes. Incluem replay independente da raiz das
  evidências, origem indisponível, encarnação recriada, âncora legada, remoção
  de campanha/base antigas, conta incorreta, adulteração de campos, algoritmo,
  domínio, chave autoassinada, alias de keyId, base64url não canônico, emissão
  futura realmente assinada, PEM, tipo de chave errado, rotação/revogação,
  cancelamento, alteração no último progresso assíncrono e lore local.
- Regressões dirigidas: 119 testes Node passaram, saída 0, 2.178,8249 ms:
  22 da auditoria, 20 de leitura da base, 26 do inventário físico da base,
  28 dos leitores de lore e 23 de imagens.
- Total distinto neste incremento: 150 testes Node positivos.
- Criptografia real executada no Node 24.21.0; chaves geradas só em memória
  durante testes. Não há chave estática de fixture nem segredo em snapshot.
- Lint inicial dos sete arquivos de código passou, saída 0.

## Limites e reprodução

Os serviços são internos. Não há download, endpoint, arquivo, ativação ou
configuração de assinatura em produção. Verificação criptográfica não comprova
o corpo do arquivo nem a disponibilidade atual da origem. Framing, cobertura
do conteúdo/evidências, reautorização por nascimento e restauração continuam
obrigatórios. Nenhum derivado foi promovido a nota própria.

Para reproduzir, executar Node no arquivo campaignBackupAttestation.test.mjs.
O manifesto e as evidências podem ser verificados sem as bases antigas, mas
os próximos consumidores ainda precisam conferir raízes e vínculos completos.
Ampliar C4 v1–v4 antes de jobs/prosa/pins persistentes novos.

Validate integral permanece para o fechamento do grande bloco P3. Não houve
mudança de frontend de produção; typecheck/build/testes de navegador não foram
repetidos. Sem CI, push, PR, merge, deploy ou credenciais reais. Não foi validado
o runtime Node 22 ou o gerenciamento real das versões de chave.

## Revisão final local

A revisão reforçou os limites de IDs antes de alocar UTF-8 e o vínculo da
âncora com seu universo/aventura. IDs Unicode no limite são preservados;
surrogate isolado e IDs maiores são recusados. O teste de surrogate inicialmente
usava um escape literal, corrigido para um caractere isolado real. Repetidos
somente os testes afetados; projeção, âncora legada e lore local passaram.

Lint final dos sete arquivos, sintaxe, arquitetura e check:docs passaram,
saída 0. Revisão conferiu chaves confiáveis, algoritmo/domínio/keyId fixos,
fechamento dos DTOs e separação entre emissão, arquivo e acesso. Nenhum
bloqueador pendente neste incremento interno. Operação real de chaves e os
consumidores de arquivo/autorizações continuam pendentes.
