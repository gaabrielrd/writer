# P1 / M38c3g — Composição de gerações de lore em payload

## Objetivo e sequência

Implementar a composição do passo 4 do [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md)
para fontes em payload v1/v2. O passo 4 só termina após integrar a materialização
servidor das fontes inline, que permanece obrigatória na sequência. Não reduzir
o suporte final do produto a fichas já em payload.

Usar plan-feature, implement-feature, generate-tests e revisão/documentação
já adotados. Fonte de verdade: worktree writer-v2 e contratos nativos existentes.
Sem lacuna de produto que exija uma nova decisão do usuário.

## Requisitos e critérios de aceite

1. Início da composição congela a reserva: novos slots são recusados; replays
   antigos continuam confirmáveis. Campos obrigatórios e páginas ausentes
   impedem concluir. Fonte/clock/publicação permanecem intactos.
2. Preservar base e campos achatados herdados; aplicar remoções explícitas e
   slots nativos novos. Não criar cadeia de gerações ou duplicar prosa.
3. Preservar relações sem mudança; ao mudar, copiar/alterar descritores por
   página, usando slot reservado ou página herdada com contagem compatível.
   Nova página ou cauda com contagem diferente exige upload correspondente.
4. Ligar cada corpo à geração preparing com referência e recibos de inventário
   nativos antes de declarar sua seleção concluída. Nunca confiar em ponteiro
   físico do pedido; fonte e slots são abertos no servidor.
5. Auditar partes por unidades, SHA integral e validação de campos/relações.
   Base herdada exige a inspeção pronta da mesma origem e SHA atual.
   Checkpoint privado de SHA/parser sai ao terminar/cancelar.
6. Certificado ready fixa storage v2 e prova nativa do recibo; não ativa cabeça,
   não concede leitura e não substitui autorização atual da fonte.
7. Cancelamento continua válido em qualquer etapa; remove somente descritores
   próprios comprovados, mantém fences e respeita cabeça ativa/recriações.
   Bytes novos seguem o cleanup coordenado dos slots; herdados são preservados.
8. CAS, replay, rollback, origem revogada/alterada, estados/segmentos/certificado
   recriados e mais de 128 partes/páginas devem ter evidência apropriada.

## Arquivos e tarefas

- Contratos/store/serviço de bookLoreEditCompilation e seu checkpoint privado.
- Integrar o estado opcional ao pai, bloqueio de reserva e cleanup dos descritores.
- Reusar ResourceInventory e leitores/validador; nenhuma nova dependência.
- Testes Node com helpers nativos e cenários SDK no emulador dedicado.
- ADR, AGENTS, arquitetura, testing, README, planos e evidência da entrega.

## Limites e riscos

Este incremento não habilita endpoint, UI, adoção, publicação ou worker.
Fontes inline são recusadas antes de iniciar a composição; materialização
servidor por uploads derivados da origem será integrada na sequência, preservando
cancelamento de seus filhos ainda não reservados. Não receber prosa inline do cliente.

Geração preparing protege referências; cancelamento é irreversível. Coleta de
descritores não pode preceder checagem de cabeça atual. Certificado histórico
não comprova disponibilidade física futura sem os guards de inventário/lease.

Depois: materialização inline e adoção CAS/leases/clock/privacidade/recibo;
criação/exclusão, demais consumidores, backup lógico e integração cliente.
P1/F2-09/V2 continuam abertos. Testes dirigidos; validate integral no fechamento
de P1; commits locais sem CI remota, push ou deploy.

## Evidência

[Entrega](../../../entregas/2026-10-23-writer-v2-composicao-das-geracoes-de-lore.md)
e [ADR 0099](../../../decisions/0099-private-lore-generation-compilation.md):
69 Node e três SDK distintos positivos. Compositor em payload implementado,
com 129 páginas e campo acima de 8 MiB/128 partes.

Materialização inline continua na sequência obrigatória do passo 4; adoção
ativa e integração de exclusão ainda pendentes. Somente commit local.
