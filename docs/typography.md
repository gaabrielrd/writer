# Tipografia literária

Preferências → Tipografia literária oferece cinco presets de fontes e a opção
Personalizado. Clássico editorial é o padrão de quem ainda não tem uma escolha
válida salva.

| Preset                  | Títulos            | Interface     | Editor         |
| ----------------------- | ------------------ | ------------- | -------------- |
| Clássico editorial      | Libre Baskerville  | Source Sans 3 | Source Serif 4 |
| Romance humanista       | EB Garamond        | IBM Plex Sans | EB Garamond    |
| Contemporâneo acolhedor | Lora               | Nunito Sans   | Lora           |
| Leitura digital         | Literata           | Source Sans 3 | Literata       |
| Poético                 | Cormorant Garamond | IBM Plex Sans | Crimson Pro    |

Cada papel pode usar qualquer uma das dez famílias da tabela. Alterar um papel
cria uma combinação personalizada a partir das fontes exibidas. Trocar somente
o preset conserva a combinação personalizada anterior para retomá-la pela opção
Personalizado.

## Prévia e salvamento

Os seletores aplicam uma prévia global, incluindo menus e portais, sem gravar a
escolha. Salvar fontes confirma a gravação local; Cancelar prévia ou sair da
página restaura a escolha salva. Falha de armazenamento mantém os ajustes na
prévia e informa que não foram salvos. A aplicação das fontes não remonta o
editor nem modifica o manuscrito.

A preferência é independente das cores Claro/Escuro/Sépia e das paletas
personalizadas. Trocar cores conserva as fontes. O padrão Clássico editorial
também é a base CSS antes da montagem dos providers.

A escolha pertence à conta **neste navegador**, seguindo uma chave local isolada
por UID; a sessão anônima tem chave distinta. Logout ou troca de conta remove a
prévia e carrega somente a escolha do novo usuário. Não há sincronização de
fontes entre dispositivos nem alteração dos documentos de temas no Firestore.

## Implementação

- `src/shared/typography`: catálogo fechado, parser, provider e hook neutros em
  relação ao domínio. A composição em app fornece o UID.
- `src/shared/services/typographyStorage.ts`: único acesso ao armazenamento da
  preferência (`writer:typography:v1:user:{uid}` ou sufixo `anonymous`).
- `src/shared/ui/TypographyPreferences.tsx`: seletores e amostra pelos componentes
  compartilhados. Também está disponível em `/styleguide`.
- `--font-display`, `--font-sans` e `--font-reading`: títulos, interface e prosa.
  Escrita, leitura, histórico e prévias reutilizam os tokens, sem gerar estilos
  portáteis dentro dos documentos nem alterar exportações.

Somente os nomes da lista permitida chegam aos tokens CSS. Dados inválidos,
JSON corrompido ou falha de leitura usam o padrão. Nenhum CSS livre, URL ou nome
de família arbitrário é aceito pelo armazenamento.

## Arquivos das fontes

As famílias foram obtidas do Google Fonts e são servidas pela própria aplicação,
sem requisições a serviços de fontes em tempo de uso. `src/styles/literary-fonts.css`
define arquivos WOFF2 variáveis de pesos 400–700, normais e itálicos, nos subconjuntos
latin e latin-ext. O navegador baixa os arquivos usados; `font-display: swap`
preserva texto visível durante o carregamento e há fontes de reserva.

`public/fonts/literary` contém os arquivos e a licença OFL de cada família.
`sources.json` registra os endereços de origem, tamanhos e SHA-256 dos 40 arquivos
WOFF2 (aproximadamente 1,67 MB no total, sem exigir o download integral de todas
as fontes para abrir a página). Preserve licenças e procedência ao atualizar.

## Verificação

- Unidade e interface: `npx vitest run src/shared/typography/tests`.
- Integração visual com serviços fictícios e rede externa bloqueada:
  `npx playwright test --config playwright.visual.config.ts e2e/visual/typography.visual.ts`.
- A jornada visual cobre os cinco presets, fontes locais reais, escolha
  personalizada, salvar/cancelar, recarga, styleguide, editor e troca de conta nos
  três temas de desktop.
