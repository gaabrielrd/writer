# ADR 0164 — ausência explícita de persona no rascunho

Status: aceita para incremento local; P1 pendente.
Data: 2026-10-25.

## Contexto e decisão

A ADR 0163 conserva ausência/overrides antigos no capítulo e na fonte. O produtor
do rascunho M8 ainda exige perfil disponível e omite essa metadata, bloqueando
preservação de texto próprio após restauração.

Projetar personaAvailability fechada e vinculada ao complemento na contribuição
explícita, congelada antes de next/await. Com profile-not-recorded, guardar
complemento/valores e persona null sem consulta à biblioteca/preset. Não adotar
perfil por coincidência. Sem marca, a leitura M8 continua exigindo perfil real.

Com legacy-overrides, preservar perfil próprio autorizado e os valores antigos,
mantendo token/hash e revalidação final. Marca de outro vínculo é omitida;
marca malformada falha antes de I/O. Ausência declarada é metadata própria,
sem credencial, grant, consulta de perfil alheio ou novo fallback de erro.

Schema de book-draft e work-version.draft compartilha verificação de identidade/
perfil/traits. Marca de ausência exige persona null; marca de overrides exige
perfil real correspondente. Sem marca, identidade e traits permanecem estritos.
Máquina registra warnings reais no draft e nas versões, com checkpoint retomável;
histórico conserva snapshot próprio, sem registrá-lo na biblioteca por esse motivo.

Restauro usa caminhos existentes e conserva texto, datas, complemento e marca
remapeada na versão separada, sem sobrescrever ou recriar capítulo. Recaptura
conserva os avisos. Nenhum endpoint, coleção, Rules, dependência ou grant novo.

## Consequências e limites

API do rascunho recebe propriedade opcional por interseção, reutilizando o tipo
puro do marcador. Chapter não passa a depender da feature de portabilidade.
Prova de ausência reautoriza livro/origem ao fechar captura; não há perfil lido
para revalidar. Ramo disponível mantém sua prova M8 integral.

Formato ainda local contém metadata opcional; leitores antigos devem recusá-la.
Normalização v1 e dados históricos autenticados não são reescritos. Certificação/
migração dessas raízes, inventário geral, coleta, rollout e validate global
seguem pendentes em P1.

[Plano 141](../tasks/writer-v2/execucao/141-ausencia-de-persona-no-rascunho-portatil.md)
e [evidência](../entregas/2026-10-25-writer-v2-ausencia-de-persona-no-rascunho.md).
