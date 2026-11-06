# Central de ajuda do Writer

## Objetivo e escopo

Oferecer consulta contínua, em português, aos conceitos, processos e recursos do
Writer. O operador pediu cobertura equilibrada de toda a plataforma. O onboarding
continua sendo a apresentação inicial; a ajuda permite pesquisar e voltar a um
assunto em qualquer momento.

## Plano

1. Conferir navegação, onboarding, contratos e documentação de recursos existentes.
2. Criar `help` como feature de conteúdo local, sem dependências de outras features.
3. Escrever conceitos, exemplos, passos e limites por assunto.
4. Compor `/help` nas rotas e oferecer Ajuda na lateral e no cabeçalho público.
5. Verificar busca, categorias, URLs diretas, leituras relacionadas, retorno,
   acesso anônimo e temas; revisar o diff e documentar os resultados reais.

## Decisões e critérios de aceite

- Página pública de consulta, com links de tarefas que conservam os gates nativos
  dos destinos. Ler ajuda não envia prompts nem executa mutações de projeto.
- Conteúdo igualmente voltado a autores e mestres, agrupado em 11 assuntos.
- Busca global por título, resumo, palavras-chave e corpo, sem distinção de caixa
  ou acentos; múltiplos termos precisam estar presentes no artigo.
- Busca (`q`), assunto (`topic`) e artigo (`article`) representados na URL.
  Links abrem artigos diretamente; voltar/avançar e recarregar conservam o destino.
- Trocar de assunto inicia sua lista; digitar na busca pesquisa toda a ajuda.
- Artigos contêm explicações e, conforme a tarefa, passos, exemplos, cuidados,
  leituras relacionadas e destinos reais. Artigo inexistente e busca sem
  resultados oferecem recuperação explícita.
- Componentes do kit, cores semânticas, foco de leitura ao abrir artigo e
  navegação por teclado. Verificação nos três temas em desktop/laptop.

## Fontes e cobertura

| Assunto                 | Fontes de produto e comportamento                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primeiros passos        | [Primeiro acesso](../first-use.md), [README](../../README.md)                                                                                                                                                                                                                                                                                            |
| Estúdio e projetos      | Rotas reais, navegação e [criação](../assisted-book-creation.md)                                                                                                                                                                                                                                                                                         |
| Livros e escrita        | [Cenas](writer-v2/execucao/08-planejamento-de-cenas.md), [narrativa](writer-v2/execucao/09-arcos-e-cronologia.md), [progresso](writer-v2/execucao/10-estados-metas-e-retomada.md), [histórico](writer-v2/execucao/11-historico-e-restauracao.md), [minimapa](../chapter-minimap.md)                                                                      |
| Aventuras               | [Blocos e prévias](writer-v2/execucao/12-aventuras-e-blocos.md)                                                                                                                                                                                                                                                                                          |
| Campanhas e sessões     | [Campanhas](writer-v2/execucao/14-campanhas-e-variantes.md), [comparação](writer-v2/execucao/18-comparacao-de-bases-da-campanha.md), [adoção](writer-v2/execucao/19-adocao-explicita-de-base-da-campanha.md), [sessões](writer-v2/execucao/21-sessoes-privadas-da-campanha.md), [pistas e missões](writer-v2/execucao/24-pistas-missoes-e-pendencias.md) |
| Universos e Compêndio   | [Lore compartilhado](../shared-lore.md), [análise de texto](../lore-analysis.md), [importação de universo](../universe-lore-import.md)                                                                                                                                                                                                                   |
| IA e personas           | [Chat](../chapter-chat.md), [personas](../ai-personas.md), [provedores](../ai-provider-settings.md), [autocomplete](../entregas/2026-10-11-autocomplete-apos-digitacao.md)                                                                                                                                                                               |
| Imagens e capas         | [Biblioteca de imagens](../image-library.md), [criação](../assisted-book-creation.md)                                                                                                                                                                                                                                                                    |
| Importação e segurança  | [Documentos](../document-import.md), [portabilidade de livros](writer-v2/inventario-portabilidade-livros.md), [importação de aventuras](writer-v2/execucao/27-importacao-revisada-de-aventura.md)                                                                                                                                                        |
| Exportação e publicação | [Segurança de publicação](../publication-security.md), [README](../../README.md), espaços futuros da navegação                                                                                                                                                                                                                                           |
| Preferências e dúvidas  | [Tipografia](../typography.md), [temas](../custom-themes.md), [plataformas](../platform-support.md), [primeiro acesso](../first-use.md)                                                                                                                                                                                                                  |

## Não escopo e riscos

Não cria suporte por mensagem, CMS, telemetria, serviço de busca, novo assistente,
monetização, convites, colaboração ou capacidades futuras. Não altera Functions,
Rules, dados de usuário ou critérios de autorização. Não fixa preços nem catálogo
de modelos no texto, evitando duplicar valores que os fluxos já apresentam.

O principal risco é desatualização do conteúdo: ao mudar um recurso, revisar seus
artigos e links. A ajuda descreve a implementação presente no checkout e não
constitui prova de deploy ou de execução autenticada contra produção.
