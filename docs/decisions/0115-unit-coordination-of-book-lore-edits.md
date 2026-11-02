# ADR 0115 — Coordenação por unidade da edição de lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem habilitar o host de escrita.
- Plano: [100 / M38c5b](../tasks/writer-v2/execucao/100-coordenacao-da-edicao-preparada-de-lore.md).
- Antecedente: [ADR 0114](0114-literal-book-lore-client-edits.md).

## Contexto

Captura, diff e codec preservam valores e CAS observados. Falta coordenar
inspeção, uploads, reserva, composição, adoção e cleanup sem perder pedidos
cuja resposta não chegou. Cancelamento precisa avançar com RPC pendente.

## Decisão

prepareBookLoreEditOperation recebe captura bruta, mudanças explícitas,
UID/writeId e port de RPC injetado. Congela plano, IDs e manifestos antes do
primeiro RPC. Cada writeId pertence a uma intenção imutável; intentHash
distingue seu conteúdo para o futuro journal. Não existe nesta etapa uma
reserva global do writeId ou recuperação após recarga.

advance envia no máximo uma unidade. Ready não adota; apply explícito autoriza
a troca da cabeça. Retry de adoção já autorizada pode confirmar seu recibo.
Antes de await, mantém o pedido integral imutável: retry repete método,
operationId, CAS e bytes, sem rebasing. Inicialização e slots mantêm seu CAS
original; recibos históricos não substituem progresso atual.

Iteradores de partes são sequenciais, com parte incerta preservada. DTOs
fechados validam identidades, hashes, tokens, fases e contagens. Snapshot tem
metadata limitada, contadores, controle atual e descritores hash de pedidos,
sem prosa. controlsPage devolve até 50 controles por consulta explícita.
Cursores de produção/cleanup atravessam cada upload uma vez, sem copiar a
lista ou reserializar prefixos a cada parte.

requestCancel fecha produção sincronamente. Canal independente cerca e
limpa jobs enquanto produção aguarda resposta: pai antes de campos e
inspeção por último, incluindo filhos não iniciados. Não repete produção
para cancelar; respostas tardias não reabrem estado. Conflito com adoção exige
consulta metadata do job e conferência do identificador da adoção própria.

Guard de conta/escopo vale antes/depois de RPC. Abort impede produção, mas
permite cleanup explicitamente solicitado sob guard vigente. Terminal solta
referências internas a codecs/iteradores; pedidos incertos são encerrados
somente por prova de fechamento ou sucesso. Isso não promete apagar memória
do navegador nem terminar RPC já enviado.

## Consequências e portões

Operação em memória pela API pública da feature, com port injetado. Snapshot
e páginas são controles privados, não backup, grant ou journal durável.
Host deve reservar writeId exclusivo, vincular intentHash ao pedido integral
e definir recuperação protegida antes de reutilizar a operação após recarga.

Sem novo callable, persistência, formulário ou bypass do escritor SDK legado.
Endpoints autenticados, criação/exclusão/análise no cliente, demais leitores/
escritores, backup lógico/indexado, ativação/rollout e certificação de
P1/F2-09/V2 permanecem necessários. Fases 3–5 e condições humanas/comerciais
continuam abertas.
