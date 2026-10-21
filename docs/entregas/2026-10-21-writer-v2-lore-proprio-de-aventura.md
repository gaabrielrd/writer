# Writer V2 — Lore próprio de aventura

- **Data:** 2026-10-21
- **Branch:** `codex/writer-v2`
- **Plano:** [F2-09 L](../tasks/writer-v2/execucao/26-lore-proprio-de-aventura.md).
- **Estado:** implementado, revisado e validado localmente em `2af6df5`, enviado ao PR #21. A CI encontrou expectativas legadas; correção dirigida validada localmente, aguardando CI do novo head. Sem merge ou deploy.

## Objetivo

Permitir que autores desenvolvam fichas privadas da própria aventura e que
mestres usem essas fichas nas bases e adaptações de suas campanhas, com
autorização atual e sem perder a prosa própria quando o universo fica indisponível.

## Funcionalidades entregues

- Criar, consultar, editar e excluir fichas privadas da aventura, com nome,
  aliases, categoria, resumo, prosa integral, características e relações.
- Catálogo paginado e menções que consideram todas as fichas locais antes das
  globais, inclusive aliases da segunda página. Detalhes são carregados ao abrir
  a ficha; os resumos não simulam um corpo vazio.
- Referências explícitas em cenas, arcos e cronologia. A base da campanha
  captura apenas as fichas vinculadas, conservando origem e texto congelado.
- Variantes, comparação, adoção, legado e referências de sessão reconhecem a
  origem local. Retirar o universo não revoga uma ficha própria da aventura;
  relações com alvos indisponíveis ficam neutras.
- Conflitos mantêm o rascunho e sua revisão original. Confirmar pedido incerto
  repete o snapshot congelado; encerrar cria fence. Consultar a versão atual
  exige escolha explícita para usar sua revisão, mantendo a edição posterior.
- Exclusão impede novos acessos derivados; recriar aventura/ficha com os mesmos
  IDs não libera o material antigo. Livros e origens globais conservam seus
  formatos e hashes anteriores.

## Critérios de aceite

- [x] Fichas novas privadas e armazenamento separado de metadata/corpo.
- [x] CRUD com identidade precisa, CAS, limites, recibos e cancelamento.
- [x] Quatro namespaces fechados ao SDK direto para proprietário, intruso e anônimo.
- [x] Contexto completo e consistente para prioridade local nas menções.
- [x] Referências somente da própria aventura e do universo atualmente autorizado.
- [x] Captura explícita, compatibilidade global e gates B/C2/C3/S2 antes do corpo.
- [x] Relação indisponível preservável/removível sem nomes antigos.
- [x] Revogação e encarnação protegem derivados sem apagar texto próprio.
- [x] Tipos, lint, formatação, testes, cobertura, build e smoke locais verdes.
- [x] Quatro famílias SDK e duas jornadas em seis perfis com evidência positiva.
- [ ] CI do novo commit, integração e aceite humano/comercial.

## Arquivos alterados

| Área                                                                                                  | Mudança                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/features/lore`                                                                                   | Modelos metadata/detalhe, cinco callables, serviços, hints, hooks, coleção, leitor e formulário privado |
| `src/features/editor`                                                                                 | Contrato mínimo de menções, prioridade local, guardas de tooltip/menu e regressões de livro             |
| `adventures`, `adventure-blocks`, `scenes`, `narrative-planning`                                      | Composição por APIs públicas e referências locais                                                       |
| `functions/src/adventureLore*.mjs` e `campaignLoreOrigin.mjs`                                         | CRUD, identidade, contratos e procedência discriminada                                                  |
| Serviços de captura/base/lore/comparação/adoção                                                       | Token interno de encarnação, máscaras sem prosa e leitura autorizada                                    |
| `firestore.rules`, `firestore.indexes.json`                                                           | Fronteiras fechadas e consultas por nome/categoria                                                      |
| `tests/firestore/adventure-lore.rules.test.mjs`                                                       | Quatro famílias reais de regras/Admin SDK                                                               |
| `e2e/visual/adventure-lore.visual.ts` e fixtures                                                      | Dois roteiros nativos; somente transportes/hints simulados                                              |
| `AGENTS.md`, arquitetura, testes, [ADR 0041](../decisions/0041-adventure-private-lore.md) e planos V2 | Regras e estado reconciliados                                                                           |

Nenhuma dependência adicionada; C4 permanece v4. A correção visual anterior S3
`e924890` também teve seu fechamento remoto registrado, com CI geral e regras verdes.

## Testes

| Camada            | Resultado e comportamento                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Backend dirigido  | 139/139: 18 casos novos e 121 regressões; CRUD/CAS, limites, origens, captura, variantes, adoção, sessões e recriação    |
| Cliente dirigido  | 245 combinações únicas positivas após correções pertinentes; 37 casos nas quatro suítes L e dois casos editor adicionais |
| SDK real          | Quatro famílias únicas positivas, seis execuções: cinco passes e uma falha inicial de arranjo                            |
| Navegador         | 12 combinações únicas positivas; 13 execuções: 12 passes e uma falha inicial de arranjo; zero retries/skips/flaky        |
| Isolamento nativo | 13 coletores: zero exceções de runtime e zero chamadas externas                                                          |
| Inspeção visual   | Oito PNGs inspecionados pelo integrador, cobrindo os seis perfis, foco, contraste e contenção                            |

SDK: a primeira família 4 usava `getCampaignSession(...).summary`, quando a API
retorna `envelope.session.summary`. A correção manteve os asserts de prosa própria
e a lista C3 neutra, com leitura de item indisponível recusada. Somente essa família
foi repetida. Após remover uma negação redundante inserida no vínculo de universo
das regras, somente a família 1 de fronteiras foi repetida. Os gates efetivos da
raiz e de usuários foram preservados.

Nativo: o primeiro roteiro do autor tentou preencher a seção História e notas
ainda recolhida. O teste passou a expandi-la pela UI e conferir aria-expanded,
sem alterar timeout, retries ou asserções. Repetiu-se somente o autor desktop;
o mestre já havia passado. Os dez casos dos cinco perfis restantes passaram.
O mestre desktop antecede apenas correções de encoding em textos/comentários do
editor, sem mudança em seu comportamento.

A revisão cruzada corrigiu seleção A→B com resposta tardia, remontagem de
rascunho na criação incerta, relação externa neutra rejeitada pelo cliente e
gates das fixtures. O consolidado cliente inicial teve 240/245 positivos; as
cinco falhas restantes eram três literais com encoding incorreto no minimapa e
dois arranjos de unidades novas. Repetições pertinentes fecharam 63/63 e 31/31.
Scan final dos arquivos alterados não encontrou mojibake.

## Validações executadas

`npm ci --prefix functions` passou, com zero vulnerabilidades. Houve aviso de
engine: Functions declara Node 22; máquina local usa Node 24.21.0. Dependências
travadas e lockfile foram preservados.

`npm run validate` executado integralmente uma vez no fechamento: exit 0.
Saída real resumida:

```text
Test Files  198 passed (198)
Tests       2037 passed (2037)
Duration    153.69s
All files   | 90.58 | 84.94 | 90.38 | 93.25 |
scripts: tests 85, fail 0, duration_ms 9838.8312
Functions: tests 427, fail 0, duration_ms 2734.3237
Verificação arquitetural OK.
Validação da documentação OK.
Verificação do styleguide OK.
All matched files use Prettier code style!
Smoke test do bundle OK.
```

Cobertura: statements 90,58%, branches 84,94%, functions 90,38%, lines 93,25%;
limites e exclusões não foram reduzidos. Lint, typecheck e sintaxe passaram.
Build passou com avisos de chunks acima de 500 kB e import estático/dinâmico de
exportDocx; não foram alteradas as configurações para ocultá-los.

SDK: 58.932,0738 ms na execução inicial; 33.567,425 ms na família 4;
6.954,1569 ms na família 1 final. Nativo: 53.300,593 ms inicial,
10.517,519 ms no autor dirigido e 49.810,547 ms nos demais perfis.
Durações incluem as falhas de arranjo; não equivalem a horas humanas.

Logs, relatórios JSON, traces, capturas, vetores independentes e consolidações em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-adventure-lore-qa`.
Os arquivos `sdk-verified.json` e `native-verified.json` preservam execuções,
falhas iniciais e coletores. Todos os emuladores e servidores visuais encerrados.

## Fora do escopo

Importação para aventura, IA de cenas/blocos, backup/restauração, jogadores,
publicação, loja e exclusão integral de aventura. O backup com estado atual e
todo o histórico está aprovado no planejamento, ainda sem implementação.

## Limitações e pendências conhecidas

Pedido incerto e rascunho de lore da aventura permanecem somente em memória;
reload não oferece a recuperação persistente de C2. Hints não prometem observar
imediatamente um bump isolado no relógio privado; cada ação reautoriza no servidor.

Emulador e fixtures não comprovam índices ou rollout em produção. Habilitação
exige escritores, regras e índices coordenados. Nenhum conteúdo real de PDF foi
importado neste incremento. Pilotos humanos e condições comerciais seguem pendentes.
CI remota deste incremento será acompanhada em paralelo ao próximo, conforme
autorização do operador; conclusão local não declara F2-09 inteira pronta.

## Como verificar manualmente

1. Criar uma aventura e abrir Lore. Cadastrar uma ficha com alias e prosa detalhada;
   conferir o padrão privado e o texto preservado ao editar.
2. Vincular a ficha explicitamente ao planejamento de uma cena; escrever seu
   alias no editor e abrir a ficha autorizada.
3. Criar campanha dessa aventura, adaptar a ficha e consultar seu material
   congelado. Retirar o universo e atualizar: a ficha local e a prosa da mesa
   permanecem, com relações globais neutras.
4. Em duas consultas, editar a mesma ficha. Confirmar o conflito, comparar a
   revisão atual e escolher explicitamente se deseja usá-la, conservando rascunho.
5. Simular resposta perdida; confirmar o mesmo pedido ou encerrá-lo. Confirmar
   histórico não deve substituir uma edição posterior.

## Correção dirigida após CI — 2026-10-21

O commit `2af6df56581d763dc9cd860cc688248ad73c245b` foi enviado normalmente,
com hooks verdes: tipos e 2.037 testes/198 arquivos no pre-push, em 140,26 s.
HEAD, origin/codex/writer-v2, upstream e head do PR #21 foram conferidos iguais.
A master original permaneceu limpa em `522ccaa7bcc92fe5eb4ae4ff54446afee98a52bf`.

A [CI de regras 39603978475](https://github.com/gaabrielrd/writer/actions/runs/39603978475)
terminou com 157/158 testes positivos, zero skips e duração 111.888,09074 ms.
A única falha foi a expectativa antiga do SDK de comparação:
aceitava somente metadata `deleting`, mas o gate agora também confere `deleted`.
O teste continua exigindo exatamente esses dois campos, sem prosa viva, 101 chaves
sem perda, orçamento de 4 MiB e até 512 documentos.

Na [CI geral 39603978427](https://github.com/gaabrielrd/writer/actions/runs/39603978427),
validate Node 22/24, auditoria e navegador de produção passaram. Os seis shards
2/4/6/8/10/12 falharam no mesmo teste de teclado em seis perfis: End esperava
Progresso como última aba, anterior à inclusão de Lore. A correção confere foco e
seleção em Lore, usa ArrowLeft para Progresso e mantém todas as verificações
anteriores de Progresso, retorno à narrativa, formulário e largura de 320 px.
Falhas DNS de download tiveram fallback bem-sucedido; não causaram essas falhas.

Correção limitada a dois testes, sem alterações em src, Functions, regras,
índices, dependências, configuração, cobertura, timeout ou retries:

- `tests/firestore/campaignComparison.rules.test.mjs`;
- `e2e/visual/narrative-planning.visual.ts`.

Revalidação real após o ajuste:

```text
SDK worst lore pair: tests 1, pass 1, fail 0
duration_ms 47059.7793
Nativo teclado/320px: 6 passed, zero skips/retries/flaky
duration 17159.96 ms
6 coletores: runtimeErrors 0, blockedRequests 0
ESLint dirigido: exit 0
tsc -p tsconfig.e2e.json --noEmit: exit 0
```

Revisão independente dos dois diffs não encontrou P1/P2; nenhuma asserção antiga
foi removida. Os logs completos dos sete jobs remotos, relatório nativo, log SDK e
`ci-retake-verified.json` foram preservados no diretório de evidência L.
O emulador temporário e o servidor visual foram encerrados. A produção permanece
idêntica à que passou no validate local e nos validates remotos; não foi repetido
o validate global para uma correção exclusiva de expectativas de teste/docs.
A CI do próximo head permanece um portão próprio; sem merge ou deploy.
