# Writer V2 — universo original da aventura restaurada

Data: 2026-10-27. Base: cd2050d.
[Plano 177](../tasks/writer-v2/execucao/177-universo-original-da-aventura-restaurada.md)
e [ADR 0199](../decisions/0199-adventure-original-universe-revalidation.md).

## Incremento técnico local

A restauração prepara a religação somente ao universo original próprio e ainda
disponível. Compara identidade nativa de criação até nanos; universo recriado,
ausente, alheio, público de terceiro ou deleting resulta sem vínculo. None e
unavailable do arquivo não consultam universo nem adotam coincidência de ID.
A inspeção neutra também atende livros, preservando sua interface e autorização.

A unidade fonte autenticada, o candidato e a definição privados são provados.
Seleção, journals, definição privada, recibo/checkpoint e universe-ready confirmam
juntos. Não há alteração do universo, contador ou lore global na preparação.
Draft/histórico mantêm seus dados e metadados; o projeto continua sem ownerId e
countReady false, indisponível aos clientes. Não foi adicionado endpoint.

O plano para a futura ativação relê job, fonte e provas, incluindo o sourceToken
do journal da seleção, e revalida acesso/identidade. Retorna o universeId atual
e o commit nativo strict: o chamador deverá usar o ID retornado na raiz e
confirmar raiz/vínculo/contador atomicamente. Os harnesses dos testes verificam
essa composição; a ativação real ainda não foi implementada.

## Testes e revisão

54 Node dirigidos positivos em 7.492,856 ms: 20 novos, 20 regressões do universo
de livros e 14 da finalização de draft. Cobrem none/available/unavailable, ID
recriado e diferença de um nano, acesso próprio/terceiro, mudanças legítimas,
revogação e retorno de autorização da mesma origem, rollback/replay/concorrência,
contadores/uso inconsistentes, alteração de fonte/raiz/candidato/journal e
cleanup que preserva o universo. Incluem draft real preservado e erro tipado
para nascimento nativo corrompido.

A revisão identificou campos de outcome privados que poderiam ficar ocultos na
projeção de uma fase antiga: validação de metadata agora os recusa explicitamente.
O caso de metadata e o draft real foram conferidos em seleção dirigida. A prova
final também passou a exigir sourceToken igual ao journal da seleção; somente
esse teste afetado foi repetido, positivo em 356,536 ms. Quatro casos positivos/
negativos afetados pela proteção final passaram depois em 993,974 ms totais.

Nos testes iniciais, expectativas incorretas tentavam ler historyStartIndex pela
view pública e confundiam createdAt do job com identidade do universo. Os
fixtures foram corrigidos para consultar o job privado. O caso de fonte foi
ajustado para adulterar a unidade exata do universo, em vez de uma não consumida.

## SDK Firestore real

A primeira chamada teve um caso positivo de rollback/recriação em 44.942,380 ms
e uma expectativa incorreta no cleanup: esperava remover a raiz, mas o contrato
mantém um marcador aposentado contra reutilização do ID. Foi corrigida a
expectativa e acrescentadas verificações de preparedRoot/stagingArtifacts vazios.
Essa chamada não é declarada suíte verde.

A seleção seguinte terminou positiva: dois SDK em 91.909,278 ms no Firestore
1.22.0 demo local. O caso corrigido passou em 49.605,961 ms; o novo harness de
commit atômico raiz/vínculo/contador passou em 41.354,085 ms. Confirma identidade
nativa original, seleção/recibo concorrentes, revogação antes do plano final,
negação ao dono/terceiro/anônimo e cleanup integral com marcador aposentado.
O harness prova contador +1/uso correto com a raiz, preservando lore global;
raiz já ativa é recusada pelo cancelamento. Três casos SDK distintos positivos
em seleções, sem somar a tentativa com falha como suíte aprovada. As JVMs
individuais foram encerradas pelo finally dos runners.

## Checks e limites

Passaram formatação, ESLint e sintaxe dos módulos/testes alterados, documentação,
arquitetura, styleguide e diff --check. Revisão final restrita ao escopo, incluindo
candidatos/provas/limites e tratamento de falhas. Commit local com hooks normais;
checks de escopo, LF, tamanho e marcadores de segredos antes do staging.
Sem dependências, regras de acesso, configuração de testes ou limites alterados.

Validate integral de 176 é a base anterior; não foi repetido neste incremento.
O fechamento integral do novo bloco continua obrigatório, conforme a orientação
de executar somente os testes necessários durante o desenvolvimento.
Sem CI/push/PR/merge/deploy/agentes; dev server preservado.

P2 ainda exige biblioteca de personas, mídia, agregados/audit/ativação e
recuperação cifrada/UI/roundtrip. P3/D/F2-09, fases seguintes e gates humanos/
comerciais permanecem abertos. Macro 8/35 (22,9% de tarefas), sem mudança.
