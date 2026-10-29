# P3 — manifesto e procedência assinada

- Data: 2026-10-29.
- Base: f88077c; sequência de [211](211-auditoria-conjunta-do-backup.md).
- Estado: contratos internos e checks dirigidos locais; P3/D/F2-09 e macro 8/35 abertos.

## Objetivo e contratos

Produzir manifesto compacto e prova de emissão pelo servidor após a auditoria
nativa completa. A verificação não depende da campanha/base antigas continuarem
no banco. Evidências de nascimento da aventura/universo/ficha mantêm a encarnação
da origem; não substituir pela entidade atual recriada sob o mesmo ID.

Separar integridade/emissão de autorização atual. Assinatura não concede
ownership, compra ou acesso. Corpo e evidências precisam conferir as raízes
assinadas antes de ativar uma restauração. Próprios continuam recuperáveis
quando os derivados forem omitidos por acesso indisponível.

## Arquivos e sequência

- portableCampaignProvenance.mjs: projeções fechadas puras de evidências de base,
  item e âncora, com IDs/nascimentos exatos; sem tokens, paths Storage ou prosa.
- campaignBackupBaseContext: expor internamente os fatos de origem já autorizados.
- campaignBackupWitness.mjs: leitores internos sob fonte/item/variante atuais.
- campaignBackupAudit: acumular raiz de procedência separada e repeti-la nas
  duas passagens, sem array do projeto; conteúdo lógico v1 é preservado.
- campaignBackupAttestation.mjs: manifesto fechado e Ed25519 com chave injetada
  exclusivamente no servidor; emissor chama o auditor real, nunca certifica
  hash/manifesto do cliente. Verificador usa somente chaves públicas confiáveis.
- Chaves versionadas: active assina/verifica; verify-only só verifica; revoked
  recusa emissão/procedência. Rotação mantém chaves públicas anteriores sem
  prazo automático. Não gerar/configurar segredo real nem implantar neste passo.
- Payload canônico de formato fixo e domínio próprio, algoritmo fixo, assinatura
  base64url canônica, conta vinculada por hash e timestamp seguro. Sem URL de
  chave escolhida pelo arquivo, algoritmos alternativos ou validade de acesso.
- Testes com criptografia Node real e chaves efêmeras em memória; emissão rica,
  origem indisponível, corrupção/conta/algoritmo/rotação, encarnação recriada,
  remoção de campanha/base antigas, abort e prova sem grant.
- Docs/ADR/evidência e commit local, somente testes dirigidos.

## Critérios

- [x] Evidências vêm dos gates nativos e preservam nascimento, sem prosa/pins.
- [x] Raiz de procedência participa das duas passagens de todas as famílias.
- [x] Emissão exige auditoria nativa e não aceita hash/manifesto do consumidor.
- [x] Verificação detecta corrupção/conta/algoritmo/chave e dispensa IDs antigos no banco.
- [x] Rotação distingue assinatura/verificação/revogação sem segredo no arquivo.
- [x] Limites de autorização atual, cobertura do arquivo e ausência de implantação são explícitos.
- [x] Testes/checks direcionados, revisão e evidência registrados.

## Limites e sequência

API interna, sem endpoint/UI/persistência/Rules/dependência nova. O registro de
chaves de produção e sua operação não estão configurados nem validados.
Verificação criptográfica não valida sozinha o corpo/framing, a raiz das evidências,
a disponibilidade atual de cada origem nem uma restauração. Estes consumidores
permanecem obrigatórios antes de habilitar exportação/ativação.

Seguem framing/arquivo e consumidores de procedência/restauração. Ampliar C4
v1–v4 antes de qualquer produtor persistente de jobs/prosa/pins. Validate integral
no fechamento do grande bloco P3. Somente commits locais, sem CI/push/deploy/subagentes.
