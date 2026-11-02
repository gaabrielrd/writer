# Writer V2 — recursos privados da aventura restaurada

Data: 2026-10-27. Base: f0a4e8c.
[Plano 173](../tasks/writer-v2/execucao/173-recursos-e-indices-da-aventura-restaurada.md)
e [ADR 0195](../decisions/0195-adventure-private-resource-staging.md).

## Implementado

A passagem interna advanceAdventureRestoreResources prepara metas/checklist,
planejamento presente, arcos/eventos/marcos e suas ordens presentes, referências
de cenas, vínculos narrativos e índices derivados. Mantém datas, strings e ranks,
remapeando referências próprias e conservando origens externas qualificadas.
Não lê corpos externos nem cria grant.

resourceIndex e contagens próprias preservam itemIndex e recibos anteriores.
resources-ready exige a passagem integral e o manifesto autenticado. A definição
da raiz permanece privada no job e a raiz mínima continua sem ownerId; esta
etapa não ativa o projeto nem acrescenta endpoint/UI. countReady permanece false;
referenceCount narrativo e agregados serão reconstruídos antes da ativação.

Updates comprovam valor/hash e versão anteriores, preservam nascimento/primeiro
criador e confirmam target/journal/recibo/checkpoint atomicamente. set sem merge
remove campos omitidos em vez de deixar um hash incompatível. Ensure somente
aceita um target próprio já comprovado e idêntico; permite preparar o arco quando
o marco aparece primeiro no arquivo. Falha não deixa metade da operação.

A limpeza admite os novos endereços e remove filhos antes dos pais em commits
separados quando uma página atravessa essa fronteira. Confere também filhos de
arcos ainda não criados. Não apaga um estrangeiro nem certifica target ausente,
alterado ou recriado. Reserva aposentada permanece. A prova cobre os namespaces
conhecidos por etapas, sem snapshot contra mutação administrativa externa.

## Testes executados

40 Node positivos em uma chamada de 8.816,202 ms: 13 novos casos de recursos,
cinco estruturais e 22 de transporte. Incluem valores nativos, índices, criador/
nascimento preservados, ordem marco/arc não nativa, 65 referências com páginas de
50, replay e concorrência, rollback/retry automático, cancelamento durante leitura,
metadata/cursor inválidos, target/journal alterado/ausente/recriado, planejamento
ausente ou acima do limite nativo, estrangeiro além dos primeiros 50 filhos e
marco órfão antes de criar seu arco. Regressões de fonte/reserva/recibos continuam.

Dois Vitest novos positivos com serviços nativos e o escritor real do Writer,
em 4,37 s totais/2,01 s de testes. O corpus tem parte, três cenas, bloco, lore
local, planejamento e duas referências narrativas; confere valores, índices,
corpos e remoção integral. O teste cria os vínculos pelos serviços reais antes
de capturar o arquivo, sem forjar o formato de livro.

Também passaram inicialmente 32 regressões de estrutura/transporte/validação
em 1.418,448 ms. Essa seleção antecede a correção da fronteira de cleanup; os
40 Node acima são a evidência posterior para o comportamento afetado.

Regressão Vitest conjunta: nove casos positivos em dois arquivos, 10,00 s totais/
7,07 s de testes, incluindo os sete casos estruturais afetados pela limpeza.

Três SDK reais distintos positivos em 677.429,091 ms no Firestore 1.22.0 demo:
65 referências e remoção completa, nascimento/criador/hash de controle atualizado,
negação de SDK ao dono/terceiro/anônimo, rollback e replay/concorrência reais,
filho estrangeiro, referência adulterada e journal recriado. A JVM própria foi
encerrada pelo finally. Um quarto SDK dirigido positivo, em chamada própria de
80.047,486 ms totais/79.111,249 ms de teste, comprova a fronteira com menos de 50
journals: filhos e pais cabem na mesma página consultada, mas são removidos em
commits separados. São quatro casos distintos em duas chamadas, sem somar uma
suposta suíte única. A segunda JVM própria também foi encerrada pelo finally.

## Revisão e correções

O caso de 65 referências com página de 50 reproduziu identity-conflict ao tentar
apagar os últimos filhos e um pai no mesmo commit. A verificação do pai ainda
enxergava os filhos. A página agora confirma somente os journals com prefixo 0-
e retoma os pais depois. A seleção dirigida de fronteira, estrangeiro e marco
fora de ordem passou após a correção; a chamada dos 40 Node também passou.

As expectativas iniciais de três testes foram corrigidas: o fixture tem 16
recursos, o bookmark é metadata privada e o controle inicial não tem updatedAt.
O getter retorna a view diretamente. Essas correções não afrouxaram o produto.
O teste de substituição remove wordGoal e comprova hash/valor e birth preservado.

## Validação e limites

Sintaxe de 344 módulos de Functions positiva. ESLint dirigido dos 13 módulos/
testes, formatação do escopo de 18 arquivos, docs, arquitetura, styleguide e
diff passaram. O fechamento usa preflight de escopo/HEAD/index, UTF-8/LF,
tamanho e marcadores de segredo, com hashes de bytes e hooks normais no commit
local. Nenhuma dependência, permissão SDK, configuração de testes ou callable novo.

Sem novo validate integral, build, browser/a11y ou Node 22 neste incremento.
O verde integral de 170 é base anterior. A orientação do operador mantém testes
dirigidos após ajustes e validação integral ao fechar o bloco maior de montagem.

Lore/personas/imagens, universo autorizado, histórico/draft separado, agregados/
audit/ativação, recuperação cifrada/UI e roundtrip continuam obrigatórios.
resources-ready não conclui P2/P3/D/F2-09, gates humanos/comerciais ou a V2.
O indicador macro continua 8/35. Somente commit local, sem CI/push/PR/merge/deploy
ou subagentes. O servidor local do usuário foi preservado.
