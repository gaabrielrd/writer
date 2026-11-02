# ADR 0168 — política de lore fixada na preparação

Status: aceita para incremento local; padrão runtime/rollout pendentes.
Data: 2026-10-25.

## Problema e decisão

indexedLoreBodies era lido da instância do serviço em cada avanço. Alterar
configuração podia mudar a escolha de representação de um pedido em andamento.

Start fixa loreMode inline-v1/indexed-v2 no job e na reserva nativa da mesma
transação. O campo não é input nem progresso público. Retry conserva o modo.
Load exige mesma presença/valor, enum válido e reserva imutável quando fixado.
Prova histórica de ativação confere a mesma reserva, sem abrir livro atual.

Materialização usa essa política, não configuração posterior. Prefixos já
iniciados mantêm interpretação original; o fluxo indexado continua entre fichas,
mesmo quando lorePayload volta a null. Fontes sem leitura indexada continuam
sujeitas aos caminhos de leitura já existentes, sem conversão presumida.

## Compatibilidade sem política

Job antigo não recebe flag/certificado retroativo:

- Prefixo streamed continua; prefixo legado ativo continua legado.
- Sem prefixo nem ficha preparada, conserva escolha legada.
- Entre fichas, um candidato metadata v2 sob o livro reservado, autenticado pelo
  journal original, comprova capacidade indexada. Consulta limitada a um candidato;
  infraestrutura/órfão/ABA falham, sem inferir ausência ou adotar conteúdo estrangeiro.

Decisão é reconferida na transação de escrita antes dos efeitos. Checkpoint
original continua como CAS. Não guardar lista de fichas/provas, reler prosa,
reescrever reserva antiga ou criar namespace/endpoint.

## Evidência e limites

[Plano 145](../tasks/writer-v2/execucao/145-modo-de-lore-fixado-na-restauracao.md)
e [evidência](../entregas/2026-10-25-writer-v2-modo-de-lore-fixado.md).
Fixtures Upload/Integrity passam a usar timestamps nativos simulados, sem
relaxar imutabilidade do servidor nem alterar o double global.

Padrão da factory permanece false; alteração do runtime requer inventário e
validação de conjunto. JSON v1–v6 novo usa normalizador v2; replay interno v1
mantém hashes e não recebe reparo automático de metadata. Auditoria operacional
de raízes internas antigas, chaves e contas reais continua no gate de rollout.
Sem CI, envio remoto, deploy ou validação humana inferida.
