# Writer V2 — chave privada da restauração de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: 2942b47.
- Plano: [190](../tasks/writer-v2/execucao/190-chave-privada-da-restauracao-de-aventuras.md).
- Decisão: [ADR 0212](../decisions/0212-adventure-restore-private-recovery-key.md).

## Resultado e escopo

Novas restaurações recebem chave AES-GCM de 32 bytes na mesma transação do
início. O HTTP privado autentica a conta e App Check, confere identidade/revisão
e chave esperada e permite recuperar os mesmos bytes. A chave não aparece nos
29 callables, progresso, recibos públicos ou logs. Jobs antigos continuam
utilizáveis sem receber chave tardia; uma chave perdida não é substituída.

Cancelar remove a chave atomicamente. A coleta após conclusão da mídia remove
a chave na primeira unidade. Ambas usam metadados com máscara, nascimento e
imutabilidade nativos; não leem o segredo para removê-lo. Recuperação recusa
cancelamento/coleta iniciados; replay não ressuscita chave ou job.
O cliente/journal cifrado/controlador e a tela de retomada ainda não existem
para aventuras; este incremento fornece o contrato do servidor.

Dois módulos novos (chave/HTTP), composição no Transfer/index, encerramento no
Archive, efeito fechado no Store; teste Node novo, Host/Archive e SDK atualizados.
Sem nova dependência, índice, Rules ou variável de ambiente.

## Testes dirigidos

Seleção final: **271/271 Node**, sem falhas/skips/cancelamentos,
**43.879,5034 ms** totais. Inclui recuperação, Transfer, ArchiveCleanup,
Callable, Host, Activation/ActivationUniverse/Media, transporte/host/recuperação
de livros. Casos de chave conferem AES-GCM útil após recuperar, retry, ausência
de segredo nos DTOs, UID/token/revisão/keyId, entrada fechada, alteração/ABA/
documento ausente, legado, rollback nos cinco pontos do início e no cancelamento,
repetição de cancelamento e remoção mascarada sem acesso ao corpo secreto.

HTTP monta o export real e confere Auth/App Check ausentes/inválidos, método,
JSON/tamanho/UTF-8/content-type, headers privados e erro inesperado sanitizado.
Verificadores sintéticos são restritos aos testes; nenhuma opção de bypass foi
adicionada ao runtime.

A primeira rodada teve uma falha de expectativa no inventário HTTP: o SDK
representa segredos não configurados como campo ausente, não array vazio.
Corrigida a expectativa, retake **1/1**, **1.460,5264 ms** total, passou.
A seleção antes da revisão foi **263/263**, **41.520,7239 ms**.
A revisão acrescentou provas de remoção sem leitura secreta, ausência de fallback
sem máscaras e compatibilidade de outro cancelamento no checkpoint atual;
os 271 finais acima incluem essas mudanças. Não houve relaxamento de contrato
ou redução de limites de cobertura.

Sintaxe das **391 Functions**, arquitetura e ESLint dirigido passaram.
Formatação, documentação e diff finais acompanham o commit.
Não repetidos frontend/typecheck/build/validate integral: não há alteração de
interface/TypeScript; a suíte completa fica no próximo grande bloco conforme
orientação do operador. O validate de 186–188 não certifica este código novo.

## HTTP e Firestore SDK nativos

Retake final após revisão: **1/1**, **108.905,0769 ms** totais,
caso em **106.653,6887 ms**. Firestore demo em loopback **59022**, com HTTP
montando os exports reais. Confere nascimento conjunto da chave/job, recuperação
e retry, recusa a outra conta, Rules negando leitura direta mesmo ao proprietário,
pipeline mínimo até ativação/mídia/coleta e recuperação indisponível após coleta.
JVM próprio 107548 e servidor encerrados pelo runner.

A rodada anterior à mudança dos metadados também passou, **1/1**,
**107.113,041 ms** totais, loopback 64033/JVM 112888. Não é usada como prova da
implementação final. Nenhum runner foi reiniciado por silêncio ou demora.

Atestações Auth/App Check são sintéticas somente no teste; Firestore SDK,
Rules, handler e wrappers são reais. Não comprova credenciais/IAM/atestação ou
disponibilidade em produção. O fixture mínimo não tem imagens; a mídia real
continua coberta pelo bloco anterior.

## Revisão e limites

Conferidos prova de nascimento e efeito fechado, bytes/fingerprint, ausência de
criação tardia, lista de callables inalterada, HTTP separado, validação antes do
corpo, remoção transacional com máscaras explícitas, replay e job ativado
congelado. A prova por metadados autoriza remoção, não consumo de conteúdo.

Cliente/journal cifrado/UI/roundtrip, P2/P3/D/F2-09, fases 3–5, gates humanos e
comerciais e macro 8/35 permanecem abertos. Sem CI, push/PR, merge, deploy ou
subagentes. Checkout principal e servidor Vite preservados.

Conferência final: 18 arquivos no escopo, LF, sem segredo identificado, .env ou
artefato acima de 5 MiB. Ausência dos dois emuladores próprios conferida após
os runners. Checkout principal E:/Mega/dev/writer permanece limpo em 522ccaa;
Vite em 127.0.0.1:5173/studio respondeu HTTP 200.
