# ADR 0299 — ativação editorial vinculada ao censo nativo

- Estado: implementação local; testes preparados sem execução.
- Data: 2026-11-04.

## Contexto

O inventário v15 já prepara arquivo original, contrato/planos editáveis e censo
completo. A ativação v14 não reconhecia esses recursos. Substituir seu selo base
na retirada de um pedido destruiria o vínculo preservado pelo censo editorial.

## Decisão

Compor a ativação existente com o verificador editorial, sob opção interna
`editorialActivation` desligada por padrão e independente da admissão de novas
fontes. Incluir no reviewToken e no recibo de ativação o contexto e os tokens
nativos de controle/selo. Exigir certificado somente em ativações v15/source2.
Não aceitar essa prova ou a opção pelo cliente.

Criar a raiz privada com os clocks literários nativos da nova adoção. Preservar
as partes históricas, contrato em orientação, planos propostos e referências
pendentes. Manter os efeitos de contagem, universo, personas e capa na transação
final existente. Política declarada não equivale a publicação.

Retirar pedido incerto pela troca atômica do selo editorial, conservando base,
ledger e provas. Permitir essa retirada e a confirmação histórica com a opção
desligada. Novas ativações exigem revisão atual; replay nunca recria a raiz.

## Consequências

O caminho pode preparar testes de edição normal e exclusão sobre uma cópia
ativada real. Ele não habilita a interface, não concede leitura por confirmação
histórica e não completa a portabilidade pública. Leitor autorizado, pendências
com CAS, recaptura e gates de integração permanecem obrigatórios. Testes Node/SDK
estão preparados e ainda não foram executados neste incremento.
