# Transição unificada de temas

ThemeProvider aplica classes e tokens em uma única atualização coordenada.
Nos navegadores com View Transitions, a interface inteira dissolve em 240 ms,
suspendendo as transições locais durante a troca. Isso evita tempos diferentes
entre superfícies, botões, texto e ícones. Há fallback com transições de cores
uniformes, sem delay. Primeira aplicação e movimento reduzido não animam.

Trocas rápidas cancelam a captura anterior e descartam atualizações obsoletas.
A limpeza de tokens ocorre na desmontagem, em vez de remover a paleta antes
de capturar a aparência anterior. Temas nativos e personalizados reutilizam
o mesmo caminho, incluindo prévia.

Código e diff revisados e arquivos formatados. Nenhum teste, validate, build
ou navegador executado, conforme orientação do usuário. Validação visual
e funcional pendente. Alteração local, sem commit, push ou deploy.
