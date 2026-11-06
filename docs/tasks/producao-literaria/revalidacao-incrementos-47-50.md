# Revalidação com a principal — incrementos 47–50

## Base e preservação

Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`, branch
`codex/producao-literaria`. Antes de executar os testes, `git fetch origin` e
`git merge --ff-only master` confirmaram que HEAD e a principal local já estavam
em `b66623310d487a6052148629d80125a0673e3e0f` (comparação `0 / 0`). O merge
respondeu `Already up to date`. `origin/master` continuou em `16d8af5`.

As 48 entradas não commitadas da principal em `E:/Mega/dev/writer` foram
preservadas e não copiadas. A equivalência é entre commits; ela não significa
que os dois diretórios têm os mesmos arquivos locais. Esta rodada testa a
implementação literária, incluindo os incrementos 47–50 antes não executados.

## Resultados da rodada

- Skills, arquitetura, documentação e styleguide: aprovados nas duas chamadas de validate.
- Formatação: primeira chamada apontou 33 arquivos; segunda apontou dois restantes.
  Após correções delimitadas, a checagem integral de formatação passou.
- Lint: aprovado, zero erros e dois avisos existentes de hooks.
- Sintaxe das Functions: 626 módulos aprovados.
- Frontend: 5.480/5.480 casos, 429 arquivos, todos aprovados.
- Cobertura: comando reprovado por functions 85,85% abaixo de 90%. Statements
  87,18%, branches 82,68%, lines 90,32%. Os limites não foram alterados.
- Scripts: 116/116 aprovados.
- TypeScript, build e smoke do bundle: aprovados.
- Chromium: 7/7 aprovados, navegação e styleguide/temas. Não comprova toda a
  jornada editorial autenticada.
- Functions: primeira execução completa 5.894/5.896; duas fixtures inválidas.
  Arquivo corrigido: 17/17 aprovados. Repetição integral: **5.898/5.898**,
  zero falhas, cancelamentos ou casos pulados. Os dois casos adicionais são
  rejeições explícitas, sem remover as verificações de preservação válidas.
- Rules: **incompletas**, timeout original de 30 minutos, exit 1, sem resumo
  integral. Nenhuma aprovação pode ser atribuída a casos não concluídos.
  Logs PERMISSION_DENIED também fazem parte de asserções negativas e não foram
  contados isoladamente como falhas. O limite de tempo não foi alterado.

## Correções das fixtures

O formato compartilhado exige JSON canônico e frames com payload até 64 KiB.
Dois casos novos de materialização contrariavam essas condições e falhavam
antes de chegar ao escritor. O produto e os limites foram preservados.

O caso de preservação passou a usar JSON canônico contendo texto com BOM,
Unicode, CRLF, aspas e barra invertida. A conferência continua comparando todos
os bytes e os hashes físico e semântico. Um caso adicional exige rejeição do
JSON formatado com espaços/CRLF e representação numérica alternativa.

O item acima de 64 KiB agora usa dois frames válidos e continua conferindo
os tamanhos das partes e todos os bytes. Um caso adicional exige rejeição de
um frame físico acima de 64 KiB. O arquivo passou de 15 para 17 casos.

As afirmações anteriores de que JSON não canônico e frame físico acima de
64 KiB atravessavam o protocolo eram expectativas de testes não executados;
essa interpretação foi corrigida nesta rodada.

## Limite de entrega

As duas chamadas de `npm run validate` pararam em formatação; a formatação foi
corrigida e aprovada separadamente. O comando de cobertura executado à parte
continuou reprovado. Não há um `validate` integral verde. Resultados separados
não são apresentados como uma cadeia de validação integral aprovada.

As cinco etapas continuam formalmente abertas. Restauração editorial pública,
ativação/leitura/recaptura e os aceites funcionais pendentes não foram concluídos
por esta rodada de testes. Não houve commit, merge de volta à principal, push
ou deploy.

Logs locais ignorados: `.firebase/local-validation/principal-current-*`.
A rodada histórica de 5.843 Functions permanece em
[validacao-final-2026-11-04.md](validacao-final-2026-11-04.md); ela não substitui
os resultados atuais.
