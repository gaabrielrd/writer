# Modais dentro da viewport

Solicitação: investigar modais que abrem fora da tela, durante o fechamento da
integração das branches locais.

O modal de Persona foi inspecionado na sessão autenticada de produção, sem
salvar alterações. Depois de carregar, sua caixa tinha y = -320,4 px em uma
viewport de 1974 × 1068 px. O assistente já estava dentro do foco modal.
O CSS compilado resetava transform, mas a centralização por translate continuava
ativa: a caixa era deslocada uma segunda vez para cima e para a esquerda.

A centralização do Dialog compartilhado usa agora somente transform. A regra
para filhos fixos pertence ao componente compartilhado e usa o slot neutro
data-dialog-viewport-child. O assistente declara esse slot ao entrar no diálogo;
o foco permanece no mesmo escopo modal e somente o corpo mantém a rolagem.

Foram preparados testes contra o CSS minificado de produção com um filho fixo,
conteúdo carregado após a abertura, rolagem, fechamento e retorno do foco.
O cenário de Persona cobre carregamento e redimensionamento em janelas de
1366 × 768, 640 × 480 e 320 × 640. A dimensão estreita é uma proteção de
responsividade existente, sem ampliar o suporte inicial do produto.

As validações locais continuam puladas por solicitação do usuário. A confirmação
da correção depende dos resultados remotos da revisão publicada na CI.
