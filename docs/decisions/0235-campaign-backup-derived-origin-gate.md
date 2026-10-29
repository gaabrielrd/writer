# ADR 0235 — origem autorizada da base congelada na portabilidade

- Data: 2026-10-29.
- Estado: gate interno de metadados implementado; procedência portátil pendente.
- Base: 23dc270. Plano [205](../tasks/writer-v2/execucao/205-origem-autorizada-da-base-congelada.md).

## Decisão

Conferir a âncora própria/C4 antes de ler ponteiros e dependências da base.
Campanha independente sem ponteiro retorna none; origem/base ausente ou acesso
removido retorna unavailable sem material histórico. Metadados contraditórios
recusam explicitamente. Nenhuma leitura carrega prosa ou cria controles.

Bases v1 atuais nascem nos produtores privados de captura/comparação, enquanto
a origem está autorizada. Para esses produtores, o nascimento nativo da origem
atual deve ser anterior ou igual ao nascimento do cabeçalho da base. Origem
recriada depois não é a mesma encarnação, mesmo com ID/datas lógicas iguais.
Reservas permanentes de exclusão continuam prevalecendo sobre raiz reaparecida.

Essa compatibilidade pressupõe os produtores privados v1 existentes; não é
prova histórica genérica nem procedência de uma cópia importada. A futura
restauração exige marcador/recibo de procedência e consumidores atualizados
antes de ativar bases novas. Não usar a data de criação da cópia restaurada para
atribuir a ela a origem histórica. Datas lógicas não concedem acesso.

A edição da aventura/nome do universo preserva a base antiga: token de derivados
observa nascimento e fatos/clocks de autorização, sem comparar updateTime de
texto/nome atual. A base congelada, controles, geração, guard e clock incluem
nascimento/updateTime reais nas provas privadas.

Universo ausente/não autorizado/deleting/recriado suspende lore global, sem
retirar automaticamente a estrutura da aventura própria. Toda ficha e todo
legado ainda exigirão gate individual de origem/encarnação antes de seu conteúdo.
Geração declarada exige cabeçalho ready correspondente, sem fallback para legado.
Guard de adoção ativo bloqueia; guard/clock recriado invalida token observado.

## Resposta e alcance

A resposta contém âncora própria, availability, derivedToken e base nula ou
id/capturedAt/globalLore. Não contém nome/snapshot/texto/chave/URL/atestado/grant.
none não certifica que coleções estejam vazias; a captura completa ainda precisa
inventariar famílias, variantes e legadas, sem inferir ausência por um ponteiro.

O token é uma âncora privada de metadados, não uma assinatura nem prova portátil.
O manifesto/atestado só poderá ser produzido após conferência nativa completa
de todas as seções e hashes. Não assinar hash/manifesto arbitrário do cliente.
Atestado também não substitui autorização atual na restauração nem pode
depender exclusivamente de baseId antigo que C4 remove.

A [evidência parcial](../entregas/2026-10-29-writer-v2-origem-autorizada-da-base.md)
usa captura/comparação/adoção/exclusão reais sobre bancos de teste com metadata
nativa simulada. Não comprova produção, credenciais ou concorrência Firestore.
Não há produtor persistente, assinatura, endpoint, Rules ou segredo novos;
C4 permanece v1–v4 até sua evolução explícita para os produtores futuros.
