# Otimização local da suíte de testes

- **Data:** 2026-11-02
- **Branch:** `codex/test-suite-optimization`
- **Destino autorizado:** `codex/writer-v2`
- **Plano de origem:** plano aprovado na conversa.
- **Estado:** implementação local medida; validação global vermelha, conforme resultados abaixo.

## Objetivo

Reduzir trabalho repetido e oferecer execuções que pesam menos durante o
desenvolvimento, preservando os casos, volumes, isolamento e limites de cobertura.

## Funcionalidades entregues

- `test:changed` seleciona alterações locais e dependentes com dois workers;
  `test:light` executa todo o frontend sem cobertura com dois workers.
- O setup só importa React, matchers DOM e limpeza do navegador quando há
  `window`. Vinte e cinco testes puros usam a diretiva Node já existente.
  São 124 arquivos Node e 253 com DOM, em um único projeto Vitest.
- Sanitização HTML, contagem renderizada e extração de capítulos conservam DOM.
- O pre-push mantém typecheck completo e usa o SHA real do destino, com
  fallback completo para branch nova, histórico indisponível/divergente,
  múltiplos destinos ou envio de outro commit.
- Fixtures da CLI copiam somente seus arquivos de entrada. Preservam CLI real,
  idempotência, dry-run, remoção do exemplo e rollback. Scripts usam dois processos.
- A cobertura mantém os limites e também salva `coverage/results.json`.
- O medidor PowerShell 7 registra tempo e memória/CPU amostrados, confere criação
  dos processos para evitar reutilização de PIDs e encerra a própria suíte se falhar.

## Critérios de aceite

- [x] Os mesmos 5.134 casos de frontend são descobertos e executados.
- [x] Nenhum corpo, asserção ou volume dos 25 testes existentes foi alterado.
- [x] Limites permanecem em 85% statements/lines, 75% branches e 90% functions.
- [x] Dois perfis de concorrência medidos com os mesmos 164 casos.
- [x] Casos existentes de setup/rollback preservados e sete testes do hook acrescentados.
- [x] Sem dependências novas ou mudanças de código de produto no diff da otimização.
- [ ] `npm run validate` verde: a base já tinha falhas e o fechamento ainda falha.

## Medições

[Dados, condições e identidade dos casos](2026-11-02-otimizacao-suite-testes/benchmarks.json).

Windows, Ryzen 7 7700, 16 processadores lógicos, 31,64 GiB informados pelo
sistema, Node 24.21.0 e npm 10.6.0. Dependências fixadas instaladas também em
Functions. Execuções sequenciais, sem outra suíte concorrente.

| Etapa                                  |              Original |                  Final | Escopo                                                 |
| -------------------------------------- | --------------------: | ---------------------: | ------------------------------------------------------ |
| Frontend com cobertura, quatro workers |              925,08 s |               737,38 s | Mesmos 5.134 casos; redução observada de 20,29%        |
| Scripts de infraestrutura              | 31,78 s; 94 aprovados | 13,51 s; 101 aprovados | Inclui sete testes novos; concorrência final 2         |
| Recorte sem cobertura, quatro workers  |               26,40 s |                26,24 s | Mesmos 164 casos aprovados; duração praticamente igual |

O recorte controlado compara a mesma fonte de produto em `9a0a7ee` e os mesmos
oito arquivos, listados no JSON. A configuração original foi reproduzida
temporariamente com restauração integral dos arquivos ao terminar.

| Perfil do recorte        |   Tempo | Pico residente amostrado | Memória privada amostrada |
| ------------------------ | ------: | -----------------------: | ------------------------: |
| Original, quatro workers | 26,40 s |              1.684,9 MiB |               1.916,6 MiB |
| Final, quatro workers    | 26,24 s |              1.634,6 MiB |               1.884,0 MiB |
| Econômico, dois workers  | 40,97 s |              1.027,1 MiB |               1.326,1 MiB |

Dois workers reduziram o pico residente em 39,04% nesse recorte, aumentando o
tempo em 55,18%. O custo de CPU total amostrado ficou próximo. O perfil reduz
concorrência e pressão de memória; não deve ser apresentado como aceleração.

A comparação completa começa em `7b13b71`. O fechamento incorpora o commit
paralelo de interface/temas `9a0a7ee`. Uma execução por perfil e caches não
reiniciados não comprovam ganho estatístico nem isolam toda a variação de tempo.
Os números são observações locais. As estimativas iniciais de memória/CPU do
medidor v1 foram descartadas por não tratarem reutilização de PIDs; as tabelas
de memória usam apenas o medidor v2. Working sets somados podem contar páginas
compartilhadas mais de uma vez.

## Arquivos alterados

| Grupo                                                        | Mudança                                    |
| ------------------------------------------------------------ | ------------------------------------------ |
| `package.json`, `.husky/pre-push`, `scripts/run-push-tests*` | Perfis, seleção por destino e contratos    |
| `src/test/setup.ts`, `src/test/setupDom.ts`, 25 testes       | Setup condicional e diretivas Node         |
| `scripts/setup.test.mjs`                                     | Fixture mínima com os mesmos cenários      |
| `scripts/measure-tests.ps1`                                  | Medição Windows com árvore de processos    |
| README, processo, testes e ADR 0268                          | Comandos, condições e limites das medições |

## Testes

| Verificação                                    | Resultado real                 |
| ---------------------------------------------- | ------------------------------ |
| Recorte original/final com quatro/dois workers | 164 aprovados em cada execução |
| Casos dirigidos de lógica e DOM                | 6 arquivos; 107 aprovados      |
| Hook, setup e contratos da CI                  | 22 aprovados                   |
| Scripts completos com concorrência 2           | 101 aprovados                  |
| Frontend original                              | 5.077 aprovados; 57 falhas     |
| Frontend final                                 | 5.087 aprovados; 47 falhas     |

O hash do multiconjunto de arquivo/título/quantidade é idêntico para os 5.134
casos das duas execuções completas e para os três recortes controlados.
As falhas finais e as diferenças por caso estão no JSON; não basta comparar
somente a contagem de falhas. Quarenta e dois IDs já falhavam originalmente.
Outros quatro são timeouts de cinco segundos nos mesmos arquivos instáveis de
lore: passaram isoladamente, sem cobertura (4 aprovados em 7,39 s).
Isso não transforma a execução completa em verde.
A expectativa antiga de AuthButton também falha com a configuração original
sobre o commit paralelo 9a0a7ee: o rótulo do menu mudou de
`Configurar inteligência artificial` para `Inteligência artificial`.
A otimização não altera esse componente ou sua asserção.

## Validações executadas

`npm run validate` executou skills, arquitetura, documentação, styleguide,
formatação e lint completo com sucesso. Parou no frontend. Portanto não
comprova backend ou build nessa invocação.

```text
Test Files  11 failed | 366 passed (377)
Tests       47 failed | 5087 passed (5134)
Duration    737.38s
Statements  89.41%
Branches    85.55%
Functions   90.27%
Lines       92.54%
```

Os quatro limites de cobertura foram atendidos. Os checks separados passaram:

| Comando/check                  | Resultado                           |
| ------------------------------ | ----------------------------------- |
| `npm run test:book-generation` | 4.891 testes aprovados, zero falhas |
| Sintaxe de Functions           | 488 módulos checados                |
| `npm run build`                | Typecheck, bundle e smoke aprovados |
| `npm run check:docs`           | Aprovado                            |
| `git diff --check`             | Sem erros                           |

```text
tests 4891
pass 4891
fail 0
Functions syntax checked: 488 modules
Smoke test do bundle OK.
```

CI remota e testes visuais não foram executados nesta entrega de infraestrutura,
conforme o fluxo local autorizado. Os workflows e a matriz visual não mudaram.

## Fora do escopo

Correção de comportamento de produto, redução de volumes, exclusão de testes,
alteração da matriz visual, workflows, regras de segurança ou implantação.

## Limitações e pendências

A base original não está verde. Há expectativas de interface desatualizadas
e timeouts em jornadas de grandes volumes. O fechamento preserva os casos;
não constitui aprovação global do produto. Seleção por dependências conhecidas
não substitui os portões completos ou revisão de dependências dinâmicas.

## Como verificar manualmente

1. Em uma árvore limpa, execute `npm run test:changed`; não executar casos é esperado.
2. Altere um teste e repita o comando para conferir a seleção.
3. Execute `npm run test:light -- caminho/do/arquivo.test.ts` para limitar recursos.
4. Para o fechamento, execute `npm run validate` e confira `coverage/results.json`.
5. Reproduza as medições com `scripts/measure-tests.ps1`, mantendo casos e flags iguais.
