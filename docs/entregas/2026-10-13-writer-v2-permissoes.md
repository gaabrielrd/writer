# Writer V2 — Contrato de permissões e privacidade

- **Data:** 2026-10-13.
- **Branch/base:** `codex/writer-v2`, `4487743`.
- **Plano:** [W2-F1-03](../tasks/writer-v2/fase-01-direcao-e-fundamentos/03-permissoes-e-privacidade.md).

## Objetivo e resultado

Definir quem pode operar cada recurso, quais campos cada audiência recebe e como
convite, revelação, revogação, cache e arquivos respeitam os direitos vigentes.
Entrega documental; nenhuma regra V2 implantada ou acesso real concedido.

## Critérios documentais

- [x] Operações delimitadas por recurso/papel e identidade verificada.
- [x] Listas fechadas para revisão, portal, leitor, comprador e catálogo.
- [x] D-03/D-04 e classificação técnica D-09 especificadas, sem inventar retenção financeira.
- [x] AP-01 a AP-18 e casos de leitor/streaming definidos para testes de implementação.
- [x] Revisão independente concluída, achados corrigidos e reconferidos.
- [x] Gate completo local passou.
- [ ] Testes de regras V2/autorizações reais e CI: ainda dependem da implementação.

## Arquivos alterados

| Área                                                                   | Mudança                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Contrato](../tasks/writer-v2/execucao/03-permissoes-e-privacidade.md) | Matriz, projeções, convite, revelações, dados locais, arquivos e casos negativos |
| W2-F1-03/índices/registro de execução                                  | Evidência e estado local                                                         |
| Inventário W2-F1-01                                                    | Precisão sobre acesso SDK das capas versus URLs bearer                           |
| Decisões e riscos                                                      | D-03/D-04/D-09 técnico e novas respostas comerciais do operador                  |
| Este registro                                                          | Evidência documental                                                             |

## Testes e validações

Não houve código, regras, dependências ou testes de comportamento alterados.
Ambiente Windows, Node 24.21.0/npm 10.6.0; functions já instaladas nesta base.

| Verificação                             | Resultado observado                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| npm run validate                        | Código 0; todos os gates passaram                                                            |
| Frontend/cobertura                      | 116 arquivos, 851 testes; 92.86% statements, 86.43% branches, 91.32% functions, 94.93% lines |
| Backend/syntax                          | 87 passaram, zero falhas; syntax check passou                                                |
| Scripts, lint, typecheck, build, smoke  | Passaram no gate                                                                             |
| Revisão independente                    | 43 links existentes; dois achados corrigidos e reconferidos, sem bloqueador remanescente     |
| Docs/formato scoped/diff após correções | Passaram                                                                                     |

```text
 Test Files  116 passed (116)
      Tests  851 passed (851)
All files          |   92.86 |    86.43 |   91.32 |   94.93 |
ℹ tests 87
ℹ pass 87
ℹ fail 0
Smoke test do bundle OK.
```

Revisão explicitou regra positiva de lore por capítulo/Mostrar spoilers, preservando
publicação legada, e a possibilidade de concluir uma transferência iniciada antes
da revogação. Nenhum caso esperado foi apresentado como teste real executado.
Build mantém avisos de chunks grandes/importação dinâmica de exportDocx.
Gate completo precede as correções finais documentais; docs/formato são repetidos após elas.

## Respostas comerciais e consulta preparatória

Operador escolheu criador absorvendo taxas/reversões; reserva por contrato.
Reembolso integral/disputa perdida revoga acesso/download futuro e preserva notas próprias.
Connect ainda precisa de verificação. Consulta somente leitura no navegador observou
sandbox na seleção do fluxo Connect, sem confirmar opções, configurar conta, obter
credenciais ou testar pagamentos. Não é evidência de onboarding/capabilities live.

## Fora do escopo e limitações

Sem emulador/E2E de regras V2, implantação, convite enviado, cobrança, push ou deploy.
Downloads já obtidos não podem ser apagados remotamente; transferências já iniciadas
podem terminar. Corpo pago e segredo não usarão token permanente de capa.
Retenção comercial e arranjo Connect dependem de W2-F1-04; CI/humano não comprovados.

## Verificação manual

1. Escolher um ator da matriz e conferir operações negadas em outro recurso.
2. Percorrer convite de conta errada, revogação e resposta tardia.
3. Conferir lore futuro/privado fora da resposta padrão e da opção de spoilers.
4. Conferir que base revogada não volta por variante e notas próprias estão separadas.
5. Usar AP-01 a AP-18 como entradas dos testes futuros de servidor/regras/navegador.
