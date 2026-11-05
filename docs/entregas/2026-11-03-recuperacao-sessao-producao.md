# Recuperação da sessão de produção — 2026-11-03

## Incidente e diagnóstico

Na sessão Edge de `https://writer-44cd5.web.app/universes`, o formulário de
criação permanecia em Salvando. O console registrava Firestore 13.1.0 com
`INTERNAL ASSERTION FAILED`, ID `3c6b`, e contexto
`auth/network-request-failed`. A última ocorrência observada era de 21:38 UTC.
Uma segunda aba também permaneceu inicialmente em Carregando sessão.

Hosting respondeu HTTP 200 pelo terminal. Os endpoints públicos de Auth
securetoken e identitytoolkit responderam HTTP 400 para pedidos deliberadamente
sem credenciais, com MISSING_GRANT_TYPE e MISSING_ID_TOKEN, respectivamente.
Isso comprova alcance naquele momento, sem provar a renovação do token original.

O [relato upstream 9499](https://github.com/firebase/firebase-js-sdk/issues/9499)
descreve o mesmo ID/contexto em versões anteriores. Não demonstra a causa
específica deste incidente nem justifica downgrade automático.

## Recuperação e prova autenticada

Após recarregar a aba original, a sessão autenticada voltou a carregar.
O diálogo inicial foi fechado e a lista apresentou Nenhum universo cadastrado.
Foi então retomado o cadastro original, com nome Harry Potter e descrição vazia.
O salvamento terminou e a lista exibiu Harry Potter, com zero vínculos.
O link de lore retornado pela interface usa o ID
`73efd752-d545-4cd8-873d-d078f18d00e9`.

A captura da interface foi inspecionada no navegador. A aba original foi mantida
aberta e a aba auxiliar de diagnóstico foi fechada. Os erros antigos continuam
no histórico do console; não foi observada nova ocorrência durante o cadastro.

## Limites e estado de entrega

Recuperação operacional da sessão e criação real confirmadas pela interface.
A causa inicial da falha de rede e a prevenção de recorrência continuam abertas.
Não houve alteração de código, Rules, IAM, dependências ou configuração remota;
não houve deploy, commit, push ou execução de testes automatizados.

A consulta administrativa de estado via Firebase CLI não foi concluída:
as credenciais locais foram recusadas como expiradas. Isso não impediu o fluxo
autenticado do produto; qualquer futura inspeção administrativa exige renovar
essa autenticação. Não foram expostos nem copiados tokens.

Os arquivos de documentação previamente modificados foram preservados.
