# Plano integral de produção literária

Registro do plano apresentado neste chat, preservado para auditoria de escopo. Fonte: resposta do chat 01a19d46-d63f-7273-954a-01274befea7c. O texto abaixo registra o escopo aprovado, sem comprovar implementação ou aprovação dos testes; o estado real está em README.md e no relatório de validação. A solicitação posterior do autor autorizou os testes após incorporar a principal consolidada.

Sim. O plano é transformar o método do rulebook fornecido pelo autor (`rulebook_producao_literaria.md`) em um fluxo editorial integrado ao Writer, desde a concepção até a publicação, com o mesmo contexto orientando a IA durante a edição.

A base já documentada do Writer permite reaproveitar criação assistida, personas, lore, atos, cenas, arcos, cronologia, histórico, progresso e publicação. A implementação deve conectar e ampliar essas capacidades. Os detalhes de integração precisam ser conferidos no checkout escolhido, pois há muitas alterações locais em andamento.

A divisão proposta mantém **cinco etapas de implementação**, cada uma com entregas utilizáveis e critérios próprios de conclusão.

**1. Contrato do projeto e guia editorial**

**Objetivo:** registrar o que o autor quer construir e quais decisões orientam o trabalho.

Entregas:

- Contrato do livro: premissa, gênero, público, idioma, promessa de leitura, tom, limites de conteúdo, estrutura inicialmente prevista e política de publicação.
- Guia editorial: POV, tempo verbal, distância narrativa, cadência, diálogo, exposição, atmosfera, mistério e encerramentos, com exemplos opcionais do autor.
- Classificação das informações em **requisito, preferência ou hipótese**, separada da condição **aprovada, em desenvolvimento, proposta ou lacuna**.
- Registro versionado de decisões, justificativas, fontes e substituições.
- Modo de colaboração: orientação, execução supervisionada ou execução contínua dentro de um escopo definido.

Implementação sequencial:

1. Definir contratos de dados, validações e permissões no servidor.
2. Criar a área de contrato e guia no livro.
3. Ampliar a entrevista da criação assistida para preencher esses registros.
4. Permitir adoção do processo por livros existentes, recuperando decisões e identificando lacunas.
5. Implementar comparação e aprovação de propostas da IA.
6. Integrar contrato e guia às versões e ao histórico editorial.

A entrevista deve aproveitar informações já fornecidas. A IA pode sugerir uma resposta, mas precisa identificá-la como proposta. O padrão atmosférico do documento será uma possibilidade de guia, sem virar uma regra universal.

**Critérios de aceite:**

- Um livro pode nascer pela criação manual ou assistida e receber o mesmo contrato.
- Uma proposta da IA não substitui silenciosamente uma decisão aprovada.
- Alterar o guia preserva a versão anterior e identifica os trabalhos que podem precisar de revisão.
- O autor consegue adotar apenas os campos relevantes, sem preencher formulários extensos por formalismo.

**2. Arquitetura narrativa, continuidade e mapa do livro**

**Objetivo:** ligar série, livro, atos, capítulos e cenas por suas funções narrativas e transformações.

Entregas:

| Artefato                | Conteúdo principal                                                  |
| ----------------------- | ------------------------------------------------------------------- |
| Visão do livro          | Premissa, pergunta central, promessa e transformação final          |
| Continuidade de série   | Estado herdado, função de cada volume, fronteiras e reservas        |
| Tratamento do ato       | Entrada, pressão dominante, causalidade, custo, virada e saída      |
| Ficha do capítulo       | Objetivo, obstáculo, decisão, consequência, conhecimento e passagem |
| Conhecimento e relações | Quem sabe o quê, por qual fonte e em qual momento                   |
| Plantios e retornos     | Introdução, retomadas, payoff e reservas futuras                    |

Implementação sequencial:

1. Mapear esses artefatos para atos, cenas, arcos, eventos e lore existentes.
2. Acrescentar os campos e vínculos ausentes, preservando as identidades atuais.
3. Construir o mapa global de capítulos, com visualizações por ordem de leitura, cronologia e trajetória de personagem.
4. Separar cronologia real, ordem narrativa e aquisição de informação.
5. Implementar matriz de plantios, retornos e revelações.
6. Adicionar assistência de IA para propor arquitetura e auditar progressão.
7. Registrar conflitos e dependências entre fichas e manuscrito.

As auditorias devem apontar evidências e perguntas concretas: mudança sem antecedente, informação adquirida antes da fonte, repetição de função ou payoff sem preparação. Uma inferência incerta deve permanecer identificada como tal.

**Critérios de aceite:**

- Nenhuma quantidade fixa de atos, capítulos, cenas ou palavras é imposta.
- Planejamento e manuscrito são conteúdos distintos e vinculados.
- Uma divergência entre ficha antiga e fato estabelecido no texto aparece para reconciliação.
- Reorganizar capítulos conserva texto, referências e histórico.
- Os vínculos entre volumes identificam livro e unidade de origem; números de capítulos isolados não servem como identidade.

**3. Contexto editorial único para todos os recursos de IA**

**Objetivo:** fazer criação, chat, continuação, reescrita, autocomplete e análise usarem uma base coerente.

Entregas:

- Um contrato versionado de contexto de escrita.
- Seleção e prévia das fontes utilizadas.
- Registro de origem, versão e cobertura do contexto.
- Tratamento de fontes alteradas, removidas ou com acesso revogado.
- Aplicação segura das sugestões no manuscrito.

Implementação sequencial:

1. Inventariar as entradas atuais de IA e os contextos usados por cada uma.
2. Definir a composição comum: contrato, guia, persona, ficha da unidade, preparação, prosa pertinente, lore autorizado e reservas.
3. Estabelecer precedência entre fontes e tratamento de conflitos.
4. Integrar primeiro o chat e os comandos de escrita.
5. Integrar autocomplete e demais ações existentes, respeitando suas capacidades.
6. Ampliar a análise de lore para distinguir fato observado, interpretação e proposta.
7. Unificar recuperação de pedidos, invalidação e aceite transacional.

O contexto terá duas fronteiras: a IA editorial pode consultar reservas futuras para evitar contradições; a prosa produzida continua limitada ao conhecimento e às revelações permitidas para aquela unidade.

Para textos grandes, o sistema deve informar quais partes foram realmente lidas. Uma análise parcial não poderá aparecer como revisão integral.

**Critérios de aceite:**

- Recursos diferentes recebem as mesmas decisões editoriais vigentes.
- O autor consegue inspecionar as fontes efetivamente enviadas.
- Mudança relevante no texto ou nas fontes exige revalidação da sugestão antes do aceite.
- Provedor, modelo e raciocínio permanecem congelados durante o pedido.
- Aplicação de texto, crédito quando aplicável e recibo permanecem atômicos.
- Retentativas não duplicam inserção nem cobrança.
- Chaves e credenciais ficam fora de contexto persistido, histórico e recuperação.

**4. Produção de capítulos: preparar, escrever e revisar**

**Objetivo:** executar o ciclo completo de um capítulo, preservando versões e permitindo retomada segura.

Entregas:

1. Planejamento de cenas.
2. Worldbuilding local.
3. Gate pré-redação com evidências.
4. Primeira versão integral preservada.
5. Revisão de arquitetura e continuidade.
6. Revisão de prosa e experiência.
7. Versão revisada e relatório de alterações ou verificações.

Implementação sequencial:

1. Criar os três artefatos de preparação vinculados à ficha do capítulo.
2. Implementar critérios do gate com fonte, resultado e pendência.
3. Separar bloqueios estruturais de escolhas locais de encenação.
4. Acrescentar redação assistida por cena, com persistência progressiva.
5. Registrar a primeira versão no histórico nativo.
6. Implementar as duas camadas de revisão sobre o texto completo.
7. Apresentar correções para comparação e aplicação no escopo autorizado.
8. Reconferir invariantes e atualizar referências afetadas.
9. Implementar checkpoints, pausa, cancelamento e recuperação.

Os modos de colaboração definidos na etapa 1 passam a controlar a execução:

- **Orientação:** a IA analisa e sugere; o autor conduz a escrita.
- **Supervisionado:** cada fase aguarda o aceite previsto.
- **Contínuo:** o sistema executa as fases autorizadas até o limite estabelecido, com paradas por conflito ou bloqueio.

Uma descoberta durante a escrita pode gerar proposta de alteração da arquitetura. A aprovação dessa mudança precisa registrar consequências; ela não será escondida dentro de uma reescrita.

**Critérios de aceite:**

- Gate aprovado não equivale a capítulo escrito ou aceito pelo autor.
- Primeira versão e versão revisada são recuperáveis separadamente.
- Revisão sem correções registra os critérios conferidos.
- Limite de contexto ou de execução produz checkpoint, sem substituir cenas por resumos.
- Falha após salvar o texto permite reparar o estado sem duplicar a entrega.
- Edição concorrente preserva os trabalhos e exige conciliação.
- O fluxo contínuo respeita as condições de passagem definidas para capítulo e ato.

**5. Integração, impacto, progresso e publicação**

**Objetivo:** conferir o conjunto e publicar uma versão identificável, mantendo os controles privados separados da experiência do leitor.

Esta etapa reúne cinco incrementos sequenciais.

**5.1 — Integração de ato e livro**

- Ler as versões completas selecionadas e a passagem anterior pertinente.
- Construir matrizes de tempo, conhecimento, relações, causalidade, plantios, promessa e voz.
- Produzir achados com localização, evidência, gravidade, efeito e ação sugerida.
- Vincular correções às versões realmente salvas.
- Reavaliar dependências após as alterações.
- Separar resultado técnico da análise e aceite autoral.

**5.2 — Mapa de impacto**

- Registrar vínculos entre fontes, planejamentos, preparação, manuscrito e relatórios.
- Mostrar quais artefatos podem ser afetados por uma alteração.
- Distinguir referência desatualizada de possível consequência narrativa.
- Exibir a cobertura da busca: dependências registradas podem ser verificadas; relações implícitas exigem análise editorial.
- Permitir resolver pendências com justificativa e evidência.

**5.3 — Progresso e retomada**

- Mostrar preparação, redação, revisão, integração e publicação separadamente.
- Derivar prontidão dos artefatos e versões existentes.
- Registrar execução, unidade atual, bloqueios e próxima ação.
- Conferir concorrência e reconhecer entregas já salvas antes de retomar.
- Evitar percentuais que façam palavras escritas parecerem revisão concluída.

**5.4 — Publicação e catálogo do leitor**

- Configurar política por capítulo, ato ou livro.
- Preparar manifesto com IDs, ordem, títulos, atos e versões de origem.
- Conferir equivalência entre corpo publicado e manuscrito aprovado.
- Confirmar resultado terminal e registrar versão, URL e horário.
- Preservar a edição pública anterior enquanto uma nova publicação estiver pendente.
- Separar bíblia privada e catálogo público.
- Liberar informações por limiar de leitura de cada volume, preservando incertezas e homônimos.

**5.5 — Portabilidade editorial**

- Ampliar o pacote privado existente com contrato, decisões, planejamento, evidências, relatórios e checkpoints.
- Preservar relações e versões com esquema explícito.
- Restaurar em nova cópia privada, remapeando IDs.
- Identificar fontes externas indisponíveis e vínculos que exigem reconciliação.
- Excluir credenciais e autorizações operacionais do pacote restaurado.

**Critérios de aceite:**

- Ato integrado exige cobertura das versões completas e tratamento explícito dos bloqueios.
- Livro concluído exige revisão transversal.
- Alteração relevante sinaliza quais aprovações precisam ser reavaliadas.
- Publicação só aparece como concluída após confirmação do destino.
- Nenhum controle privado ou spoiler indevido chega ao leitor público.
- Backup e restauração preservam o processo editorial sem reativar execuções antigas.

**Organização técnica e ordem de execução**

A implementação deve seguir **1 → 2 → 3 → 4 → 5**, em incrementos verticais pequenos. A etapa 3 pode começar após estabilizar os contratos mínimos da arquitetura, permitindo usar o guia no editor antes de concluir todo o fluxo de produção.

A distribuição sugerida é:

| Área                                    | Responsabilidade                                   |
| --------------------------------------- | -------------------------------------------------- |
| Nova capacidade de produção literária   | Contrato, artefatos editoriais, gates e integração |
| `books`, `scenes`, `narrative-planning` | Estrutura e manuscrito existentes                  |
| `ai-assistant` e `editor`               | Contexto, comandos, comparação e aceite            |
| `lore`, `universes`, personas           | Conhecimento e instruções reutilizáveis            |
| Histórico, progresso e portabilidade    | Versões, retomada e pacote privado                 |
| `functions`                             | Autorização, concorrência, jobs, recibos e débitos |

As fronteiras entre features continuam pelas interfaces públicas. Contratos puros ficam separados de I/O; operações grandes usam paginação e checkpoints.

**Validação e encerramento de cada etapa**

Cada incremento deve prever testes de comportamento, contratos de servidor, autorização e concorrência. Os cenários principais são adoção de livro existente, fontes alteradas, resposta perdida, cancelamento, conflito de edição, retomada e ausência de cobrança duplicada.

No fechamento dos blocos: `npm ci --prefix functions`, verificações pertinentes e `npm run validate`. Mudanças de interface também exigem conferência no navegador, teclado, telas estreitas e temas. Cada entrega atualiza documentação, decisões arquiteturais e evidências em `docs/entregas`.

O escopo inicial cobre livros e séries. Agendamento recorrente, expansão para aventuras/campanhas e publicação em destinos externos entram como trabalhos próprios quando solicitados. O plano não define novos preços nem inicia publicação automática.

**O resultado esperado é um Writer em que cada geração conhece sua intenção editorial, cada revisão mostra suas evidências e cada avanço corresponde a conteúdo efetivamente salvo.** Nesta resposta, apenas o plano foi elaborado; nenhum arquivo ou código foi alterado.
