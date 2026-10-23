# P1 / M38c3i — Adoção atômica da geração de lore

## Resultado exigido

Executar o passo 5 do [plano 82](82-alcance-e-coleta-dos-corpos-de-lore.md):
CAS da origem, cabeça v2, geração ativa, adoção lógica de leases, clock,
privacidade/publicação e recibo no mesmo commit. Sem callable/UI/rollout antes
da integração de exclusão, consumidores e cliente.

## Decisões verificadas

publishBook e originalConsent nas Rules exigem isPublic true explícito.
Ausência é privada, embora mapLocal tenha default visual legado true.
Usar metadata lógica da inspeção e ponteiro booleano validado, nunca esse default
ou alegação do cliente.

Leases reservadas são fences privadas com marcador de geração. A ativação nativa
da geração torna todas as suas reservas logicamente adotadas, sem N writes por
página no CAS. O phase físico reserved permanece; prova de pai/slot/lease/
geração/recibo é necessária para interpretar adoção. Não liberar lease por string
adopted. Após aposentadoria, coleta continua exigindo referências/cabeça atuais.

## Tarefas e aceites

1. Contrato privado de adoção e fase adopted do pai. Recibo/evento nativos
   acoplados à ativação; replay histórico não reescreve cabeça nem clock.
2. Reabrir certificado ready e origem autorizada. Resolver consentimento final
   no servidor, preservar createdAt e avançar updatedAt no commit. Validar clocks/
   epochs e seus limites sem coerção.
3. Trocar cabeça, localLoreVersion, marca hasLoreResources e geração; aposentar
   geração anterior controlada. Se consentimento true sair, status draft,
   publicationPrivacyVersion incrementada e publicBooks removido juntos.
4. Projetar no stub somente consentimento explícito calculado pelo servidor para
   originalConsent das Rules. Readers aceitam esse espelho, mas inspeção valida
   o valor lógico e recusa divergência; o espelho não autoriza a edição.
5. Permitir registro/reuso de fonte cuja geração veio de adoção, conferindo
   contexto original e recibo/evento/head nativos. Geração aposentada não volta.
6. Resolver leases adotadas por prova nativa na coleta: ativa protege; aposentada
   permite somente continuar os guards de referência/cabeça. Cancelamento de
   pai adotado é recusado.
7. Testes Node/SDK para inline/v1/v2, conteúdo grande/páginas, CAS/replay/rollback,
   revogação e ausência de consentimento, clocks inválidos, fonte/artefatos
   recriados, encadeamento de edições e coleta de corpos realmente retirados.

## Arquivos e limites

Novos módulos de contratos/serviço/provas de adoção e resolução de lease;
integração dos stores do pai/inventário, leitores/inspeção e coleta.
Rules preservam marca servidor. Testes e documentação/ADR/AGENTS/evidência.

Certificado histórico não prova disponibilidade física futura; leases e referências
sob preparing impedem as limpezas legítimas durante a preparação. Leituras continuam
conferindo nascimento/cutoff/Merkle/SHA, recusando artefatos divergentes.

Este é serviço interno: exclusão do livro/lore, todos os writers/consumidores,
backup lógico e cliente ainda precisam de coordenação antes do rollout.
Sem criação/exclusão pública nova, dependência, IA, publicação automática ou deploy.
P1/F2-09/V2 continuam abertos; testes dirigidos, validate integral no fim de P1,
somente commits locais e CI ignorada.

## Evidência e sequência

[Entrega](../../../entregas/2026-10-23-writer-v2-adocao-atomica-das-geracoes-de-lore.md)
e [ADR 0101](../../../decisions/0101-atomic-lore-generation-adoption.md):
277 Node e três SDK distintos positivos em rodadas dirigidas.
Adoção interna implementada, inclusive segunda edição e coleta de lease
aposentada por prova nativa; phase físico reserved permanece fence.

Nenhum endpoint/UI/worker ou deploy. Criação/exclusão, inventário completo,
writers/consumidores/backup/cliente e rollout continuam pendentes.
P1/F2-09/V2 permanecem abertos.
