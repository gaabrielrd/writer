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

- [ ] Revisão/fingerprint/descritor e contratos de bootstrap/upload.
- [ ] Controle inicial, upload retomável e conflitos por provas originais.
- [ ] Contratos de revisão/ativação/mídia/limpeza e confirmação após chave revogada.
- [ ] Sessão de cliente e painel/diálogo integrado ao Estúdio.
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

Não é upload, revisão de arquivo ou interface; todas as caixas da sequência
continuam abertas. Prova da fórmula de checkpoint/IDs contra append real,
bootstrap e demais passos continuam obrigatórios.
