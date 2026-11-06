# Preparação local e análise econômica de documentos

Plano autorizado na conversa em 2026-11-05. Testes e `npm run validate` somente
no fechamento da implementação. Sem commit, push ou implantação nesta tarefa.

## Objetivo e escopo

Reduzir tráfego, chamadas repetidas e espera na importação de universos/lore,
reutilizando o parser público de document-import. Livro e aventura já extraem e
revisam documentos localmente, sem IA; seus contratos permanecem preservados.

## Sequência

1. Preparar fontes localmente: limpar apenas margens recorrentes/números de
   página, conservar apresentação/apêndices e montar blocos limitados por
   tamanho, seções/parágrafos e origem precisa. Nenhum resumo ou filtro de fatos.
2. Adotar upload v2 de texto preparado, com manifesto, hashes e limites medidos
   pelo servidor; não enviar o PDF original. Preservar envio/retomada v1.
3. Selecionar contexto por nomes/apelidos com limites de palavra, conservando
   todas as correspondências ambíguas; a seleção nunca filtra o texto fonte.
4. Guardar resultados privados por unidade, vinculados ao texto, contexto,
   versão de análise e configuração congelada. Impedir análise concorrente do
   mesmo cursor; retry reutiliza sucessos sem publicar candidatos parciais.
5. Apresentar a origem de evidências que atravessam páginas, atualizar contratos
   e registrar decisão arquitetural. Acrescentar regressões antes da execução.
6. Revisar o diff e executar testes afetados, Rules, navegador e validate no
   fechamento. Registrar resultados e limitações reais em docs/entregas.

## Aceite

- Páginas curtas são agrupadas, com preservação literal do texto e evidências;
  cortes respeitam Unicode, limites e preferem fronteiras de conteúdo.
- Margens repetidas são retiradas somente nas margens; ocorrências no corpo,
  introduções, sumário e apêndices são preservados para análise de lore.
- V2 envia somente texto/metadata; o servidor verifica hashes, contagens,
  bytes efetivos, ordem e origem. Limites do cliente não são autorização.
- V1 continua retomável; versão desconhecida, partes alteradas, incompletas,
  estrangeiras e fontes acima do orçamento são recusadas sem IA.
- Contexto irrelevante não acompanha cada chamada; homônimos e aliases ambíguos
  não são escolhidos automaticamente nem retirados da revisão.
- Uma falha conserva análises irmãs validadas para retry exato, inclusive após
  recriar o serviço. Cancelamento, revogação e expiração impedem novos resultados.
- Não há candidatos parciais nem avanço de cursor antes do lote completo;
  autorização, revisão, débito e recibo final mantêm seus contratos.
- Cache privado compartilha a limpeza já existente de importSources e não
  recebe acesso SDK nem índices de prosa. Nenhuma nova dependência.
- Testes com fontes representativas medem chamadas/volume e conferem texto,
  páginas, concorrência e recuperação; ganho real não é inferido de mocks.

## Riscos e limites

Durante o fechamento, o operador autorizou corrigir a sincronização do Impeccable
preexistente. O registro explícito de skills externas preserva variantes/binários,
verifica metadata/versão e mantém os checks das cópias canônicas. A instalação
externa e seu cache gerado ficam fora da reformatação; código do produto continua
sob os mesmos gates.

Heurísticas de diagramação exigem revisão. O orçamento por bloco não aumenta o
limite de 50 entidades nem permite resposta truncada. Upload v2 não certifica a
correspondência entre PDF e texto autoral: tamanho original é apenas declarado;
hashes e cotas efetivas protegem o texto realmente recebido. OCR, mapas, imagens,
modelo local, implantação e mudanças de preço ficam fora do escopo.
