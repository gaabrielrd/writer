# Writer V2 — Importação revisada de aventuras

- **Data:** 2026-10-21
- **Branch:** `codex/writer-v2`
- **Plano:** [F2-09 I](../tasks/writer-v2/execucao/27-importacao-revisada-de-aventura.md) e [ABI](../tasks/writer-v2/execucao/28-contratos-da-importacao-de-aventura.md).
- **Estado:** implementado e revisado; validado localmente com npm run validate verde. CI do novo incremento pendente. Sem merge, deploy ou lançamento.

## Objetivo

Permitir que autores e mestres revisem documentos e criem novas aventuras privadas,
retomando uma importação interrompida sem perder a revisão confirmada no dispositivo.

## Funcionalidades entregues

- O Estúdio oferece Livro ou Nova aventura ao importar. PDF, DOCX, Markdown,
  texto e HTML usam o parser local existente pela nova interface document-import.
- Conferir, selecionar, renomear, dividir e unir seções antes de confirmar.
  Cada seção escolhida gera uma parte e uma cena com principal virtual privado,
  sem livro intermediário ou bloco adicional duplicado.
- Aventura incompleta não aparece no catálogo de projetos. A ativação integral
  torna a nova obra utilizável e conserva ordem, prosa segura e contagem.
- Preparações pendentes podem ser verificadas, retomadas ou canceladas. A revisão
  confirmada fica cifrada no IndexedDB; PDF e chave não são persistidos no cliente.
  Reabrir exige autorização atual. Antes do seal durável, a interface explicita
  que a cópia ainda não está preservada.
- Reanexar o mesmo PDF após reload restaura somente a prévia local, conferindo
  bytes, hash e tipo, sem substituir a revisão congelada.
- Cancelamento fecha a admissão antes da limpeza paginada. Retry não duplica
  conteúdo nem apaga aventura já ativada; divergência de identidade preserva o
  controle local. Controles terminais não retêm sinopse temporária ou chave.

## Critérios de aceite

- [x] Destino explícito e revisão dos formatos sem alterar o gravador legado de livros.
- [x] Uma parte/cena/principal privado por seção confirmada, na ordem revista.
- [x] Raiz ausente antes da ativação, reserva permanente e ativação/vínculo/recibo atômicos.
- [x] Escrita ordenada e idempotente, CAS, limites completos e cadeia de preparação conferida.
- [x] Snapshot protegido durável antes do primeiro append e journal sem prosa.
- [x] HTTP autorizado sem cache; chaves/controladores/reservas fechados ao SDK direto.
- [x] Retomada, cancelamento e limpeza com identidade exata e preservação de outros controles.
- [x] Regressões de livros, corpus privado, SDK e interface com evidência separada.
- [ ] CI do novo commit e aceites humanos/comerciais pertinentes.

## Arquivos alterados

| Área                                                          | Mudança                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/features/document-import`                                | Parser, contratos, revisão e prévia públicos; books conserva reexports precisos.          |
| `src/features/adventure-import`                               | Contratos, transporte, recuperação protegida, serviço, diálogo, preparações e unidades.   |
| Studio, adventures e `shared/lib/countWords.ts`               | Escolha de destino, origem importada e contagem neutra sem novo algoritmo.                |
| `functions/src/adventureImport*.mjs`                          | Oito callables, HTTP de chave, contratos e limpeza; inicializadores reais compartilhados. |
| `sceneContracts.mjs`, `scenes.mjs`, `studio.mjs`, `index.mjs` | Reuso de cena/ledger, reserva global e bindings.                                          |
| Regras, índices, Hosting e Vite/Vitest                        | SDK fechado, campos sem indexação, rewrite/proxy exato e resolução da factory Vite.       |
| Specs SDK/nativas e unidades                                  | Casos positivos/negativos e regressões; somente gesto de menu Livro nos cinco legados.    |
| README, AGENTS, arquitetura, testes, ADR 0042 e planos        | Contratos, limites, decisões e estado real dos portões.                                   |

## Testes e validações executadas

`npm ci --prefix functions` concluiu com exit0. `npm run validate` final concluiu
com exit0: arquitetura, docs, styleguide, formatação, lint, cobertura, scripts,
Functions/sintaxe, tipos, build e smoke verdes.

```text
Test Files  204 passed (204)
     Tests  2123 passed (2123)
  Duration  154.32s
All files | 90.69 statements | 85.06 branches | 90.25 functions | 93.34 lines
scripts: tests 85; pass 85; fail 0; skipped 0
Functions: tests 444; pass 444; fail 0; skipped 0
Smoke test do bundle OK.
```

Primeiro validate integral verde: 2.119 testes frontend/204 arquivos, 85 scripts,
444 Functions; cobertura statements 90,68%, branches 85,04%, functions 90,25%,
lines 93,33%. Após revisão final, dois P2 foram corrigidos e revalidados:
serviço cliente 20/20 e Functions 12/12; lint, tipos e formatação de escopo verdes.
O validate final acima pertence à fonte corrigida. Limites, isolamento, workers,
timeouts, retries e exclusões de cobertura foram preservados.

Unidades próprias frontend: 86 únicas positivas por dirigidos; 187 regressões
em dez arquivos também positivas. Backend: 77 únicas positivas (17 novas e 60
regressões), com repetições somente dos afetados. Esses números sobrepõem a suíte
global e não devem ser somados como testes adicionais. A unidade que consulta
getWorkVersionSource não comprova criar manualmente uma versão do importado.

### Firestore/HTTP reais locais

Quatro famílias únicas positivas. Oito execuções ao longo do incremento: seis
passes e duas falhas iniciais de arranjo, zero skip/retry. Primeira rodada 2/4
(37.168,8114 ms); famílias 2/4 corrigidas 2/2 (26.326,7371 ms); após o P2 terminal,
somente 2/4 repetidas, 2/2 (26.593,9184 ms). As falhas eram o campo legado target
em vez de adventureId e IDs de operação reutilizados entre jobs; não se enfraqueceu
produção. A repetição final confirma controle sem sinopse, raiz integral e replay.

SDK direto get/list/write fechado, criação concorrente do Estúdio bloqueada pela
reserva, 27 seções paginadas, raiz ausente, materialização/contagens, recibos/CAS,
createTime preciso e recriação de controle, cancel/fence e limpeza limitada foram
exercitados. O wrapper onRequest/rawBody é real; verificadores Auth/App Check
são injetados, sem comprovar configuração Google live. Emuladores encerrados.

Proxy Vite real dirigido com upstream HTTP sintético: rota exata, headers e
no-store preservados, rota vizinha excluída, projectId trim/fallback e rejeição
de inválido, rewrite Hosting anterior à SPA. Não comprova Hosting implantado.

### Chromium e regressões de livros

16 combinações novas únicas positivas: duas jornadas em seis perfis, três casos
dirigidos iniciais e um de identidade. Cinco regressões legadas positivas.
Total: 21 combinações únicas positivas, 24 execuções, 22 passes e duas falhas
iniciais preservadas; zero retry, skip ou flaky. Os 24 coletores registraram zero
erros de runtime e zero pedidos externos. Isso não converte as duas falhas em passes.

A primeira rodada desktop falhou 0/2: o autor esperou h3 ainda na preparação em
vez da URL final/h1; o mestre revelou autoload preso pelo replay de StrictMode.
O locator foi corrigido e o efeito de produção recebeu microtask cancelável,
mantendo StrictMode. Repetição afetada 2/2, outros perfis 10/10, recuperação 3/3,
legados 5/5 e, após o P2 de vínculo, retomada/identidade 2/2.

Fluxos usam componentes, rotas, WebCrypto, IndexedDB e Web Locks reais, com transporte
simulado. O storage writer.visual.* do servidor fictício é separado do storage
produtivo na inspeção; não é prova de ausência de prosa na fixture nem de autorização.
Seis capturas finais foram inspecionadas nos três temas/desktop/mobile320, além de
duas iniciais. Texto de erro recebeu contraste por token semântico no novo diálogo.
Não comprova zoom físico de 200%, leitor de tela ou segundo aparelho reais.

### Corpora privados

Comparação do parser real no Chromium antes/depois e preflight real I: mesmos
hashes/seções/palavras/páginas/avisos; zero pedidos de servidor, runtime ou rede
externa. PDFs e prosa ficaram fora do Git e não foram enviados ao servidor.

| Corpus                            | Páginas / seções | Palavras |    HTML total | Maior RPC / corpo completo |
| --------------------------------- | ---------------: | -------: | ------------: | -------------------------: |
| Manuscrito indicado pelo operador |          327 / 1 |   77.618 | 504.481 bytes |    504.707 / 506.630 bytes |
| Phandelver real                   |           64 / 7 |   45.338 | 298.744 bytes |      69.735 / 71.644 bytes |

Ambos cabem nos limites de 900.000 bytes de RPC e 800.000 bytes de corpo.
O manuscrito não teve capítulos reconhecidos automaticamente; divisão manual
continua necessária. Phandelver conserva avisos de mapas 5/13/43. O legado de
nove capítulos é sintético apesar de seu título. Medição não é gravação completa
do corpus privado. Primeiro lançamento externo falhou no loader ESM Windows antes
de abrir servidor; import file URL corrigido somente no script externo.

## Evidência, revisão e operação

Artefatos privados ficam em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-adventure-import-qa/`:
logs validate inicial/final, sdk-verified e rodadas dirigidas, native-final-verified,
corpus-verified, development-proxy-result, capturas e source freezes. O freeze final
inclui 67 fontes e permite separar a matriz inicial dos dois P2 revalidados.
Revisão cruzada final sem P1/P2 remanescente; original master preservada.

## Fora do escopo

OCR, extração de imagens/mapas, inferência de audiência/lore/missão, IA nova,
mesclar/sobrescrever aventura existente, exclusão integral de aventura, backup,
publicação, venda e direitos de revenda. C4 permanece v4.

## Limitações e pendências conhecidas

Somente revisão confirmada e selada tem recuperação; sem sincronização entre
dispositivos ou autosave novo antes de confirmar. Snapshot inválido é preservado
quando não há prova segura para removê-lo. Mapas/imagens não entram na aventura.
Implantação exige coordenação de Functions, guardas, regras, índices e rewrite.
Build conserva avisos de chunks grandes/import estático-dinâmico. CI do novo
head e pilotos humanos/comerciais continuam pendentes. F2-09 e a V2 não terminam
neste incremento; a contagem ampla continua 8/35 tarefas tecnicamente concluídas.

## Como verificar manualmente

1. No Estúdio, escolher Importar Documento → Nova aventura e carregar DOCX/PDF/Markdown.
2. Conferir prévia/avisos, dividir/unir/renomear/selecionar e confirmar os dados.
3. Interromper após seal, recarregar e consultar preparação; retomar após autorização.
4. Abrir a aventura ativada: conferir ordem, principal único e audiência privada.
5. Em outra preparação, cancelar e verificar remoção dos filhos sem obra visível.
6. Importar um livro pelo mesmo menu e conferir o fluxo legado.
