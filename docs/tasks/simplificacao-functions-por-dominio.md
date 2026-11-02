# Simplificação das Functions por domínio

Status: aprovado para implementação em 2026-11-02.
Referência publicada: `a80dac5112d2ea88b897baedd9352c658cdc2606`.

Atualização de escopo: o mantenedor dispensou compatibilidade, pois o protótipo
não tem usuários ativos. A execução migra todos os setores e retira os endpoints
antigos no mesmo rollout. As etapas de coexistência e janela de tráfego abaixo
ficam substituídas por essa orientação. A matriz final contém 16 setores callable,
dois chats streaming e 12 recursos HTTP/eventos/agendamentos, totalizando 30.
Consulte a [ADR 0270](../decisions/0270-functions-by-sector.md).

## Objetivo e diagnóstico

Reduzir os recursos implantados e o custo operacional de deploy, mantendo os
serviços e contratos de negócio separados. O inventário do release contém 320
Functions: 308 callable, quatro HTTP, cinco gatilhos de eventos e três agendadas.
O volume vem principalmente de expor cada operação como uma Function distinta.

Meta inicial estimada: 12 a 18 callable por domínio/perfil, mantendo inicialmente
as quatro HTTP e os oito recursos de eventos/agendamento. Isso resultaria em
24 a 30 Functions, redução aproximada de 91% a 93%. O número definitivo depende
do inventário de permissões, segredos e limites. Não é uma promessa de economia
proporcional na fatura: chamadas, CPU, memória e armazenamento continuam existindo.

## Requisitos e suposições

- Preservar dados, regras de autorização, App Check, contratos de erro e headers.
- Preservar idempotência, recibos, checkpoints, recuperação e débitos atômicos.
- Manter a lógica nos serviços existentes e o raciocínio puro em
  `functions/src/chatGeneration.mjs`.
- Usar o protocolo callable existente, evitando uma migração adicional para REST.
- Não alterar o esquema Firestore ou reescrever os fluxos de negócio nesta mudança.
- Clientes antigos e abas abertas precisam de uma janela de compatibilidade.
- A implementação só começa depois da aprovação deste plano.

## Organização proposta

| Setor                      | Responsabilidades                              |
| -------------------------- | ---------------------------------------------- |
| Livros e publicação        | Metadados, capítulos e publicação              |
| Lore e universos           | Consulta, criação, edição, relações e remoção  |
| Planejamento               | Cenas, grupos, referências e narrativa         |
| Trabalho                   | Progresso, tarefas, histórico e retomada       |
| Aventuras                  | Metadados, blocos, lore e prévia               |
| Campanhas                  | Campanhas, notas, sessões e preparação         |
| Sincronização de campanhas | Captura, comparação e adoção                   |
| Portabilidade de livros    | Backup, importação, restauração e recuperação  |
| Portabilidade de aventuras | Backup, importação, restauração e recuperação  |
| Importação de universos    | Upload, extração, análise, revisão e aplicação |
| Imagens e assets           | Biblioteca, vínculos e ciclo de vida           |
| IA                         | Geração, chat e criação assistida              |

São fronteiras iniciais. Separar leitura/escrita ou operações longas apenas quando
o perfil operacional justificar. As validações de restauração de livros/aventuras
e `analyzeChapterLore` têm timeout de 540 segundos; a maioria usa 120 segundos.
Não elevar todos os endpoints para o maior limite nem compartilhar segredos de
IA com setores que não os usam.

Cada Function recebe `{ version: 1, action, payload }`. Um registro explícito
seleciona apenas ações permitidas e chama o serviço existente. Não usar acesso
dinâmico arbitrário a métodos. A identidade vem do contexto autenticado, e cada
ação preserva sua autorização e validação próprias. Tipos públicos e adaptadores
do cliente escondem o envelope dos componentes.

Gatilhos de eventos continuam independentes inicialmente, preservando tipo de
evento, região, retries e limites. Avaliar a consolidação das três rotinas horárias
em etapa posterior, com isolamento de falhas e prevenção de sobreposição; não é
necessária para alcançar a redução principal. As HTTP de recuperação mantêm suas
rotas e cabeçalhos de segurança até uma avaliação específica.

## Execução sequencial

1. Gerar um inventário versionado de cada exportação, serviço, consumidores,
   região, memória, timeout, concorrência, instâncias, IAM, segredos e headers.
   Fechar a matriz de agrupamento e registrar uma ADR com a contagem final.
2. Criar o contrato de dispatch e um adaptador cliente pequeno. Escolher um setor
   sem segredos ou tarefas longas para o piloto, preferencialmente Trabalho.
3. Publicar o novo endpoint junto dos antigos, usando os mesmos serviços. Validar
   autenticação, ação inválida, UID divergente, erros e repetição idempotente.
4. Migrar o cliente do piloto, mantendo rollback para o transporte antigo.
   Nunca repetir uma mutação automaticamente no endpoint antigo depois de uma
   resposta ambígua; reconciliar o mesmo operationId pelo protocolo existente.
5. Migrar os demais setores em incrementos, separando perfis longos e com segredos.
   Registrar logs por setor, ação, operação, latência e erro, sem texto privado.
6. Acompanhar tráfego dos endpoints antigos durante uma janela definida na ADR.
   Exigir atualização de clientes incompatíveis antes de remover aliases.
7. Remover as exportações antigas em lotes explícitos, após conferir dependências
   e ausência de uso; conferir o inventário remoto e documentar rollback.
8. Comparar tempo de deploy, recursos, cold starts, latência p95, erros e custo.

## Validação e aceite

- Toda operação atual tem destino explícito e contrato preservado na matriz.
- Testes de serviço continuam aproveitados; testes de dispatch cobrem isolamento
  entre setores, payload inválido e autorização por ação.
- Após corrigir um teste, repetir somente o caso afetado. Não repetir pacotes já
  aprovados sem mudança relevante. Uma validação integrada fecha cada incremento.
- Comprovar coexistência de clientes, resposta perdida, retries e rollback sem
  duplicar débitos ou efeitos.
- Nenhuma alteração de regras/dados é necessária para trocar o transporte.
- Atingir a contagem aprovada e preservar latência e taxa de erro dentro dos
  limites definidos com a medição do piloto.

## Riscos e rollback

Agrupar endpoints compartilha capacidade e amplia o impacto de uma falha. Ajustar
limites por setor e preservar isolamento de IA, processamento longo e tarefas de
fundo. Observar uso por ação para não perder a visibilidade antes fornecida pelo
nome de cada Function. Dependências importadas por um setor também afetam seu
cold start: dividir os pontos de composição e medir o piloto.

Durante a coexistência, o rollback restaura o adaptador cliente anterior. Após a
retirada, pode exigir republicar aliases; manter o manifesto e o commit anteriores.
Não remover endpoints antigos na mesma publicação que introduz seus substitutos.
