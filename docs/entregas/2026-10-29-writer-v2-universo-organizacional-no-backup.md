# Writer V2 — universo organizacional no backup

- Data: 2026-10-29.
- Escopo: [plano 215](../tasks/writer-v2/execucao/215-universo-organizacional-no-backup.md).
- Decisão: [ADR 0245](../decisions/0245-campaign-organizational-universe-provenance.md).
- Estado: incremento interno parcial de P3/D/F2-09; macro 8/35 aberta.

## Comportamento implementado

Backup novo inclui prova própria do universo organizacional, mesmo em campanha
independente ou com aventura indisponível. Esse vínculo pode diferir do universo
da base; não é substituído por ele. A projeção é fechada e nasce de metadata
nativa autorizada, sem prosa/escritas. Mudança da raiz ou do universo durante
captura/revisão impede assinatura/prova final, conforme anchors e duas passagens.

provenanceVersion 2 fixa domínio próprio e exige project único/primeiro, ID da
campanha correto e mesma versão no header/manifesto. Framing/contentVersion 1
permanecem. Arquivos v1 continuam verificáveis, inclusive com chave verify-only;
seu vínculo organizacional fica unproven, sem autorizar por ID bruto. A futura
restauração preserva próprios e exige escolha/autorização para religação legada.

Revisão retorna organizationalUniverse separadamente dos contadores derivados,
com nascimento exato e autor/deleting atuais. Ausência/owner/recriação não herdam
acesso de outro universo. Omissão na exportação não é reativada por nova origem.

## Validação efetivamente executada

- Node: campaignBackupAttestation.test.mjs, campaignBackupFile.test.mjs,
  campaignBackupOriginReview.test.mjs e campaignBackupAudit.test.mjs.
  Execução final: **138/138**, zero falhas/skips, 9469.6518 ms.
  São 21 cenários novos e 117 regressões, não a suíte integral do projeto.
- Casos: universos diferentes/independente; aventura indisponível; nascimento
  removido/recriado, owner/deleting; omissão sem nova consulta; alterações da raiz
  e do universo; v1 assinado disponível/indisponível; chave verify-only; v2
  sem project/duplicado/trocado/fora de ordem; versões inválidas/desacordadas;
  campos desconhecidos e nascimento malformado.
- Lint dos 12 módulos/testes alterados, arquitetura e links da documentação:
  passaram. Formatação do código aplicada somente ao escopo.
- Revisão manual do contrato/diff: integridade, compatibilidade e autorização
  separadas; nenhum recurso persistente ou chave real introduzidos.

Houve um erro na asserção inicial de teste ao consultar o mapa auxiliar errado
para createTime; corrigido para o snapshot nativo e cenário reexecutado. Uma
substituição textual inicial não encontrou contexto e recusou atomicamente;
nenhuma execução sem cenários foi contada como teste aprovado.

## Limites e continuação

Sem alteração de interface; typecheck/build/browser não repetidos. npm run
validate será executado no fechamento do grande bloco, conforme orientação do
operador; não declarar a definição integral de concluído satisfeita agora.
Nenhuma CI, push, PR, merge, implantação ou subagente.

Não há endpoint/exportação de campanha pela UI nem adaptador persistente real.
O arquivo próprio e evidências são assinados; conferência semântica completa dos
DTOs/vínculos, consumidores de procedência restaurada, C4 v1–v4 antes de persistir,
upload/retomada, materialização/ativação e UI/ciclo continuam pendentes.
Provas efêmeras não ativam restauração ou concedem acesso futuro.

Conferência final: sintaxe dos 12 arquivos JS, links, arquitetura, Prettier dos
20 arquivos do escopo e git diff --check passaram. Varredura dirigida não encontrou
chaves privadas literais, padrões de segredos ou artefatos acima de 5 MiB.
Master em E permaneceu limpa em 522ccaa; servidor manual HTTP 200 preservado.
