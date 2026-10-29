# P3 — origem autorizada da base congelada

- Data: 2026-10-29.
- Base: 23dc270. Continuação do passo 3 do [plano 201](201-portabilidade-privada-de-campanhas.md).
- Estado: primeiro gate interno validado por testes direcionados; manifesto/atestado pendentes.
- P3/D/F2-09 e macro 8/35 permanecem abertos.

## Objetivo

Preservar a edição congelada, com origem verificável e autorização atual.
Primeiro implementar a leitura privada da origem/encarnação e dos controles,
sem prosa. Depois construir o manifesto completo e o atestado produzido pelo
servidor sobre o conteúdo capturado nativamente. Uma etapa não substitui a outra.

## Descobertas no código atual

- Bases v1 são criadas privadamente por campaignCapture ou campaignComparison,
  antes da ativação/adoção; esses produtores conferem o sourceToken da aventura.
- O cabeçalho retém sourceToken opaco, IDs, datas, contagens e snapshot textual.
  Não retém explicitamente o nascimento nativo da aventura/universo.
- O leitor ready-base não compara updateTime do conteúdo atual: editar a aventura
  preserva a edição antiga. Lore global e local reautorizam fichas separadamente.
- Variantes podem estar no layout legado ou em loreGenerations/GEN ready;
  bodyBinding/anchor podem referenciar bases/universos anteriores.
- C3 usa guard de admissão por encarnação, estado de variantes e autorização da
  conta. Captura não pode atravessar adoção em preparação.
- C4 e a exclusão da aventura reservam permanentemente as identidades; raiz
  reaparecida não reabre acesso. Ainda assim conferir nascimento nativo, sem
  usar datas lógicas como identidade.

## Primeiro incremento: gate privado somente leitura

Adicionar campaignBackupDerivedSource.mjs e teste dedicado, reutilizando
scope/token/identity da âncora. Entrada fechada: campaignId, sourceToken,
expectedDerivedToken opcional. UID/IDs/hash/valores capturados antes de await.
Exigir getAll mascarado; não fazer fallback para documento completo.

Conferir C4/raiz/âncora própria antes de ponteiros e dependências. Campanha
independente sem base retorna none e não consulta origem/biblioteca/autorizações.
Procedência desconhecida ou ponteiros contraditórios recusam explicitamente.

Para original, conferir guard de admissão, cabeçalho da base ready com dono/
campanha/aventura correspondentes, schema 1, sourceToken e capturedAt válidos.
Ausência da base/origem ou acesso removido retorna unavailable, sem IDs/datas/
nomes/prosa da base. Registro existente contraditório recusa como inconsistente.

### Compatibilidade de origem v1

Como os produtores atuais criam a base enquanto a origem está autorizada,
o nascimento da aventura atual deve ser anterior ou igual ao nascimento nativo
do cabeçalho congelado. Se for posterior, é outra encarnação: indisponível.
Comparar segundos/nanos reais, não createdAt/updatedAt lógicos. C4 continua
bloqueando mesmo que a raiz reapareça.

Essa regra depende dos produtores privados v1 atuais e não autoriza uma base
restaurada/fabricada pelo cliente. A futura restauração precisa marcador/recibo
de procedência explícito e consumidores atualizados antes de ativar novas bases;
não atribuir a elas a origem histórica só pela data de criação da cópia.

Editar texto/nome da origem não muda o nascimento nem a edição. O token de
derivados deve observar fatos de autorização, nascimento e clocks de lore,
sem depender do updateTime de texto/nome atual. A identidade completa da base
congelada, geração/controles/guard/clock é conferida por nascimento/updateTime.

### Lore, geração e controles

Universo ausente, não autorizado, deleting ou recriado depois da base torna lore
global unavailable; não invalida automaticamente partes/cenas da aventura própria.
Fichas exigirão gate individual por origem/encarnação antes de cada conteúdo:
o cabeçalho não reautoriza IDs globais recriados nem fichas retiradas.

Conferir loreVariantState/current contra a base ativa. Layout com geração
declarada exige cabeçalho ready, ID/base/dono/campanha/encarnação iguais,
sem fallback para legado. Ler clock de autorização sem criar/resetar.
Guard ativo de adoção recusa; guard/clock recriado invalida token anterior.

Resposta privada: âncora própria, availability none/unavailable/available,
derivedToken e base nula ou {id,capturedAt,globalLore}. globalLore é none,
available ou unavailable. Nenhum snapshot/título/corpo/chave/URL/prova/grant.
derivedToken vincula contexto próprio, identidades da base/controles e fatos
de autorização vigentes. Token anterior divergente recusa sem escrever.

## Contrato obrigatório das próximas etapas de procedência

1. Inventariar base completa: items/bodies/links/loreReferences/images, variantes
   e legadas por suas próprias anchors/bodyBindings. Unidades limitadas e
   conferências finais de presença/ausência, origem e identidade nativa.
2. Manifesto fechado/versionado da edição exata, com hashes/tamanhos/contagens
   de todas as seções e origens nativas. Não substituir corpos pela aventura atual.
3. Produzir atestado somente após leitura/validação nativa completa pelo servidor,
   vinculado ao manifesto/hash. Não assinar manifesto/hash fornecido pelo cliente
   como se fosse observação do servidor.
4. Verificação criptográfica/procedência separada da autorização atual na captura
   e restauração. Chave só no servidor, keyId/algoritmo/rotação explícitos;
   sem segredo em arquivo/journal, sem acesso concedido por assinatura.
5. Validar atestado e bytes do arquivo após excluir a campanha original, sem
   depender da base que C4 remove. Não usar apenas lookup do baseId antigo.
6. Tratar origens revogadas como indisponíveis na revisão, preservando próprios.
   Nunca promover variante/legada ou prosa revogada a nota própria.
7. Antes de persistir novos jobs/pins/prosa, ampliar C4 com compatibilidade v1–v4.
   Sem produtor, endpoint, chave real ou assinatura habilitados neste incremento.

## Critérios deste incremento

- [x] Nenhuma prosa/query/escrita; somente máscaras fixas e resposta mínima.
- [x] none independente; unavailable sem material antigo quando origem/base falta.
- [x] Produtores reais v1: edição da aventura mantém edição/base/token de derivados;
      recriação posterior e reserva permanente não autorizam o snapshot antigo.
- [x] Universo revogado/recriado suspende só lore global; sem conferir fichas aqui.
- [x] Geração/estado/guard/clock têm escopo nativo e adoção pendente bloqueia.
- [x] Pedido/caller malformado ou obsoleto, conta diferente e C4 recusam antes de texto.
- [x] Testes direcionados, lint/sintaxe/docs/formato e revisão documentados.
      Validate integral no fechamento do grande bloco.

## Não escopo e pendências

Não altera leitores/writers legados ou seus contratos públicos. Não lê corpos,
não exporta derivados, não assina e não declara proveniência portátil concluída.
Sem novo índice, segredo, dependência, Rules, endpoint ou persistência.
Os passos de manifesto/atestado/per-item e captura de variantes/legadas/mídia
continuam obrigatórios. Pilotos, comércio e política final de perguntas de 199
seguem pendentes; somente commits locais, sem CI/push/PR/merge/deploy/subagentes.
