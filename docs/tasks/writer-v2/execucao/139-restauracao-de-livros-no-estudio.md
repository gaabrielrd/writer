# P1 — restauração de livros no Estúdio

## Objetivo e descoberta

Conectar a restauração privada já implementada à aplicação. Complementa o passo
5 do [plano 133](133-revisao-e-ativacao-do-livro.md), usando
[transporte 136](136-transporte-da-restauracao.md),
[sequenciador 137](137-preparacao-retomavel-no-cliente.md) e
[journal 138](138-journal-protegido-da-preparacao.md).

StudioPage já reúne importação de documentos/aventuras e preparações. Nova ação
Restaurar backup de livro e painel próprio devem entrar pela interface pública
de book-portability, sem alterar importação de manuscrito ou outras features.

Leitores locais já validam arquivo WRITER-BOOK e JSON v1–v6 por intervalos e
índice descartável; fingerprint lê intervalos de 64 KiB. Header distingue formato,
sem confiar na extensão. Leitura positiva local não autoriza restauração.
Servidor começa checkpoint 0; enquanto uploading só append incrementa checkpoint,
com índice sequencial. Chave não incrementa checkpoint. Raiz nasce somente na
ativação explícita; comandos de mídia/limpeza possuem confirmação própria.

## Contrato antes da implementação

1. Inspecionar arquivo local por fonte Blob limitada e hash completo. Produzir
   revisão metadata fechada: formato/versão/tamanho/hash, contagens/avisos e
   políticas já aprovadas. Sem texto/PDF/imagens na persistência local da revisão.
   Congelar descritor antes de awaits; cancelar leitura ao trocar arquivo/conta.
   Não usar fallback JSON para esconder corrupção de arquivo com header nativo.
2. Antes de start, persistir por CAS um controle inicial mínimo: conta, UUID de
   operação, descritor da origem e reviewHash, sem nome, título, prosa, chave ou
   bytes. Essa metadata precede a existência da chave servidor e fica em store
   próprio; não altera o journal cifrado de preparação.
   Reenviar start exato após perda de resposta. Descartar controle inicial só por
   confirmação nativa própria ou fence de resolveBookRestoreStart.
3. Upload relê fonte confirmada em partes de 64 KiB, valida hash/tamanho e UID.
   Operação determinística por jobToken/índice, expectedCheckpoint igual ao índice
   original, provada por contrato/testes reais. Repetição mantém fingerprint exato.
   Após recarga, exigir o mesmo arquivo por hash e consultar progresso autorizado;
   não persistir chunkBase64. Sem avanço sobre origem divergente ou job desconhecido.
4. Preparação usa journal cifrado e uma unidade por chamada, com pausa/retomada
   controlada e checks de conta/vida útil. Falha mantém dívida; não troca operationId
   ou checkpoint para contornar conflito. Confirmação histórica não aplica outro passo.
5. Revisão final vem do servidor, com título limitado, contagens, universo, capa
   e rascunho. Somente botão explícito confirma reviewToken/checkpoint originais.
   Mudança invalida a revisão, sem ativar automaticamente com nova resposta.
   Intenção/recibo da ativação precisam sobreviver à chave de upload revogada:
   metadata mínima da tentativa permite confirmação histórica, sem reconstruir
   livro ou expor prosa. Preservar prova nativa, não tratar estado como grant.
6. Após ativação, oferecer estado de capa e limpeza próprios, com retry exato.
   Livro editado/excluído e imagem retirada não são reconstruídos. Só navegar
   para o livro por acesso atual confirmado. Não bloquear acesso ao livro já
   criado por uma limpeza pendente; apresentar sua retomada separadamente.
7. Listar restaurações por páginas autorizadas e controles iniciais próprios,
   com carregando/vazio/erro/sucesso. Pendência terminal sem chave conserva
   ciphertext; descarte local exige ação explícita, não remove projeto remoto.
   Cancelamento usa protocolo anterior à ativação/fence correto, nunca limpa
   livro ativo. Não aplicar dados antigos ou pendência de outra conta/aba.

## Interface e arquivos previstos

Book-portability contém tipos, fontes/revisão, adaptadores HTTP/callables,
controle inicial/transferência/finalização e componentes públicos.
StudioPage apenas compõe ação/painel e navegação. Inputs/Dialog/Button/Alert/
LoadingState/EmptyState/ErrorState seguem shared/ui e styleguide; tokens de
tema, ícones Lucide, foco/teclado, viewport estreito e três temas.

Evitar mensagens técnicas no fluxo: mostrar Selecionar backup, Revisar,
Preparar cópia, Criar cópia privada e Retomar. Não mostrar IDs, grants, caminhos
Storage ou passos internos ao leitor. Percentual somente se denominador real
for conhecido; demais etapas usam estado textual, sem precisão inventada.

## Sequência

- [x] Revisão/fingerprint/descritor e contratos de bootstrap/upload.
- [x] Controle inicial, upload retomável e conflitos por provas originais.
- [x] Contratos de revisão/ativação/mídia/limpeza e confirmação após chave revogada.
- [x] Sessão de cliente e painel/diálogo integrado ao Estúdio.
- [ ] Testes dirigidos, browser real e roundtrip atual/legado com consumidores normais.
- [ ] Revisão/checks/ADR/evidência e commits locais.

## Riscos e critérios de aceite

Sem raíz antes de confirmar; nenhuma publicação/venda ou sobrescrita do original.
Arquivo/hash/conta/revisão divergentes bloqueiam envio; respostas perdidas não
duplicam projeto, chunks, perfis, capa ou efeitos. Pausa/recarga retomam pedido
original e não descartam texto. Bytes, histórico, lore, personas e rascunho
conservados conforme schema e regras aprovadas; dados não registrados em legado
ficam indisponíveis explicitamente.

Testes do start devem provar cancelamento antes/depois do commit e impossibilidade
de reanimar operação com fence; upload deve provar a fórmula de checkpoint/ID
contra serviço real. UI deve provar foco, teclado, temas, mobile, falha/retry e
retomada após reinício. Metadata local não é autorização: todos os efeitos e
leituras continuam revalidados no servidor.

Sem deploy: nova UI e exports locais não provam disponibilidade de produção.
Inventários gerais/writers/exclusão/legados/rollout/validate de P1, fases 3–5 e
gates humanos/comerciais continuam no objetivo. Modo indexado padrão false até
validação/rollout coordenados. Sem CI, push, PR, merge, deploy ou subagentes.

## Estado parcial dos contratos

Origem/start fechados e imutáveis, hashes canônicos e namespace de chunk
implementados. IDs de pedidos/restauração agora seguem o validador real do
servidor; UID não recebe essa restrição. 65 Vitest distintos e um cenário
Chromium dirigidos positivos; [evidência](../../../entregas/2026-10-25-writer-v2-contratos-iniciais-do-envio.md).

Naquele checkpoint ainda não havia upload, revisão de arquivo ou interface.
A inspeção/bootstrap e a prova de checkpoint/IDs foram implementadas no estado
registrado a seguir; demais passos continuam obrigatórios.

## Estado da inspeção e do envio

Inspector metadata e bootstrap mínimos implementados; sessão confirma início/
fence originais, sem chamar job existente de cancelado. Upload prova índice/
checkpoint/IDs contra append real, repete pedidos e retoma prefixo após recarga.
Conservar reviewHash original do job ao reabrir arquivo; não substituir pela
revisão de apresentação recalculada.

46 Vitest distintos e oito cenários Chromium positivos;
[evidência](../../../entregas/2026-10-25-writer-v2-inspecao-inicio-e-envio-de-backups.md).
Fluxo de arquivo atual chegou à revisão privada com raiz ausente após duas
perdas de resposta e reinícios. Cancelamento de job existente, finalização
durável e UI/roundtrip e demais P1/fases/gates permanecem.

## Contrato da finalização antes do código

A chave do upload é revogada na ativação/cancelamento; pedidos que encerram essa
chave não podem depender de decrypt para serem confirmados. Usar controle
operacional metadata separado, fechado, com identidade do job, ação, operationId
e checkpoint/revisão/token de revisão aplicáveis. Não guardar título, texto,
chave, Auth/App Check ou URL. JobToken/reviewToken são identificadores/provas do
protocolo, não credenciais de autenticação.

Ativação nova só por confirmação explícita da revisão exibida; persistir intenção
antes de RPC e repetir exatamente após recarga. Nova revisão não substitui token
de uma tentativa pendente. Consultas históricas não concedem acesso ao livro.
Mídia/limpeza/cancelamento usam suas confirmações específicas e progresso atual;
already-complete só encerra dívida quando o servidor prova conclusão do mesmo
contexto, sem inventar um recibo próprio.

Erros de transporte/conta conservam controle. Conflito não autoriza mudar
checkpoint/operationId: reconciliar recibo original ou prova nativa de que a
tentativa não pode mais produzir efeitos. Revisão de ativação mudada exige
nova confirmação humana; nunca reenviar automaticamente com token atualizado.
Cancelamento continua restrito a antes da ativação.

Bootstrap e finalização compartilham o mesmo padrão de I/O metadata (registro
fechado, conta/chave, CAS integral, paginação e guards), com schemas/namespaces
separados. Extrair somente esse kernel interno para evitar duas implementações
divergentes; manter codec/layout do bootstrap e journal cifrado anteriores.
Repetir as provas nativas afetadas ao extrair.

Nos testes reais, o replay de cancelamento revelou fases modernas ausentes no
validador de recibos históricos; incluir cover-storage/persona-library somente
nas versões que as suportam. O comando de limpeza exige limit explícito: manter
16 como parte fixa do pedido e de seu fingerprint em todas as retomadas.

## Estado parcial da finalização

Contratos, store operacional e sessão de finalização implementados, com replay
após chave revogada e confirmação/reconciliação nativas. 44 Vitest distintos,
quatro Node e 14 cenários Chromium positivos em seleções;
[evidência](../../../entregas/2026-10-25-writer-v2-finalizacao-duravel-no-cliente.md).
Ainda falta integrar interface, validar consumidores/roundtrip e fechar P1.

## Composição da interface antes do código

A ação própria Restaurar backup de livro abre diálogo da feature; importação de
documentos fica preservada. A lista combina páginas independentes de jobs
autorizados, inícios locais e tentativas terminais locais. Abertura consulta
estado; efeito novo depende de ação explícita. Nenhuma consulta inicia ativação.

Sessão de interface guarda arquivo apenas em memória, fixa conta/vida útil e
executa unidades sequenciais. Fechar invalida respostas; Pausar encerra o loop
depois da unidade em andamento, preservando pedidos sem resposta. Upload retomado
exige mesmo arquivo/hash e usa reviewHash original do job. Nova seleção invalida
a revisão local antes da leitura.

Revisão local apresenta contagens/ausências/políticas. Revisão final limitada vem
do servidor; botão Criar cópia privada usa exatamente o valor exibido. Exibir
cópia ativada antes de terminar limpeza; Abrir livro usa callback que confirma
getBook no servidor e proprietário/ausência de exclusão antes de navegar.

Retomar/Verificar preservam pedidos pendentes e erros, sem trocar IDs/tokens.
Cancelamento pede confirmação explícita; início usa fence ou cancela job
confirmado. Ciphertext de preparação terminal só pode ser removido por opção
explícita com contexto original e CAS inteiro; nunca por falha de decrypt.

## Estado da interface

Diálogo, lista paginada e sessão no Estúdio implementados com confirmação explícita,
pausa, conta/vida útil, recuperação e descarte local terminal confirmado.
30 Vitest distintos positivos em seleções e oito verificações Chromium;
[evidência](../../../entregas/2026-10-25-writer-v2-restauracao-no-estudio.md).
UI provada com arquivo atual, três reinícios/respostas perdidas e limpeza completa.
Roundtrip integral atual/legado e consumidores normais seguem pendentes.
