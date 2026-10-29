# ADR 0261 — Semântica derivada retomável dentro do item

- Data: 2026-10-29.
- Estado: aceita para revisão interna pré-ativação.
- Plano: [231](../tasks/writer-v2/execucao/231-verificacao-derivada-por-dependencia.md).
- Continua [ADR 0260](0260-campaign-persistent-derived-index.md).

## Problema e decisão

Uma linha base:item pode depender de muitas partes de texto. Paginar somente
linhas ainda permite trabalho/estado crescentes dentro de um item. A máquina
pura campaignBackupDerivedRowWalk agora separa fases de testemunha, pai, imagem,
campo, parte e relação. Um passo executa uma transição local limitada, uma
dependência ou uma relação com até dois lookups lógicos. Ausência continua usando
posições autenticadas; isso não equivale a duas leituras Firestore brutas.

Máquina compartilhada serve ao revisor completo sobre índice MAC e ao
coordenador persistente sobre índice nativo. Mantém regras/contagens antigas,
incluindo corpo emprestado do bloco principal, legado, disponibilidade e
unresolved v3. Autenticação de cada reader fica na respectiva porta.

## Hash idêntico sem deps crescente

O protocolo anterior dobra JSON de section/key/value/deps por linha. Não mudar
o digest nem guardar deps: emitir prefixo da linha uma vez, cada dependência
com separador na mesma ordem e fechamento. Lookups que antes não participavam
de deps continuam fora do hash; ausência legítima não inventa dependência.

Checkpoint guarda identidade hash da linha, fase, índices de campo/parte/relação,
primeiro separador e parent/proof necessários, além do SHA incremental. Retomar
não repete consultas anteriores. O contexto base/testemunha é validado e
recuperado da porta do índice; estado guarda binding ao contexto/arquivo/
encarnação, sem copiar todo o contexto nem aceitar cursor do cliente.

Antes de modificar o algoritmo, uma cópia local de QA preservou a implementação
anterior. Cinco perfis reais assinados compararam prova/digest anteriores,
revisor completo novo e fluxo persistido. A referência não é código de produção
nem mecanismo de compatibilidade executado em runtime.

## Persistência, CAS e fronteiras

campaignRestoreDerivedSemantics aceita identidade/operação/CAS e limit de 1–25
passos. derivedCheck opcional no job guarda metadata limitada e estado AES-GCM
até 256 KiB; AAD vincula UID/RID/jobToken/checkpoint. Codec fixa hash-wasm 4.12.0.
Não cria coleção, corpo ou índice adicional.

Exige integridade, own e índice derivado concluídos. Cada reader reconfere
job/chave/índice. Antes de publicar, transação confere a encarnação, CAS e job
original. Recibo original vence retry e continua disponível após cancelamento.
Prova concluída reconfere chave emissora/índice e binding; não reutiliza aprovação
de assinatura revogada. Progresso/recibos não contêm SHA exportado, cursors,
metadata de relações ou ciphertext.

A prova interna mantém campaign-derived-semantics-only. Ela descreve o arquivo
autenticado; não concede autorização atual de origem, compra ou ativação. Não há
endpoint público ou interface neste incremento.

## Cancelamento antes do produtor e compatibilidade

Antes de ligar produtor, cancelamento passou a limpar derivedCheck junto dos
outros estados e a retirar a chave atomicamente. Não decifra o checkpoint;
a leitura do job inclui ciphertext para conferir cadeia de recibos. Coletores
de pares/own/chunks permanecem; não existe nova família física.

Ausência do campo preserva jobs anteriores. Checkpoints das etapas concluídas
conservam sua posição original no contador global. Rules e layouts C4 1–4 não
mudam. Antes da ativação, integrar todos os temporários ao C4 apropriado.

## Validação e continuação

Teste com mil partes pausa na parte 350, retoma exatamente nela, mantém estado
limitado e produz o JSON/digest anterior. Arquivos assinados provam equivalência
de todo o resultado, inclusive falha tardia sem avanço. SDK cobre CAS real,
recibos, reinício, revogação e cancelamento.

Ainda faltam revisão persistida de autorização das origens, materialização/
remapeamento/mídia, C4 da ativação e Estúdio/ciclos. Nenhuma dessas etapas pode
ser presumida por semântica concluída. Macro 8/35 e P3/D/F2-09 abertos.
