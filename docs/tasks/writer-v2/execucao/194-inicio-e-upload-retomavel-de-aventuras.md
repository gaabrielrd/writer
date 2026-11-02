# P2 — início e upload retomável de aventuras

Base: 285ff28. Sem subagentes, CI, push ou deploy.

## Descoberta e objetivo

Backend já oferece start/resolveStart/get/list/append com contrato próprio.
Fingerprint usa domain writer-adventure-restore-v1 e target restore-a-;
não usar o schema/action/target dos livros. Chave nasce atomicamente e keyId
não aparece no progresso; sua primeira obtenção é HTTP privado separado.
O controlador/journal de preparação já existe, mas falta iniciar e alimentar
uma restauração e recuperar início incerto sem duplicar projeto.

## Requisitos e proposta

- Descriptor fechado writer-adventure-archive v1, mínimo 16 bytes, tamanho
  seguro e até 0xffffffff blocos de 65536. Intent inicial metadata própria,
  normalizada/fixa, com UID/operação/source/reviewHash. Hash canônico compatível
  com o servidor; IDs de alvo/bloco próprios e determinísticos.
- Leitor do job/resultado/página confere fonte, alvo derivado, identidade/
  revisão, estados/views/counters/datas e não exige keyId público inexistente.
  Leitor de metadata de preparação admite identidade sem keyId; driver/journal
  seguem exigindo contexto privado completo, sem fabricar chave fictícia.
- Bootstrap IndexedDB metadata, sem arquivo/nome/prosa/credenciais, namespace
  e chave próprios por UID/operação. Codec fechado, stamp UUID e CAS do registro
  inteiro, captura antes de await, listagem paginada por conta. Falha/corrupção
  preserva tentativa; sem fallback localStorage/plaintext de conteúdo.
- Sessão persiste início antes de start; resposta perdida mantém mesmo ID.
  Resume repete payload exato; resolve para cancelamento envia fingerprint
  original e aceita fence ou job confirmado. Job confirmado exige protocolo
  separado para cancelar; não fingir que já foi cancelado.
- API contextual com cinco métodos explícitos; captura/valida entrada antes
  de I/O, Firebase tardio e conta/guard em awaits. Helper comum interno da
  aventura mantém allowlist de transporte/preparação, região e timeout.
- Upload usa snapshot Blob nativo imutável, hash completo em leituras de até
  65536 antes do primeiro append e SHA/Base64 de cada bloco. Não carregar
  arquivo inteiro, persistir seus bytes ou substituir fonte em andamento.
- Mesmo pedido pendente é repetido exatamente após resposta incerta; após
  recarga, get e arquivo com o mesmo SHA permitem retomar no próximo bloco.
  ID de bloco determinístico e recibo/contadores/estado/revisão conferidos.
  Arquivo diferente, guard/conta inválidos, recibo estranho ou estado terminal
  impedem novo envio e preservam job. Não avançar preparação/ativar no upload.
- Retorno/start/lista não é grant nem prova de autorização de lore/ativação.

## Arquivos e sequência

1. TransferContracts/TransferJob/TransferCallables; helper SDK interno compartilhado
   com PreparationCallables, validadores de ID/UID próprios reutilizáveis.
2. MetadataStore/BootstrapStore/StartSession e UploadDriver próprios; exports.
3. Testes dirigidos para fingerprint/alvo real, codecs/paginação/CAS, respostas
   perdidas/fence, bloco/arquivo/bytes/contas/guard/recibos e regressões pertinentes.
4. Integração com serviços reais e IndexedDB/Blob no browser isolado: início
   incerto/recarga, upload incerto/retomada, arquivo errado e privacidade.
   Não usar conta ou dados reais nem alterar o browser do usuário.
5. Tipos/lint/arquitetura/bundle/smoke/revisão/docs/evidência.
   Rodar validate integral ao fechar 189–194, conforme orientação do operador;
   corrigir falhas reais sem reduzir cobertura. Commit local com hooks.

## Aceites

- [x] Bootstrap/início/resolve preservam identidade e dívida após falha.
- [x] Upload confere arquivo e blocos, retoma sem duplicar ou trocar bytes.
- [x] DTOs/transporte próprios e guard/conta/captura/CAS comprovados.
- [x] Testes dirigidos/browser/validate local, revisão/docs e commit.

Não escopo: inspeção/revisão de arquivo na UI, ações de ciclo de vida/ativação/
cancelamento/mídia/coleta, interface/roundtrip completo, P3/D/gates.
P2/F2-09 e macro 8/35 continuam abertos.

## Resultado

102 casos distintos nas seleções dirigidas e dez verificações Chromium
positivas. Validate integral 189–194 verde em 1521,77 s: 4567 frontend,
90 scripts, 3772 Functions, cobertura/391 módulos/tipos/build/smoke.
Hashes de código preservados. A
[evidência](../../../entregas/2026-10-28-writer-v2-inicio-e-upload-retomavel-de-aventuras.md)
registra testes, limitações e a tentativa inicial de módulo ainda sem export.
Somente commit local; UI/efeitos/roundtrip e demais P2/P3/D continuam pendentes.
