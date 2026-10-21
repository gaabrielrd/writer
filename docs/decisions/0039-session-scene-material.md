# ADR 0039 — Cenas capturadas consultadas pela sessão

**Estado:** concluída tecnicamente em `56cbb06`, com CI geral e regras verdes.
**Contrato:** [F2-08 S2B](../tasks/writer-v2/execucao/23-cenas-completas-na-preparacao-da-sessao.md).

## Contexto

Uma cena capturada reúne planejamento e conteúdo, mas o bloco principal aponta
para o mesmo conteúdo. Também existem blocos adicionais e ilustrações próprias.
A preparação da sessão precisa consultar tudo isso sem duplicar o principal,
ignorar adicionais ou copiar material derivado para as notas particulares S1.

## Decisão

Estender o alvo mínimo S2A com kind scene, preservando as cinco APIs e o shape
lore padrão. O filtro de tipo ocorre no servidor antes da paginação. Lore e cenas
compartilham revisão de coleção, journal metadata-only, recibos e fences.
C4 continua na versão 3 e nos mesmos namespaces; não há novo pin por vínculo.

Três leitores específicos conferem campanha própria/reserva C4, sessão ativa e
revisão, vínculo/revisão/coleção e sourceContext antes de acessar a base ativa.
Planejamento entrega somente objetivo, conflito e ponto de vista. O manifesto
privado completo é validado antes de selecionar os descritores; content não é
lido junto do plano. O principal é consultado como bloco, uma única vez, com
vínculo e manifesto compartilhado conferidos. Adicionais usam seus próprios corpos.

A lista respeita a ordem capturada e o arquivo explícito. ownArchived é null no
principal, pois esse atributo não foi capturado ali; nos adicionais mantém o valor
capturado. Campo de planejamento ausente permanece diferente de texto vazio.
O cliente reúne e verifica todas as janelas e hashes antes de exibir o texto.

A ilustração é carregada por ação explícita. O leitor confere novamente toda a
identidade e os pins/generation após download e após derivação, limita os bytes e
aplica private,no-store em respostas de aplicação. Caminhos, origem privada e
bindings não são projetados. Testes com Storage injetado não comprovam Storage real.

O host público S2A reúne Fichas/Cenas com um único controle de operação e
recuperação. Campaigns mantém a composição; S1 permanece folha e conserva o texto
não enviado. A feature de referências pode importar tipos públicos e o verificador
puro de campaign-bases, além das projeções puras C2. A regra AST rejeita loaders,
readers HTTP, namespaces de runtime e imports dinâmicos dessas features.

## Consequências

- Cena ausente após adoção fica indisponível, sem fallback ou legado de cenas.
  A regra aprovada de fichas de lore legadas continua específica de C2.
- Universo indisponível não impede ler uma cena própria ainda autorizada.
- Troca, foco, fechamento e invalidação limpam os derivados; resultados tardios
  não repõem corpo ou imagem. O navegador conserva um bloco e uma imagem por vez.
- Vínculo indisponível pode ser removido sem resolver a origem. Reconhecimento
  histórico e cancelamento continuam possíveis após tombstone da sessão.
- Habilitação exige APIs, escritores, guardas e índices/regras conjuntos, com
  drenagem de versões antigas. Não há autorização de merge ou deploy.
- Pistas, missões, participantes, revelação e consequências permanecem em recortes
  posteriores. Este incremento não conclui F2-08 inteira.

## Verificação

Validate local verde: 1.935 frontend, 84 scripts e 395 Functions; cinco famílias
SDK únicas comprovadas e 12 combinações nativas sem retries/falhas. Dois P2 de
refresh/filtro foram corrigidos com testes negativos antes/depois. Resultados,
falhas de preparo, limites e CI pendente na [entrega S2B](../entregas/2026-10-18-writer-v2-cenas-completas-da-sessao.md).
