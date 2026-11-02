# Tema e créditos no cabeçalho

O seletor de temas existente, incluindo temas personalizados, e o saldo
passam para a direita da barra contextual. A lateral conserva o perfil
no rodapé. Em telas estreitas os controles ocupam uma segunda linha à direita.

O menu do usuário oferece Preferências, Inteligência artificial e Sair.
Preservados o serviço de saída, o retorno contextual da configuração de IA,
os bloqueios de navegação/saída por operação pendente e os temas existentes.

Revisão de código e formatação realizadas. Nenhum teste, validate, build
ou validação no navegador executado, conforme orientação do usuário.
Implementação local, sem commit, push ou deploy. Validação pendente.

## Simplificação visual

Removidas as bordas do saldo no cabeçalho e do seletor de temas.
O seletor usa fundo transparente, inclusive na opção ativa, identificada
pela cor semântica e aria-pressed. Suas opções agora são Sépia, Escuro
e Personalizado, removendo Claro dessa seleção. Não foram alterados os
contratos das paletas salvas. Nenhum teste executado.

O padding esquerdo do cabeçalho usa space-4 no desktop, acompanhando o
conteúdo. No celular conserva space-3, também igual ao conteúdo.
Sem execução de testes neste ajuste.
