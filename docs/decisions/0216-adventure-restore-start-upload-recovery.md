# ADR 0216 — Início e upload retomável de aventuras

- Data: 2026-10-28.
- Estado: implementado e validado no fechamento integral local 189–194.
- Plano: [194](../tasks/writer-v2/execucao/194-inicio-e-upload-retomavel-de-aventuras.md).
- Antecedente: [0215](0215-adventure-restore-preparation-controller.md).

## Decisão

Usar descriptor writer-adventure-archive v1 e metadata fechada própria.
Fingerprint do início segue domain writer-adventure-restore-v1; alvo usa
restore-a-. Cliente compara com o contrato real do servidor, sem schema ou
cast de livro. ID de bloco determinístico inclui identidade/revisão/índice e
domínio próprio, independentemente de keyId já ser conhecido.

Leitura de metadata do job não exige keyId, ausente no DTO público.
Valida fonte, alvo derivado, token/revisão, views/counters/datas. Driver e
journal de preparação continuam exigindo contexto privado com keyId;
não fabricar chave/contexto fictício para ler metadata inicial.

Persistir início em IndexedDB writer.adventure-restore.starts/attempts,
chave [ownerId,operationId], somente schema/stamp/intent metadata. Não guardar
arquivo, nome, prosa, chave ou credenciais. Codec/CAS do registro inteiro
fixam dados antes de await; listagem filtra conta e pagina IDs.
Falha/corrupção não autorizam exclusão ou fallback localStorage.

Sessão salva antes de start. Resposta incerta conserva o mesmo ID/payload;
resume repete, resolveStart envia fingerprint original com intenção cancel.
Fence impede criação atrasada ainda desconhecida. Se job já existe, resolver
confirma esse job; cancelamento real exige seu protocolo de efeitos separado.
Remover metadata local só após outcome validado e CAS bem-sucedido.

Upload obtém snapshot Blob nativo imutável e hash completo por leituras de
até 65536 bytes antes do primeiro append. Bloco usa SHA e Base64 canônicos.
Conservar o pedido inteiro em memória após resposta incerta; repetir sem
mudar bytes/ID. Após reload, job remoto e arquivo novamente selecionado com
o mesmo SHA permitem retomar no offset confirmado, com ID determinístico.
Não persistir bytes do arquivo. Fonte diferente ou ACK inválido não substitui
o job; estados posteriores/terminais pausam sem avançar preparação/ativação.

Helper SDK interno da aventura centraliza conta/guard, região e prazos,
com lista explícita de preparação/transporte; mantém chave/efeitos fora dela.
APIs de preparação e transferência validam/capturam seus próprios DTOs antes
de chamar esse helper. Nenhum método vem do payload.

## Evidência e limites

Testes dirigidos e Chromium isolado exercitam início/upload incertos e
recarga, arquivo errado, quota, fence, digest completo e handoff ao journal
cifrado. IndexedDB/Blob/Web Locks/WebCrypto são reais; servidor usa serviços
reais sobre banco transacional com timestamps simulados. HTTP passa por
bridge de teste e autorização sintética. Não é prova de Firebase SDK no
browser, credenciais reais, Firestore/Storage remoto ou deploy.

Validate integral local verde: 4567 frontend, 90 scripts e 3772 Functions,
limites de cobertura preservados, tipos/build/smoke positivos. Resultados na
[evidência](../entregas/2026-10-28-writer-v2-inicio-e-upload-retomavel-de-aventuras.md).
Inspeção/revisão na UI, efeitos de ciclo de vida/ativação/cancelamento/
mídia/coleta, interface/roundtrip e P2/P3/D/F2-09 permanecem abertos.
Macro 8/35 inalterada; sem CI, push ou deploy.
