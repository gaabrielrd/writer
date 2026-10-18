# Writer V2 — Adoção de base e fichas legadas da campanha

- **Data:** 2026-10-18
- **Branch:** `codex/writer-v2`
- **Plano:** [contrato C3B](../tasks/writer-v2/execucao/19-adocao-explicita-de-base-da-campanha.md)
- **Estado:** validado localmente; CI do novo head pendente no [PR 21 em rascunho](https://github.com/gaabrielrd/writer/pull/21)

## Objetivo

Permitir adotar a candidata congelada após decidir sobre as fichas inteiras da
mesa. Fichas ausentes podem continuar como legado autorizado, mantendo origem e
regras de acesso. Notas próprias, outra campanha e original permanecem íntegros.

## Funcionalidades entregues

- Revisar escolhas sem bloquear a escrita; preparação explícita instala barreira
  C2 e audita operações abertas. Paginação e etapas têm limites de leituras,
  escritas e bytes; corpo só é lido após autorização da própria ficha.
- Manter variante, usar candidata ou descartar material local conforme a presença
  da ficha. Legado conserva anchor congelado; retirada/restauração/descarte do
  override e reentrada preservam identidade e continuidade de revisão.
- Confirmar base ativa, procedência, geração de variantes, revisões, comparação
  adotada e recibo no mesmo commit, sem varrer coleções ou copiar corpos antigos.
  Cancelamento limpa somente staging próprio e preserva bindings emprestados.
- Reautorizar explicitamente após mudança no relógio global; perda efetiva de
  acesso aborta e libera a própria barreira. Edição comum não recaptura a candidata.
- Descobrir e resolver pedidos C2 antigos somente por controles mínimos; cifras
  mantêm base/AAD originais. Resolver histórico B confirma o evento de ativação,
  sem recriar ou reconhecer a encarnação atual da campanha.
- Recuperar pedidos exatos após resposta perdida, com Web Locks/CAS integral.
  Consultas antigas não prendem o carregamento; escolhas externas exigem revisão.
  Confirmação antiga não cancela nem apaga o rascunho novo de outra aba.

## Critérios de aceite

- [x] Base e variantes mudam atomicamente; notas e original são preservados.
- [x] Legado mantém autorização vigente, anchor achatado e revisão contínua.
- [x] Corpo grande, mais de 25 overlays, relações e budgets têm provas próprias.
- [x] Pedidos remotos, conflitos, cancelamento e replay mantêm isolamento.
- [x] Interface cobre retomada, decisões, pausa explícita, temas e 320 px.
- [x] Revisão, validate local, SDK real e navegador dirigido verdes.
- [ ] CI do novo head verde; não reutilizar os checks históricos de C3A.

## Arquivos alterados

| Área                                                                                        | Mudança                                                        |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/features/campaign-adoptions`                                                           | Contratos, adaptador, preparação, revisão e recuperação        |
| `campaign-lore`, `campaign-bases`, `campaign-comparisons`                                   | Continuidade de legado, controles remotos e resolver histórico |
| `campaigns` e `studio`                                                                      | Composição pelas interfaces públicas e recarga dos leitores    |
| `functions/src/campaignAdoption*.mjs`                                                       | Staging, decisões, autorização e commit limitado               |
| `campaignLoreStorage.mjs`, `campaignAuthorization.mjs`, `campaignVariantRemoteRecovery.mjs` | Gerações físicas, relógio por UID e resolução de metadados     |
| Universo/análise, índice de callables, regras e índices                                     | Escritores canônicos e fronteiras privadas                     |
| Testes colocalizados, Functions, SDK e visual                                               | Negativos, integração e jornadas observáveis                   |

## Testes e validações executadas

`npm run validate` final **exit 0**, incluindo skills, arquitetura, documentação,
styleguide, formato, lint, testes, tipos, sintaxe, build e smoke:

```text
Test Files  173 passed (173)
     Tests  1755 passed (1755)
  Duration  131.60s
Statements : 90.53% (14563/16085)
Branches   : 84.6% (12714/15027)
Functions  : 90.15% (3802/4217)
Lines      : 93.15% (13328/14307)
Scripts: 77/77, duration_ms 8689.6161
Functions: 347/347, duration_ms 2260.6196
Build: 1.44s
Smoke test do bundle OK.
```

SDK Firestore/regras reais: **5/5 famílias C3B**, zero falhas/skips,
155.539,7154 ms. Exercitam Unicode grande/27 overlays, barreira e operações antigas
sem closed, rejeição remota durável, claims concorrentes, adoções sucessivas,
legado/reentrada, relógio/revogação e negação do SDK nos caminhos privados.
SDK adicional de análise/relógio: **2/2**, 9.995,4077 ms. Emuladores encerrados.
Assets são injetados: isso não comprova Storage real ou índices implantados.

Navegador final: **13/13 execuções únicas**, sem retries/skips/flaky, em três lotes:
17.113,723 ms (2), 61.279,428 ms (10) e 10.490,029 ms (1), soma 88.883,18 ms.
Duas jornadas nos seis projetos mais controle de duas abas com Web Locks,
IndexedDB e cifra reais, transporte simulado. Há 19 PNGs; a raiz inspecionou seis
capturas móveis de 320 px, decisões e legado/notas nos três temas. Caso de
recuperação usa os viewports normais de 1440/390 px, sem alegar 320 px nele.
Zero pageerrors/requisições externas; console.error não tem coletor dedicado.
Teclado Enter foi exercitado; esta suíte não acrescenta prova de trap/retorno de
foco, zoom físico ou leitor de tela.

## Revisão e correções

Revisões independentes encerraram sem bloqueadores. Negativos reproduziram antes
e passaram após corrigir GET pendurado, controle substituído antes do RPC,
checkpoint externo sem revisão, A→B no modal de cancelamento, ativação abortada,
processed nulo, geração inválida, schema futuro e validação do binding físico.

O primeiro validate parou em formato de dois testes. O seguinte teve 1.750 testes
positivos, mas funções em 89,82%. Cinco jornadas adicionais cobriram paginação,
retomada e composição pública; produção, limites e exclusões não foram alterados.
Quatro execuções visuais anteriores positivas e um lote interrompido estão
separados das 13 finais. Um erro de descoberta executou zero testes; removeu-se
somente o grep redundante da configuração externa, mantendo limites e retries.

Após o validate verde, somente documentação/AGENTS foram realinhados; check:docs,
formato dos documentos afetados e diff --check passaram. Nenhuma dependência nova. Npm ci
de Functions: exit 0, zero vulnerabilidades; aviso de engine Node 22 versus Node
24.21.0 local. Build mantém os avisos existentes de chunk grande/importação DOCX.

## Limitações e pendências

Exclusão integral continua no próximo incremento: reter bases/bindings/pins até
esse protocolo. Sem merge, deploy, compartilhamento, sessões ou comércio nesta
entrega. Antes de habilitar adoção num ambiente, implantar todos os escritores do
relógio e drenar versões antigas; manutenção Admin deve participar atomicamente.
Testes locais não comprovam esse rollout ou produção. O relógio do UID permanece
independente de uma campanha. Pilotos humanos e gates comerciais seguem pendentes.
Checkout original `master 522ccaa` foi conferido limpo e preservado.

## Evidência e verificação manual

Artefatos em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9`:
`writer-v2-campaign-adoption-validate.log`, duas tentativas anteriores preservadas,
logs dos emuladores e `writer-v2-campaign-adoptions-qa/qa-summary.json` com
resultados/limitações, `captures-final.json`, PNGs e traces anteriores.

1. Criar uma campanha de aventura própria e adaptar uma ficha inteira na mesa.
2. Preparar candidata em que essa ficha deixou de ser referenciada e comparar.
3. Iniciar revisão, escolher manter legado e preparar; a base atual segue legível.
4. Adotar explicitamente e conferir nova base, ficha legada e notas próprias.
5. Retirar/restaurar a ficha, descartar só seu override e conferir o anchor antigo.
6. Revogar a origem: conteúdo derivado fica oculto; notas próprias continuam.
7. Preservar pedido sem resposta, recarregar e confirmar o mesmo pedido. Outra aba
   com controle novo deve sobreviver à confirmação antiga.
