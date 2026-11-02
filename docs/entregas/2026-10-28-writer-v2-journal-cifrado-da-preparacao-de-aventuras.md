# Writer V2 — journal cifrado da preparação de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: b2f7ff2.
- Plano: [192](../tasks/writer-v2/execucao/192-journal-cifrado-da-preparacao-de-aventuras.md).
- Decisão: [ADR 0214](../decisions/0214-adventure-restore-encrypted-preparation-journal.md).

## Resultado

A camada cliente consegue preservar um pedido exato de preparação e recuperá-lo
após recarga, somente com nova autorização da mesma conta/restauração/revisão/
chave. O registro local contém envelope AES-GCM e contexto, sem texto,
credenciais, chave ou intent em claro. São 14 comandos próprios e fechados,
com checkpoint seguro e limite real de integridade.

Web Locks e CAS transacional impedem que uma aba sobrescreva outro pedido.
Leitura relê o envelope após decifrar; falhas/corrupção/revogação preservam a
pendência. Contexto/intents/envelopes são capturados antes de await. Um ACK
incerto após commit conserva a nova pendência, sem inventar rollback ou
descartar automaticamente dados.

Quatro serviços novos de contrato/cifra/IndexedDB/journal, dois testes próprios
e exports públicos. Sem import de internos de outra feature, dependência,
backend, Rules, índice, secret ou env novo.
Ainda não há controlador/dispatch, bootstrap ou interface de retomada.
Cancelamento/ativação/mídia/coleta têm efeitos com vida útil distinta e
continuam exigindo registro próprio; este journal não tenta executá-los.

## Testes dirigidos e revisão

Primeira seleção: **46/46 em dois arquivos**, **472 ms**, sem falhas/skips.
Seleção integrada: **70/70 em quatro arquivos**, **536 ms**, sendo **48 casos
de aventura e 22 regressões de livros**. Inclui os 14 comandos, recusa de
comandos de ciclo de vida/upload/constructor, AES/AAD/contextos, Base64/
envelope fechado, nonce/stamp novos, grant fraco/extraível recusado, parser
privado, igualdade integral e reautorização/CAS/concorrência/falhas.

A revisão acrescentou captura de objetos mutáveis e ACK incerto após commit.
Ajustou também o teste de separação do domínio para produzir o AAD de livro
com WebCrypto, sem importar o interno de outra feature. Retake somente do
arquivo afetado: **35/35**, **397 ms**, sem falhas/skips.
Não somar esses 35 como casos novos aos 70.

Tipos, lint dirigido e arquitetura passaram. A revisão de adaptação conferiu
imports próprios, assertion tipada e constante de IndexedDB com nome de
aventura. Formatação/documentação/diff finais acompanham o commit.
Não repetidos build/Functions/SDK/coverage/suíte completa ou regressão visual:
serviços novos, sem alteração de interface/backend/configuração. Validate
integral no fechamento do bloco do cliente conforme o operador; não atribuir
o fechamento 186–188 a este código.

## Persistência nativa

Chromium **153.0.8010.12**, contexto isolado e página vazia em origem loopback,
importando os serviços reais pelo Vite. **8/8 verificações**, **1674 ms**:

1. Gravação cifrada com IndexedDB/Web Locks/WebCrypto reais, contexto seguro,
   chave não extraível e ausência de intent/chave no registro.
2. Recarga recupera o pedido exato após nova autorização.
3. Duas abas disputam o mesmo CAS; somente uma substitui o pedido.
4. Revogação sintética de autorização recusa abertura e preserva ciphertext.
5. QuotaExceededError injetado no put nativo aborta a transação e conserva
   integralmente o pedido anterior.
6. Ciphertext corrompido é recusado e preservado.
7. CAS nativo usa contexto/envelopes capturados antes do await, mesmo que o
   chamador modifique seus objetos enquanto a abertura do banco está pendente.
8. Limpeza explícita por CAS do pedido exato remove somente esse registro.

O teste não usa conta real, não acessa a sessão/dados do navegador do usuário
e bloqueia destinos HTTPS. Provedor de autorização é sintético; a chave é
fixture de teste, reimportada em memória após reload. Quota é falha injetada
sobre a transação real, não teste de disco cheio. Não comprova Auth/App Check,
Firestore/IAM ou interface de produção. Browser/contexto próprios encerrados.

## Continuidade

Revisados domínio/AAD, comandos/limites, nonce/bytes, captura antes de await,
persistência fechada, reautorização, CAS inteiro e erro sem exclusão silenciosa.
Controlador/bootstrap/efeitos de ciclo de vida/revisão/UI/roundtrip, P2/P3/D/
F2-09, fases 3–5 e gates humanos/comerciais permanecem abertos.
Macro 8/35 inalterada. Sem CI, push/PR, merge/deploy ou subagentes.

Conferência final: 15 arquivos no escopo, LF, sem segredo identificado, .env ou
artefato acima de 5 MiB. Checkout principal permanece limpo em 522ccaa;
servidor Vite em 127.0.0.1:5173/studio respondeu HTTP 200.
