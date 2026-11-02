# P1 / M28 — Materialização do lore próprio

## Objetivo e requisitos

Preparar fichas próprias do livro no destino reservado, depois da estrutura,
sem ativar a raiz nem conceder acesso à origem global. É uma etapa sequencial
da materialização completa de P1; cenas e planejamento vêm a seguir.

- Ler cada recurso pelo leitor verificado M21, materializando somente book-lore.
  Um cursor de varredura separado permite lore intercalado, sem consumir o cursor
  principal dos recursos ainda não materializados.
- ID, bookId e relações locais remapeados pelo contrato M21; referências
  externas e prosa preservadas, sem resolver ou copiar fichas globais.
- Preservar presença/ausência dos campos, inclusive relations ausente ou vazio,
  sem normalizar/truncar texto. Datas nativas novas e fixas na preparação.
- Aplicar até 64 relações por unidade com prova independente do índice,
  cursor e recibo no mesmo commit. Contadores cumulativos e cursor de relação
  permitem retomada após falha e confirmação de recibo histórico.
- Migrar preparação v1 para v2 e inventário v4/v5 para v6 antes da escrita;
  admitir namespace lore somente vazio na migração. Manter leitura/cleanup antigos.
- Journal autentica nascimento/última alteração de ficha e recibos, inclusive
  substituições de páginas; cleanup mascarado, limitado e certificado até o fim.
- Ao alcançar o manifesto book-resources, conferir contagem e mudar fase para
  scenes, mantendo itemIndex no início dos recursos. O escritor da estrutura
  não pode retomar depois da sua própria fase.
- Nenhuma API pública/callable, Rules, UI, publicação, dependência ou deploy novo.

## Tarefas e aceites

1. [x] Inventário v6, progresso v2 e compatibilidade de recibos/cleanup.
2. [x] Escritor interno de lore, provas/cursor/replay/rollback atômicos.
3. [x] Testes dirigidos Node e SDK real, revisão e evidência.
4. [x] Commit local; P1/F2-09 continuam abertos.

## Suposições, riscos e não escopo

O formato permite recursos intercalados. A varredura separada não depende de lore
contíguo e mantém o cursor principal no primeiro recurso. Sem lore, transicionar
somente após conferir o manifesto, sem pular recursos pendentes. Mantemos artefatos privados sob raiz ausente. Campo
isPublic do arquivo não publica nada, pois a raiz pública não é criada.

Firestore pode recusar ficha ou array de relações acima do limite nativo;
a transação deve falhar inteira, preservando fonte e cursor, sem truncar ou
rejeitar o formato lógico de 8 MiB. A representação dos demais campos grandes
e a adaptação de seus consumidores são obrigatórias antes de ativar P1.
Este incremento prepara a família nativa existente; não declara compatibilidade
integral de lore grande ou restauração completa. Faltam também cenas/fontes/
referências/narrativa, personas, histórico/rascunho/capa, autorização final,
ativação, host/UI, roundtrip e validate do grande bloco. Sem CI/push/deploy.
