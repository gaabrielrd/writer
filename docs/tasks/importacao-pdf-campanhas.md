# Importação de aventuras PDF

Plano aprovado na conversa em 2026-10-12. Implementação isolada na branch
`codex/pdf-campanhas-dd`.

## Objetivo

Importar aventuras como o PDF de Phandelver em capítulos editáveis, respeitando
ordem de leitura, partes, apêndices, caixas e valores de fichas, com revisão antes
de gravar. Reutilizar o modelo de livros/capítulos e a extração local do PDF.js.

## Critérios de aceite

- O arquivo de referência produz Introdução, quatro partes e dois apêndices,
  nas páginas iniciais 2, 6, 14, 27, 42, 52 e 54, sem capa/sumário na prosa.
- Colunas são lidas por região e títulos precedem a prosa mesmo quando pintados
  por último. Subtítulos e salas numeradas permanecem dentro da seção.
- Formatação, listas, caixas, atributos/valores, dados, CD, XP e medidas são
  preservados como prosa segura. Tabelas ambíguas recebem aviso.
- Páginas sem texto (5, 13 e 43 no arquivo de referência) e imagens são
  identificadas na revisão, com acesso ao original.
- É possível conferir todo o conteúdo, dividir por bloco, unir capítulos,
  selecionar/renomear e cancelar a análise sem aceitar respostas antigas.
- A revisão funciona por teclado, nos três temas, em desktop/celular e 320 px.
- PDF de uma coluna, DOCX, Markdown, texto e HTML continuam compatíveis.
- Testes, lint, tipos, build, validação e documentação são verificados.

## Sequência

1. Extrair páginas, fontes e regiões preservando geometria e origem.
2. Reconstruir duas colunas por faixas, remover margens recorrentes e identificar
   sumário, seções, caixas e tabelas.
3. Converter para blocos de prosa segura e capítulos com páginas de origem.
4. Ampliar revisão, renderização local do original, divisão/união e cancelamento.
5. Cobrir comportamento com testes sintéticos e Chromium, além do arquivo real.
6. Executar `npm run validate`, revisar diff, atualizar documentação e registrar
   a entrega.

## Riscos e limites

PDF não garante semântica. Detecção de títulos, colunas, caixas e tabelas usa
heurísticas; a página original permanece disponível para conferência. Três ou
mais colunas/texto rotacionado são sinalizados, sem reconstrução garantida.
OCR, importação de mapas/imagens, reprodução da diagramação, lore por IA e
interpretação automática de atos ficam fora desta entrega. O PDF do usuário
é lido localmente e não é versionado.

## Incremento: títulos e subtítulos — 2026-10-12

Solicitado na conversa após a integração inicial. Corrigir o achatamento dos
subtítulos como `h2` e títulos quebrados em linhas, preservando seções e prosa.

1. Comparar a extração com páginas renderizadas do Phandelver.
2. Inferir os níveis internos pela tipografia, recompor linhas próximas e evitar
   que capitulares, ênfase inline e frases em negrito virem títulos.
3. Manter a correspondência do sumário após recompor marcadores/títulos.
4. Exibir a hierarquia na revisão, testar sintéticos/arquivo real e regressões
   de formatos, executar a validação e registrar a evidência.

Aceite: sete seções do Phandelver; níveis distintos para Esconderijo Dentefino,
Características Gerais e Conduzindo a Carroça; título Vulnerabilidades,
Resistências e Imunidades em um bloco; PDF de nove capítulos sem capa/sumário;
revisão nos três temas, desktop/celular e 320 px. Mesmo limite de extração local
por heurísticas, sem OCR ou interpretação por IA.
