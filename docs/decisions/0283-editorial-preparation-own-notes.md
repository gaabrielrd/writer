# ADR 0283: Preparação histórica protegida e notas autorais independentes

Status: captura interna local; validação pendente.

## Contexto

O getter nativo bloqueia todo o corpo da preparação se perder autorização das fontes. Notas de progresso são input próprio do autor e não devem desaparecer com o artefato relacionado. As duas classes não podem compartilhar uma regra de acesso ao corpo.

## Decisão

Ler metadata da preparação e reautorizar o manifesto antes de qualquer corpo. Gerar placeholder explícito quando revogado ou não suportado. Com autorização, projetar critérios e evidências em um grupo limitado, mantendo flags somente como historicalAcceptance/historicalReady.

Preservar notas próprias e seus literais mesmo com fonte ausente. Resolver vínculos apenas com prova de origem e versão; marcar os demais como indisponíveis, sem adotar recursos novos pelo mesmo nome/ID. Conferir o recurso de manuscrito por metadata.

Aceitar linhagem de documentos e conferir papel imutável entre versões. Remapear ponteiros lógicos de arquivo, inclusive unavailable, preservando a indisponibilidade e sem resolvedor nativo. Não inferir autorização operacional de aceite histórico ou do remapeamento.

## Consequências

O backup preserva notas independentes e a preparação disponível sem abrir caches revogados. O grupo é transporte interno limitado, não formato de record novo. A composição do produtor e a restauração continuam pendentes; nenhum gate é reativado.

Ver [incremento 35](../tasks/producao-literaria/35-captura-de-preparacao-e-notas.md). Testes apenas preparados.
