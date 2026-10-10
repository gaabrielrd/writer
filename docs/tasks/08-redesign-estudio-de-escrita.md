# Redesign do estúdio de escrita

## Objetivo

Revisar o layout antes de novas funcionalidades, com transparência, blur e bordas
arredondadas inspiradas no Tripo Studio e adaptadas a sessões longas de escrita.

## Plano e limites

1. Inspecionar a referência e os componentes existentes.
2. Definir tokens quentes e três temas, mantendo uma superfície de leitura opaca.
3. Atualizar shell, apresentação, login, biblioteca, livro, lore e editor.
4. Verificar responsividade, navegação, modais, foco e estados de conteúdo.
5. Rodar validações locais e capturas de navegador com dados fictícios.
6. Submeter como PR em rascunho para revisão visual; sem merge ou deploy automático.

Sem novas funcionalidades, alterações de autenticação, créditos, persistência ou
regras de acesso. Sem dependências novas ou reprodução de marca e imagens alheias.

## Critérios de aceite

- Hierarquia visual consistente e controles arredondados nas jornadas existentes.
- Temas claro, escuro, sépia e sistema preservados.
- Texto legível sobre superfície opaca; vidro com fallback e redução de movimento.
- Layouts desktop e mobile sem rolagem horizontal involuntária.
- Capturas reais da aplicação com dados explicitamente fictícios para revisão.
- Lint, tipos, testes, build, auditoria e suítes E2E sem regressões.
- Aprovação visual anterior à integração.

## Evidências

Os resultados verificados são registrados na entrega após validação. A captura
local depende de permissões de processo do Chromium; o CI é a alternativa para
capturas reais quando esse processo não pode iniciar no ambiente de trabalho.
