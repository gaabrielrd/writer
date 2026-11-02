# ADR 0047 — Leitura e conferência limitada da estrutura de livros

- **Estado:** adotado localmente em 2026-10-21; sem deploy.
- **Contexto:** [P1](../tasks/writer-v2/execucao/31-portabilidade-de-livros.md),
  [M3b](../tasks/writer-v2/execucao/36-leitura-limitada-da-estrutura.md) e
  [pertencimento SDK](0046-book-backup-membership-clock.md).

## Decisão

Adicionar três callables somente de leitura para a estrutura salva. Autorizar o
livro ativo do próprio autor na transação de cada pedido. Fixar UID/livro e
createTime/updateTime precisos de raiz e controle workProgress/current no token
de origem. Fixar também tipo/ID e identidade nativa em cada token de item.
Publicação e tokens fornecidos não concedem acesso.

Paginar IDs/tokens de atos/capítulos por **name**, com máscara vazia e limite de
50 mais uma sentinela. Ler/projetar somente um documento por chamada de corpo;
a resposta transporta no máximo 64 KiB em base64 canônico com tamanho e SHA-256
do item inteiro. A projeção JSON de um documento tem teto de 8 MiB para acomodar
escapes de um documento Firestore de até 1 MiB. Não há teto para a quantidade de
documentos: falhas explícitas substituem truncamento.

A projeção conserva campos próprios necessários à etapa de estrutura e omite
campos desconhecidos, grants, credenciais, operações, publicação e contadores.
Capa contém identidade da biblioteca ou aviso de legado indisponível, sem URL
tokenizada nem fetch. Progresso contém estado editorial e meta total, sem ledger
ou atividade da conta. Datas presentes são preservadas e ausência não vira uma
data inventada. Valores não representáveis em JSON falham antes de retornar corpo.

No cliente, reconstruir/conferir um item por vez e aguardar o sink entre registros.
Repassar cópias de até 64 KiB para que o sink não altere partes seguintes. Ordenar
IDs pelos bytes UTF-8, sem normalizar Unicode. Calcular uma cadeia SHA-256 dos
pares ID/token em ordem de tipo/ID; reenumerar e comparar essa cadeia/contagens no
fim e reautorizar a origem. Assim não é necessário manter um readset em memória
proporcional ao livro.

Adiar imports de Firebase no adaptador callable até uma chamada real. Importar
ou usar um leitor injetado não deve iniciar Auth/App Check; a chamada produtiva
continua usando a configuração padrão da aplicação e App Check no servidor.

## Prova e limites

Identidade nativa igual impede que valor alterado/restaurado ou ID recriado
seja confundido com a observação anterior. A interseção entre os intervalos de
observação/conferência de todos os itens fornece um corte coerente, condicionado
ao clock de pertencimento M3a e aos escritores Admin correspondentes. Controle
ausente não é recriado pela leitura. Writers ativos não removem esse controle;
a limpeza só pode ocorrer após bloquear a captura pelo estado deleting.

Os writers Admin legados createLegacyChapter/deleteLegacyChapters foram exercitados
no emulador, inclusive capítulo vazio e replay idempotente. O código de sceneJobs
marca agrupadores, move filhos e remove agrupadores com writeProject na mesma
transação; a exclusão do livro exige deleting antes de remover os controles.
Manutenção Admin tem que respeitar o mesmo protocolo; Rules não a restringem.

A prova é provisória e restrita a este segmento. O orquestrador completo deverá
conferi-la depois das demais capacidades e antes do selo/EOF M2. Não gravar tokens
de captura como dados portáteis. O schema integral, mídia, histórico por fluxo,
rascunho, sink persistente, revisão/restauração e recuperação continuam pendentes.
A memória do sink não é provada pelo limite do serviço. Cada parte relê o documento
e a autorização; custo de leituras não é eliminado por este protocolo.

O [registro M3b](../entregas/2026-10-21-writer-v2-leitura-da-estrutura.md) separa
testes de contrato, SDK real e Chromium com transporte local para o emulador.
Nenhum desses testes prova implantação, App Check produtivo ou arquivo P1 completo.

Antes de habilitar o backup completo, implantar Rules M3a e escritores/leitores
coordenados e drenar clientes antigos. Não tratar execução local ou SDK de emulador
como prova de que esse rollout já aconteceu.
