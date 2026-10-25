# P1 / M38c5w — Origem independente por ficha de lore

## Problema e objetivo

O token v1 de uma ficha inclui o listToken do compêndio. Uma mutação própria
invalida outras origens revisadas, mesmo que seus documentos nativos estejam
intactos. Dividir a seleção em unidades requer conservar a origem aprovada,
sem capturar silenciosamente textos posteriores nem impor limite de seleção.

Acrescentar tokenVersion: 2 por opção explícita de leitura. Preservar emissão,
pedidos, hashes, cursores e semântica v1 por padrão. Não migrar journals/cópias.

## Requisitos

1. Token v2 vincula UID, livro, nascimento nativo do livro, ID da ficha e
   nascimento/atualização nativos da ficha. Domínio/schema distintos de v1.
   Ignora somente o clock de outras fichas; nunca ignora mudança da origem.
2. Autorização e estado/clock válido do livro são reavaliados em cada unidade.
   Corpos, seals, inventário, inspeções e recibos mantêm suas provas atuais.
3. list/get aceitam tokenVersion 1 ou 2; omissão conserva v1. Get com token
   esperado preserva exatamente sua versão e recusa negociação simultânea.
   Partes sempre exigem o token original. Não promover v1 para v2 em retry.
4. Lista conserva listToken global e checagem final da coleção. Cursor v2
   fixa a versão de emissão; não permite alternar o esquema entre páginas.
5. Inspeção, uploads, inventário e reserva de chave reconhecem ambos os
   tokens exatos. Comparações entre intenções continuam literais. Outros
   produtores emitem v1 por padrão, sem recalcular tokens de pedidos antigos.
6. Cliente recebe opção tokenVersion na criação. Captura/get/metadata/list
   usam essa opção somente quando não há origem fixada; validação final e
   reconstrução de bytes permanecem. Nenhum consumidor atual é migrado.
7. Testar v1 intacto, token v2 estável em mutações alheias, origens alteradas,
   revogação, ABA, esquema/cursor malformados, seleção acima de 50, execução
   sequencial parcial e preparação/adoção/recuperação nativas em v2.

## Sequência e arquivos

- ReadContracts/Read: token v2 opcional, compatibilidade e cursor.
- SourceInspectionStore/FieldUploadStore/ResourceInventory/WriteRecovery:
  validação compatível sem fallback ou mudança de pedido.
- bookLoreReadClient/ReadService e testes: opção explícita na sessão Auth,
  preservação do esperado e guardas de conta/host antes/depois da RPC.
- Fixtures SourceInspection/FieldUpload: opção de teste sem alterar default.
- Node ReadTokens, roundtrip cliente e casos SDK de tokens; regressões afetadas.
- ADR 0136, AGENTS, arquitetura, testes, execução/81, ADR 0091 e evidência.
- Revisão/checks e commit local. Validate integral no fechamento de P1.

## Aceite e riscos

Seleção independente permite retirar/editar membros sucessivos com suas fontes
originais. Se outro autor muda uma ficha, sua mutação é recusada; progresso das
demais não vira alegação de atomicidade conjunta. Coleção inteira continua
falhando se mudar durante montagem/paginação. Fonte v1 persistida continua
recusando clock posterior e nunca ganha uma origem v2 implícita.

O esquema não é grant, não conserva disponibilidade de corpos e não ignora
troca de dono/deleting/clock inválido. Cópias antigas, wire, hashes, namespaces e
formatos cifrados intactos. Sem deps, Rules, índices, env, callable novo, UI ou
rollout. Transporte/coordenador/recuperação de seleção e composição do compêndio,
lifecycle/consumidores/backup/validate de P1 e fases/gates da V2 seguem abertos.

## Resultado local

Token v2 opcional implementado no servidor/cliente/sessão Auth, sem migração
dos consumidores atuais. Compatibilidade v1 preservada, validação das duas
origens nos consumidores diretos e cursores separados. 601 casos distintos
positivos em rodadas (38 novos), incluindo três SDK, 53 fontes originais e
adoções sequenciais. Lint/tipos/build/smoke/sintaxe positivos.

[ADR 0136](../../../decisions/0136-independent-book-lore-source-tokens.md) e
[evidência](../../../entregas/2026-10-25-writer-v2-origem-independente-de-lore.md).
Seleção durável/recuperação/UI/compêndio e demais fases/gates seguem pendentes.
Validate integral no fechamento de P1. Sem CI/envio remoto/deploy.
