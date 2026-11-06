# Writer Assistant

<!-- impeccable:product-schema 1 -->

Contexto de produto confirmado pelo operador em 2026-11-05 para orientar trabalhos
de interface. Este registro resume a direção aprovada; o
[PRD](docs/prd.md) mantém os requisitos e o
[registro de execução](docs/tasks/writer-v2/execucao/README.md) mantém o estado dos
incrementos e seus aceites.

## Platform

web

## Users

Autores de ficção e mestres/criadores de aventuras têm igual prioridade no Writer
V2.

- Autores planejam universos, escrevem e revisam obras, consultam personagens,
  locais, conceitos e relações sem perder a continuidade do texto.
- Mestres criam aventuras, preparam campanhas e organizam material narrativo e
  informações com audiências diferentes, preservando segredos da mesa.

Leitores, revisores, jogadores convidados e compradores fazem parte das jornadas
descritas no PRD. A existência desses públicos na direção do produto não significa
que todos os fluxos de acesso, comércio e colaboração estejam disponíveis.

## Product Purpose

Integrar texto, lore e assistência de IA em um estúdio de criação narrativa para
manter a consistência do universo e a continuidade do trabalho. O usuário deve
conseguir planejar, escrever, consultar contexto e retomar seu projeto sem depender
de anotações desconectadas.

O sucesso se expressa na preservação do trabalho autoral, na consulta contextual
durante a escrita e no controle explícito sobre sugestões, revisões e exposição de
conteúdo. Não há meta numérica de sucesso definida por este registro.

## Positioning

O mecanismo central conecta o manuscrito ao compêndio de lore: termos reconhecidos
no texto dão acesso a resumos e fichas, e a assistência de IA usa o contexto
autorizado do projeto. Universos podem conectar projetos, enquanto livros,
aventuras e campanhas mantêm suas próprias identidades e fluxos.

Essa descrição registra o mecanismo do produto; não constitui uma alegação de
exclusividade ou superioridade perante concorrentes.

## Operating Context

O suporte inicial é desktop/laptop, com mouse e teclado, inclusive para leitura
pública. A adaptação a diferentes janelas de desktop continua relevante.
Celulares e tablets estão fora do suporte e do aceite desta fase, sem data de
retomada definida. Os comportamentos responsivos existentes são preservados,
conforme a [direção de suporte](docs/platform-support.md).

O Estúdio reúne livros, aventuras e campanhas. A criação de projeto permite entrada
manual ou assistida por IA, com universo e persona opcionais. O trabalho alterna
planejamento, escrita, consulta de lore, revisão e retomada. Exportação, backup,
restauração e publicação têm escopos e confirmações próprios.

## Capabilities and Constraints

- A base inclui editor de texto rico, organização de livros e capítulos, compêndio
  contextual, assistência de IA e exportação. A evolução V2 acrescenta capacidades
  por incrementos, incluindo cenas, narrativa, aventuras e campanhas.
- Universos são opcionais. Aventuras e campanhas não são livros convertidos nem
  exigem vínculo com um universo para existir.
- Originais, lore privado, histórico e material de preparação exigem autorização.
  Publicação é uma ação explícita com projeção separada do rascunho; editar o
  original não deve publicar a alteração automaticamente.
- A IA propõe; o usuário confirma a aplicação. Escrita manual e acesso autorizado
  ao próprio conteúdo não dependem de saldo de IA. Custos e aceites variam por
  operação e seguem seus contratos, sem tarifa universal inferida.
- Salvamento, recuperação e restauração devem preservar texto e escolhas do
  usuário. Conflitos ou pedidos sem resposta não autorizam sobrescrita silenciosa
  nem repetição automática de uma ação com efeitos.
- Coedição simultânea do mesmo parágrafo e diagramação profissional de pré-impressão
  estão fora do escopo descrito no PRD.
- Recursos futuros do V2 devem ser identificados como pendentes. Direção aprovada,
  implementação local, validação, implantação e disponibilidade para uma conta
  real são estados distintos. Este arquivo não certifica uma publicação.
- Comércio, distribuição, sessões e outros fluxos ainda abertos conservam seus
  próprios contratos e aceites; não devem ser anunciados como concluídos por
  inferência deste contexto.

## Brand Commitments

O nome existente é Writer Assistant, também referido como Writer. A terminologia
de produto inclui Estúdio, Universo, Livro, Aventura, Campanha, Compêndio e Persona.
Novos trabalhos devem respeitar os significados registrados no PRD e nos contratos
de cada capacidade.

## Evidence on Hand

- [PRD](docs/prd.md): problema, públicos, requisitos, limites e direção V2.
- [README](README.md): apresentação e referências de capacidades e entregas.
- [Registro de execução V2](docs/tasks/writer-v2/execucao/README.md) e
  [entregas](docs/entregas/README.md): estado e evidências por incremento.
- [Arquitetura](docs/architecture.md): fronteiras e contratos técnicos existentes.
- [Styleguide](docs/styleguide.md) e rota `/styleguide`: referências da interface
  existente, consultadas antes de alterar telas.
- [Testes](docs/testing.md): alcance das verificações e limites das evidências.

Não foram fornecidos depoimentos, métricas de adoção, comparativos de desempenho
ou provas comerciais nesta inicialização. Não fabricar esses elementos em futuras
páginas de apresentação.

## Product Principles

1. Dar igual prioridade a autores e mestres, respeitando as diferenças de seus
   trabalhos.
2. Aproximar texto e contexto para preservar consistência e continuidade.
3. Manter o usuário no controle da aplicação de IA e da exposição de conteúdo.
4. Preservar trabalho autoral e tornar conflitos e recuperação compreensíveis.
5. Comunicar somente o estado comprovado de cada capacidade.

## Accessibility & Inclusion

Navegação por teclado, foco visível, rótulos acessíveis, contraste e estados de
carregamento, vazio, erro e sucesso continuam obrigatórios no suporte inicial.
Os temas Claro, Escuro e Sépia devem manter a usabilidade. Seguir os contratos do
[styleguide](docs/styleguide.md), sem inferir certificação formal de acessibilidade
ou suporte a navegadores não verificados.
