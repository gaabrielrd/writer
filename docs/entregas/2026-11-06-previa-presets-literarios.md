# Prévia de cinco presets literários

Página HTML independente para validar a direção tipográfica antes da integração
com o Writer. Os arquivos da aplicação e as preferências das contas permanecem
como estavam.

## Artefato

Arquivo local: `C:/Users/gaabr/.codex/visualizations/2026/11/06/01a1b03a-5e7f-7361-82d8-d552e1864dac/presets-literarios.html`.

A página abre diretamente no navegador e carrega as fontes pelo Google Fonts.
As referências de cada família estão disponíveis na própria página.

| Preset                  | Títulos            | Interface     | Editor         |
| ----------------------- | ------------------ | ------------- | -------------- |
| Clássico editorial      | Libre Baskerville  | Source Sans 3 | Source Serif 4 |
| Romance humanista       | EB Garamond        | IBM Plex Sans | EB Garamond    |
| Contemporâneo acolhedor | Lora               | Nunito Sans   | Lora           |
| Leitura digital         | Literata           | Source Sans 3 | Literata       |
| Poético                 | Cormorant Garamond | IBM Plex Sans | Crimson Pro    |

Permite combinar as dez famílias independentemente nos três papéis, ajustar
tamanho/entrelinha da prosa, editar um trecho, trocar Claro/Sépia/Escuro,
restaurar o preset de origem e exportar a configuração em JSON. As escolhas e o
texto editado ficam apenas na sessão da página; a exportação guarda somente a
configuração tipográfica. A indicação de indisponibilidade das fontes identifica
o uso de fontes de reserva.

## Evidência

- Chromium: cinco presets com famílias computadas corretas nos três papéis.
- Carregamento real das dez famílias pelo Google Fonts; nenhuma falha de rede
  ou erro JavaScript na jornada conectada.
- Três temas, combinação personalizada, tamanho e entrelinha, contagem de
  palavras, exportação JSON e restauração conferidos. Restaurar preserva o texto
  de exemplo editado.
- Sem transbordamento horizontal da página em 1440, 1024, 800 e 390 px. O último
  tamanho foi uma conferência adicional do artefato, sem ampliar o suporte do app.
- Bloqueio simulado dos domínios de fontes mostrou corretamente o aviso de
  fallback.
- Capturas Sépia/Clássico e Escuro/Poético inspecionadas visualmente no diretório
  do artefato.
- A primeira tentativa de abrir Chromium no sandbox falhou com `spawn EPERM`;
  a verificação foi concluída fora do sandbox. Uma asserção inicialmente esperava
  dez palavras em uma frase com nove; a expectativa foi corrigida e a jornada
  completa passou.

`npm run validate` não foi executado: entrega de protótipo independente, sem
commit ou merge. Não houve integração do seletor de fontes à aplicação,
persistência por conta, commit, push ou deploy.
