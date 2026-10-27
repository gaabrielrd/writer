# ADR 0192 — Validação persistente do conteúdo de aventuras

Data: 2026-10-27. Status: aceita para implementação interna.
Base: ADRs 0190/0191 e plano 170.

## Decisão

O transporte privado alimenta a máquina pura de conteúdo por ranges comprovados.
Cada operação fixa UID, jobToken, intenção e checkpoint antes do I/O. As leituras
conferem chunks, provas, nascimento, operação criadora e hashes; observações são
reconferidas na transação que confirma o próximo checkpoint.

O índice privado é imutável por entrada e os itens guardam ponteiros, sem copiar
a prosa. Os efeitos são preparados em buffer e descartados em falha. Um passo
permite até 160 chunks em cache, 384 observações de índice e 96 novos efeitos,
mais um snapshot. Não há leitura de todo o projeto em memória.

O estado atual fica em validationState/current, com JSON limitado a 64 KiB.
Preserva nascimento/criador e registra o último atualizador; as duas operações,
updateTime e hash devem conferir com a referência privada do job. Não acumular
um snapshot operacional por frame. Estados SHA podem conter fragmentos do arquivo:
a projeção pública não retorna estado, referências de snapshot ou buffers.

EOF e verificação semântica iniciam uma reconferência integral de chunks/provas
em lotes até 16, incluindo membership e cadeia. O servidor produz reportHash e
summary fechado. content-verified comprova somente conteúdo observado; não é
projeto ativo, grant, autorização de universo/lore ou revisão aprovada. Os futuros
consumidores ainda devem conferir as provas atuais de cada unidade e origem.
Não se afirma snapshot atômico de todo o arquivo contra alterações administrativas
externas durante uma sequência de transações.

Operações e recibos são atômicos com estado/índice. Replay retorna recibo histórico
e progresso atual. Se um trabalhador confirmar a mesma operação durante uma
leitura atrasada, o outro resolve o recibo antes de propagar a falha de contexto.
Erro conhecido de arquivo rejeita conteúdo sem salvar efeitos parciais; falha
de I/O/identidade não vira rejeição de arquivo.

## Compatibilidade e cancelamento

Jobs antigos continuam válidos sem metadata de validação. A ausência não autoriza
adotar artefatos órfãos. Cleanup inclui validationIndex, validationItems e
validationState para todos os jobs, validando contexto/provas e contagens antes
da certificação final. O estado mutável usa seu protocolo próprio antes da exclusão.
A reserva/raiz mínima aposentada permanece sem ownerId; o ID não é reutilizado.

Sem endpoint, composição de Functions, UI ou permissões novas. Os namespaces já
são negados recursivamente por Rules. Recuperação cifrada, revisão/remap, staging,
mídia, contadores, ativação e roundtrip seguem como entregas futuras.
