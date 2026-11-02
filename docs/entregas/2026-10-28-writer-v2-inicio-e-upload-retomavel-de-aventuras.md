# Writer V2 — início e upload retomável de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: 285ff28.
- Plano: [194](../tasks/writer-v2/execucao/194-inicio-e-upload-retomavel-de-aventuras.md).
- Decisão: [ADR 0216](../decisions/0216-adventure-restore-start-upload-recovery.md).
- Fechamento técnico local: bloco 189–194.

## Resultado

A camada cliente inicia uma restauração com metadata persistida antes de
enviar, repete início incerto com a mesma identidade e resolve um início
desconhecido por fence. Confirmar um job existente não o cancela.
Bootstrap é separado por conta/operação, com codec fechado, stamp/CAS e
paginação; não armazena arquivo, nome, prosa ou credenciais.

Upload verifica SHA completo de snapshot Blob nativo, lê no máximo 65536 bytes
por vez e confirma bloco/contadores/estado antes de avançar. Resposta incerta
repete bytes/ID exatos; após recarga e nova seleção do arquivo, o job remoto
determina o próximo offset. Arquivo errado não substitui o job nem envia bytes.
Preparação/ativação não são acionadas pelo upload.

Descriptor, fingerprint, alvo e IDs são próprios da aventura. Metadata pode
ser lida antes de obter keyId privado; o journal/driver de preparação mantém
sua exigência de contexto privado completo. O helper SDK interno centraliza
allowlist/conta/guard/região/prazos para preparação e os cinco métodos de
transferência, com captura de input antes do await.

Oito serviços novos, quatro serviços/barrel existentes ajustados e cinco
arquivos de teste/helper. Sem dependência, backend/Rules/índice, secret/env novo
ou interface nova. Inspeção/revisão de UI e efeitos posteriores continuam
pendentes; esta entrega não anuncia restauração disponível em produção.

## Testes dirigidos

Primeira seleção: **34/34 em três arquivos**, **1,75 s**, para contratos/
sessão/upload. Seleção de transporte e regressões afetadas: **68/68 em três
arquivos**, **1,81 s**, incluindo 17 casos do transporte novo e 51 regressões
de preparação. São **102 casos distintos** nas duas seleções, não uma rodada
única; todos voltaram a ser cobertos no validate integral.

Cobrem compatibilidade de fingerprint/target com o servidor, descriptor/codec,
registro congelado, origem/counters/paginação, início perdido/fence/CAS/guard,
arquivo/blocos/ACK, retomada após reload, identidade capturada e cinco métodos
explícitos. Resolver início já criado preserva estado uploading, sem fingir
cancelamento. A validação da fonte recusa formatos de livro ou versão estranha.

Lint dirigido encontrou duas coerções de tipo redundantes; removidas sem
mudança no JavaScript. Lint/arquitetura/docs/format dirigidos passaram antes da
suíte completa. Nenhuma falha de teste do produto foi contornada ou enfraquecida.

## Chromium com arquivo nativo

**10/10 verificações**, **717 ms**, Chromium **153.0.8010.12**. Contexto isolado,
IndexedDB/Blob/Web Locks/WebCrypto reais e arquivo .writer de teste com cena/
texto, **187027 bytes em três blocos**. Serviços e handler privados reais usam
banco transacional de teste com timestamps simulados; HTTP passa por ponte de
mesma origem restrita ao teste e autorização sintética.

O cenário confirmou:

1. Inspeção local real do arquivo, com relatório content-only.
2. Quota injetada no put nativo impede envio do início.
3. Resposta perdida do início conserva somente metadata, sem nome/arquivo/chave.
4. Recarga repete o mesmo início, sem duplicar job ou exigir keyId público.
5. Resposta perdida do append confirma apenas um bloco.
6. Após outra recarga, arquivo alterado de mesmo tamanho não envia bytes.
7. Arquivo correto retoma o offset confirmado e completa o stream exato.
8. Grant privado permite handoff ao journal/driver de preparação cifrada.
9. SHA completo conferido pelo servidor corresponde à fonte, sem ativação.
10. Fence de início ainda não enviado impede a criação por pedido atrasado.

A primeira tentativa falhou na linkagem de módulo por export ausente no módulo
servido. A conferência posterior encontrou o export no disco e na resposta
HTTP do Vite; a reexecução passou sem ajuste do produto ou reinício do dev server.
Browser/contexto/servidor do teste foram encerrados. Nenhuma sessão/dado do
navegador do usuário foi utilizado.

O teste não usa Firebase SDK/Auth/App Check reais no navegador nem Firestore/
Storage remoto. O adaptador SDK tem testes dirigidos com mocks; o bridge
exercita os serviços/contratos reais em ambiente de teste. Quota é injetada
sobre transação nativa, não teste de disco cheio.

## Validate integral local do bloco 189–194

**npm run validate terminou com exit 0 em 1521,77 s**. Rodada única, com
VITEST_MAX_WORKERS=2, sem reinício por silêncio ou demora. Os **17 hashes de
código** foram conferidos antes/depois; nenhum código mudou durante a execução.

- **4.567 testes frontend em 347 arquivos**, **795,61 s**, todos positivos.
- Cobertura **89,52% statements / 85,58% branches / 90,68% functions /
  92,73% lines**; limites **85/75/90/85** preservados.
- **90 testes de scripts**, **19.068,557 ms**, sem falhas/skips/cancelamentos.
- **3.772 testes Functions**, **403.074,8865 ms**, sem falhas/skips/cancelamentos.
- Sintaxe de **391 módulos Functions**, skills/arquitetura/docs/styleguide,
  formatação e lint global positivos.
- Typecheck, bundle de **3028 módulos em 2,26 s** e smoke positivos.

Build emitiu avisos de chunks grandes/imports dinâmicos sem separação.
O código novo ainda não possui consumidor de interface; o teste Chromium o
importa pelo Vite. Build comprova composição atual, não uma UI nova.
Este fechamento sucede o de 186–188 e inclui os transportes/recuperação e
serviços cliente de 189–194; não conclui P2 ou F2-09 integralmente.

## Revisão e continuidade

Conferidos domínios/IDs/fingerprint, metadata sem segredo, persistência antes
do envio, fence sem cancelamento fictício, Blob/SHA/captura, ACK/guard e
ausência de método escolhido pelo payload. Documentação final foi atualizada
após o validate e recebe nova conferência de links/formato/diff.

UI de inspeção/revisão, efeitos de ativação/cancelamento/mídia/coleta,
interface/roundtrip completo, P2/P3/D/F2-09, fases 3–5 e gates humanos/
comerciais permanecem abertos. Macro 8/35 inalterada.
Sem CI, push/PR, merge/deploy ou subagentes. Somente commit local.

## Auditoria final

Escopo final: 25 arquivos, sendo 17 de código/testes; os 17 hashes continuam
iguais aos validados. Nenhum marcador de segredo identificado, arquivo .env,
artefato maior que 5 MiB ou CR nos arquivos da entrega. Checkout E preservado
limpo em 522ccaa; dev server /studio respondeu HTTP 200. Conferência final de
formatação, links e diff precede o commit local com hooks normais.
