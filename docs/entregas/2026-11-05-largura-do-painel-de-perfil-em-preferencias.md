# Largura do painel de perfil em Preferências

Somente o painel **Seu perfil de criação** recebeu um contêiner com largura de
100% e limite de 720 px. Os painéis **Área de trabalho** e **Data e horário**
mantêm seus estilos e dimensões anteriores, conforme a correção de escopo do usuário.

## Evidência

- Conferência pontual no Chromium com dados fictícios nos temas Escuro, Claro e
  Sépia, em janelas de 1440 e 900 px: os três painéis alinham em x=256 e medem,
  respectivamente, 720 e 618 px, sem transbordamento horizontal ou erros de execução.
- Captura visual conferida; documentação de primeiro acesso atualizada.
- Prettier, ESLint do componente, `check:styleguide` e `git diff --check` aprovados.
- Detector de layout sem achados nos dois arquivos alterados.

Ajuste visual local, sem mudança de comportamento ou novos testes de suíte.
Sem `npm run validate`, commit, push ou deploy. Alterações de outros trabalhos
foram preservadas.
