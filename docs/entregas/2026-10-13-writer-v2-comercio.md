# Writer V2 — Contrato comercial e direitos

- **Data:** 2026-10-13.
- **Branch/base:** `codex/writer-v2`, `9177432`.
- **Plano:** [W2-F1-04](../tasks/writer-v2/fase-01-direcao-e-fundamentos/04-regras-comerciais-e-direitos.md).

## Resultado

Contrato documental incorpora as escolhas humanas de taxas/reversões do criador,
comissão devolvida proporcionalmente, suspensão durante disputa, acesso mantido no
refund parcial e revogado no integral/perda; notas próprias preservadas.
Plataforma brasileira confirmada pelo operador. Proposta direct charges distingue
taxas do criador, perdas incobráveis, saldos, comissão, principal e payout.
Não houve alteração de código, dependências, regras, conta Stripe ou cobrança.

## Arquivos e critérios

| Arquivo                                                                    | Resultado                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Contrato](../tasks/writer-v2/execucao/04-regras-comerciais-e-direitos.md) | Escolhas, proposta Connect, evidência de sandbox, estados, atendimento e casos futuros     |
| [Cálculos](../tasks/writer-v2/execucao/04-cenarios-monetarios.json)        | Quatro cenários fictícios em centavos, comissão acumulada e payout                         |
| [Referência](../tasks/writer-v2/execucao/04-produto-de-referencia.md)      | Texto original de demonstração com assistência de IA; manifesto sem terceiros incorporados |
| Contrato de permissões                                                     | Projeção explícita da identificação comercial, separada de perfil/Stripe/KYC               |
| Tarefa, execução e decisões                                                | Estados reais e pendências atualizados                                                     |

Critérios comerciais de capacidade live, contratos, tarifas, reserva, prazos fiscais,
autorização de produto e ensaio remoto continuam abertos. Não foram substituídos
por aprovação documental ou validação aritmética.

## Validação observada

Windows, Node 24.21.0/npm 10.6.0; functions instaladas neste checkout.

| Verificação                                                                     | Resultado                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Cálculo local do JSON                                                           | Quatro cenários, três refunds acumulados e um payout conferidos; código 0                      |
| npm run validate                                                                | Código 0; gates completos passaram                                                             |
| Frontend/cobertura                                                              | 116 arquivos/851 testes; 92.86% statements, 86.43% branches, 91.32% functions, 94.93% lines    |
| Backend/syntax                                                                  | 87 testes passaram; zero falhas; syntax check passou                                           |
| Scripts, lint, arquitetura, docs, styleguide, formato, typecheck, build e smoke | Passaram no gate                                                                               |
| Revisão independente                                                            | Dois achados corrigidos/reconferidos; sem bloqueador remanescente; 25 links locais verificados |

```text
Aritmetica documental OK: 4 cenarios, 3 refunds acumulados e 1 payout. Sem Stripe remoto.
Test Files 116 passed (116)
Tests 851 passed (851)
All files | 92.86 | 86.43 | 91.32 | 94.93 |
tests 87; pass 87; fail 0
Smoke test do bundle OK.
```

Gate completo foi iniciado antes das correções documentais da revisão; docs,
formato scoped e diff são reconferidos após elas e este registro.
Build mantém avisos de chunks acima de 500 kB/importação dinâmica ineficaz de exportDocx.
Nenhum teste de comportamento comercial V2 foi apresentado como executado.

## Pesquisa e conta de teste

Fontes oficiais Stripe, Mercado Pago, CDC, Decreto 7.962 e LGPD consultadas somente
para definir requisitos; links/data ficam no contrato. Não é validação jurídica ou fiscal.
Browser Edge mostrou duas contas sandbox Restricted, nenhuma Enabled. Conta
inspecionada tem país Brazil, moeda BRL, pagamentos/payouts pausados e requisitos
pendentes. Pagamento exibido é demonstração automática Stripe, não execução Writer.
Nenhuma chave, cadastro pessoal, saldo ou identificador privado foi salvo neste registro.

## Próximas condições

1. Conferir configuração/capacidades e resolver cadastro de teste com o operador.
2. Ensaiar integração Writer na fase financeira, depois confirmar disponibilidade live.
3. Fechar contratos concretos, tarifas/reserva/calendário e dados de fornecedor.
4. Revisar/autorizar produto e componentes antes de qualquer venda.
5. Avançar W2-F1-05 em protótipos/roteiros; participantes reais ainda serão indicados.

Sem push, deploy, teste financeiro remoto ou aceite humano/CI. W2-F1-04 continua
em execução por condições externas; trabalho independente prossegue.
