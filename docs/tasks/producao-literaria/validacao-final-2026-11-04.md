# Validação após conferir a principal — 2026-11-04

## Base conferida antes dos testes

Worktree: `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`.
Branch: `codex/producao-literaria`.

`git fetch origin --prune` confirmou HEAD e `master` local em
`b66623310d487a6052148629d80125a0673e3e0f`; a comparação apresentou `0 / 0`.
`origin/master` ficou em `16d8af5`, ancestral da principal local: `1 / 0`
na comparação HEAD/origin. Não havia commits novos para incorporar. A comparação
com `master` foi repetida após os testes do backend e continuou `0 / 0`.
As alterações não commitadas da principal em `E:/Mega/dev/writer` foram preservadas;
não foram copiadas para a worktree de implementação.

## Resultados finais

| Verificação                                                               | Resultado                                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Skills, arquitetura, documentação e styleguide                            | Aprovados no segundo `validate`                                                                |
| Formatação integral                                                       | Aprovada                                                                                       |
| Lint integral                                                             | Aprovado: zero erros, dois avisos existentes de hooks                                          |
| Frontend completo                                                         | **5.480/5.480**, 429 arquivos                                                                  |
| Functions, execução completa após correções                               | **5.843/5.843**, zero falhas, cancelamentos ou casos pulados                                   |
| Scripts                                                                   | **116/116** na execução inicial; não repetidos pelo segundo `validate`, que parou na cobertura |
| Build, TypeScript e smoke do bundle                                       | Aprovados após corrigir as fixtures                                                            |
| Sintaxe das Functions                                                     | **620 módulos** aprovados                                                                      |
| Chromium contra o bundle                                                  | **7/7**                                                                                        |
| Estágio cifrado e stream, reconferência dirigida final                    | **27/27**; os mesmos arquivos passaram também no frontend completo                             |
| Contratos públicos, host, projeção e inventário de restauração, dirigidos | **103/103**, antes da aprovação integral do backend                                            |
| Rules completas                                                           | **Incompletas**, timeout original de 30 minutos, exit 1                                        |
| `git diff --check`                                                        | Aprovado                                                                                       |
| `npm run validate`, segunda execução                                      | **Reprovado**, exit 1 por cobertura de funções                                                 |

A cobertura final foi: statements **87,18%**, branches **82,68%**, functions
**85,85%** e lines **90,33%**. O limite de functions continua **90%**.
Não foram reduzidos limites, removidas asserções nem ampliado o timeout.

O segundo `validate` aprovou seus gates iniciais e todos os casos do frontend,
mas parou em `test:coverage`. Portanto não executou scripts, Functions e build
nessa mesma cadeia. A aprovação completa das Functions e a aprovação do build
são execuções separadas sobre o código corrigido, não um `validate` verde.
Os sete casos Chromium verificam navegação/styleguide/temas; não comprovam,
por si, toda a jornada editorial autenticada ou a matriz visual da feature.

## Falhas encontradas e correções delimitadas

- A primeira execução do frontend ficou em 5.478/5.479. `instanceof Uint8Array`
  recusava bytes de outro contexto JavaScript. O estágio agora reconhece a view
  de bytes entre contextos, preservando limites e cópia antes de await. Um novo
  caso recusa Int8Array, Uint8ClampedArray, Uint16Array, DataView e objetos comuns.
  A comparação do teste normaliza o contexto do array esperado e continua
  conferindo todos os bytes. A execução completa posterior passou em 5.480/5.480.
- Dois métodos editoriais internos tinham entrado em `BOOK_RESTORE_METHODS`, que
  controla a fronteira pública. Foram retirados dessa lista e acrescentados à
  lista de métodos que os testes exigem manter internos. Não foram expostos novos
  comandos públicos. Isso corrigiu as falhas de dispatch/host da primeira rodada.
- A fixture de projeção usava `chapter` em vez do tipo real `chapterBrief`.
  Foi alinhada ao registro de campos sem alterar o comportamento esperado.
- O lint apontou o regex de caracteres de controle e causas de erros em catches
  aninhados. A checagem de caracteres mantém a mesma restrição; AggregateError
  preserva ambos os erros e usa a falha de limpeza como causa imediata.
- As propriedades dos construtores da fixture OPFS foram declaradas explicitamente
  para respeitar `erasableSyntaxOnly`. Não houve alteração na configuração TypeScript.
- A formatação apontada foi aplicada somente aos arquivos identificados.

A primeira execução das Functions ficou em 5.795/5.845. A lista pública
indevidamente ampliada também gerava casos parametrizados extras; após a correção,
a suíte completa gerou e aprovou os 5.843 casos do contrato correto.
As aprovações dirigidas e completas são registros distintos, não totais somados.

## Segurança e limite de entrega

As Rules completas executaram casos reais de Firestore/Storage e callables,
mas excederam 30 minutos sem resumo integral. Logs de PERMISSION_DENIED pertencem
também a asserções negativas; não são contados como falhas por inspeção textual.
Não há aprovação da suíte completa de segurança nem de casos que não encerraram.

Não houve commit, integração de volta à principal, push ou deploy. As cinco etapas
continuam formalmente abertas, conforme o inventário de requisitos do plano.
A preparação editorial interna não equivale a restauração útil, ativação ou
liberação pública. O fechamento exige a auditoria funcional pendente, cobertura
mínima e execução completa de segurança; esta rodada não autoriza publicação.

Logs locais ignorados pelo Git: `.firebase/local-validation/final-principal-20261104-*`.
As execuções completas finais estão em `validate-recheck.log`, `backend-final.log`
e `test-rules.log`; build/sintaxe, reconferências e resultados iniciais têm arquivos
separados com o mesmo prefixo.
