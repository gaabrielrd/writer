# ADR 0162 — restauração privada no Estúdio

Status: aceita para implementação local; fechamento de P1 pendente.
Data: 2026-10-25.

## Contexto

Os protocolos de arquivo, preparação e finalização precisam de uma experiência
retomável no Estúdio. Importar um documento e restaurar um backup têm decisões
distintas; histórico de ativação não concede acesso atual à raiz.

## Decisão

Ação própria Restaurar backup de livro e lista de retomadas entram pela interface
pública de book-portability. StudioPage só compõe os componentes e confirma acesso
ao abrir um livro: getBook com source server, proprietário esperado, raiz existente
e não em exclusão. Revalidar vida útil/conta após a consulta, antes de navegar.

Diálogo primeiro confere o arquivo e apresenta contagens, ausências e políticas.
Preparar cópia envia/prepara em unidades, pausando antes da ativação. Criar cópia
privada confirma exatamente a revisão final exibida. Tentativa de ativação retira
esse botão antes do await; erro oferece o pedido original para retomar/verificar.

Arquivo fica só em memória. Nova seleção invalida a revisão local; retomada do
upload exige o mesmo descritor e usa reviewHash original do job. Pausar termina
após a unidade em andamento; fechar invalida respostas sem apagar pendências.
Mídia e limpeza podem ser retomadas depois que a cópia já estiver acessível.

Lista combina três páginas independentes: jobs autorizados, inícios locais e
intenções terminais locais. Falha de uma fonte não esconde as demais. Remontar
por conta evita exposição transitória de linhas antigas.

Cancelamento e remoção da recuperação local exigem confirmação explícita.
Para remover ciphertext sem chave, reautorizar job terminal, conferir contexto
original e apagar somente envelope exato por CAS. Não decriptar, reconstruir ou
remover projeto; envelope inválido/conflitante permanece.

## Evidência e limites

[Plano 139](../tasks/writer-v2/execucao/139-restauracao-de-livros-no-estudio.md),
[entrega](../entregas/2026-10-25-writer-v2-restauracao-no-estudio.md).
Testes de composição e Chromium nativo não substituem infraestrutura de produção,
roundtrip com consumidores normais nem fechamento global de P1.
