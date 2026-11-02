# P3 — arquivo nativo de campanha por fluxo

- Data: 2026-10-29.
- Base: a740223; sequência de [212](212-manifesto-e-procedencia-assinada.md).
- Estado: implementação interna e checks dirigidos locais; P3/D/F2-09 e macro 8/35 abertos.

## Objetivo

Montar os bytes de todas as unidades e evidências da campanha em contêiner
próprio, com manifesto assinado ao final. Validar cadeia/framing, cada unidade
e as duas raízes antes de aceitar o arquivo. Não habilitar restauração ou
confundir integridade com autorização atual.

## Arquivos e contratos

- portableBackupContainer: encoder incremental usando os mesmos helpers de
  framing, sem mudar encode/decode legados. Start/write/finish com um frame
  limitado, proteção contra concorrência/abort e cópia antes de await.
- campaignBackupContainer: magic WRITER-CAMP com LF, versão 1 e erro próprio.
- campaignBackupAudit: callback interno onRecord opcional, capturado antes
  de await. Sem callback, preserva a auditoria metadata existente.
- Passagem capture emite cabeçalho e unidades/partes/evidências; recheck não
  emite bytes. Campos e PNG passam pelos leitores atuais com autorização.
  Releitura limitada sob demanda evita manter o projeto ou campo inteiro em RAM.
- Cada unidade tem descritor canônico, ordinal, partes até 65.536 bytes e SHA.
  Unit/data usam o mesmo ordinal, índices exatos e tamanho/hash integral.
  Omissão/indisponibilidade têm descritor sem dados. Evidências têm ordinal
  próprio e a ordem/representação definidas pela ADR 0242.
- campaignBackupAttestation: encaminhar apenas callback interno ao auditor;
  pacote assinado continua derivado da auditoria completa, sem hashes de cliente.
- campaignBackupFile: escritor com sink temporário injetado write/commit/abort.
  Commit somente depois de segunda passagem, assinatura e footer do contêiner;
  falha cancela o sink. Nenhum adaptador persistente ou endpoint neste passo.
- campaignBackupFileValidation: leitor em fluxo confere header, ordinal, tipos,
  partes, JSON canônico dos descritores/evidências, SHA/contagens/raízes, pacote
  assinado da mesma conta e footer sem bytes adicionais. Retorno limitado a
  integridade/emissão, sem grant ou ativação. Sem arrays do projeto.
- Testes Node com produção real em memória, arquivos reencadeados com payload
  alterado (não só bit flip), fontes truncadas, ordem/duplicação/omissão, assinatura,
  conta, abort, pressão de consumo e falhas do destino temporário. Fixtures antigas
  de livros/aventuras preservadas. Checks dirigidos e commit local.

## Critérios

- [x] Todas as unidades, campos, PNG e evidências cabem no fluxo e preservam bytes.
- [x] Contêiner próprio e encoder incremental preservam formatos anteriores.
- [x] Destino confirma só arquivo completo; erros/abort não confirmam parcial.
- [x] Validação confere bytes e raízes assinadas, inclusive reencadeamento malicioso.
- [x] Omissões/origem indisponível preservam próprios sem promover derivados.
- [x] Ordinais/limites/pressão de consumo e encerramento do encoder são testados.
- [x] Regressões pertinentes, checks, revisão e evidência registrados.

## Limites e sequência

Sem endpoint/UI/Rules/dependência/chave real ou escrita persistente nova.
Sinks de teste são temporários em memória; não são solução de download em RAM
para campanhas reais. Assinatura não concede acesso. Vínculos semânticos e
reauthorização atual por nascimento permanecem obrigatórios antes de restaurar.
Preparar consumidores e cleanup C4 v1–v4 antes de jobs/prosa/pins persistentes.
Validate integral no fechamento do grande bloco. Somente commits locais,
sem CI/push/deploy/subagentes.
