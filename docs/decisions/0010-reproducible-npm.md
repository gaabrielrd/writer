# 0010 - Versão exata do npm nos ambientes controlados

- **Status**: Aceito
- **Data**: 2026-08-08

## Contexto

`package.json` declarava `npm@10.6.0`, mas os jobs usavam o npm que acompanhava
cada versão do Node. A matriz podia, portanto, instalar o mesmo lockfile com
versões diferentes do gerenciador e a declaração não funcionava como garantia.

## Decisão

- Manter uma versão exata em `packageManager`.
- Fazer todos os jobs do CI instalarem essa versão antes de `npm ci`.
- Verificar a versão ativa com `npm run check:toolchain` e exibi-la nos logs.
- Manter a checagem fora de `npm run validate`, porque ambientes locais não são
  controlados e devem receber uma mensagem explícita apenas quando solicitarem a
  verificação.
- Atualizar Node, npm, matriz e lockfile como uma única mudança de toolchain.

## Consequências

Os jobs de Node 22 e 24 passam a usar o mesmo npm, reduzindo diferenças de
resolução e lifecycle. O CI ganha uma instalação global curta antes de cada
`npm ci`, e pessoas com outra versão local precisam instalar a versão declarada
para reproduzir exatamente o ambiente controlado.
