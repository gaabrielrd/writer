# W2-F1-01 — Jornadas operacionais e inventário

**Data:** 2026-10-13. **Base:** `a2df540`.
**Natureza:** definição documental, sem implementação de campanhas ou comércio.
**Plano:** inventariar a base, definir resultados/falhas, mapear requisitos e registrar escolhas.

## Inventário conferido

Descoberta pelo grafo `writer-v2`, indexado neste checkout. Auditoria complementar
somente leitura confirmou os serviços, regras e contratos na mesma base.

| Capacidade atual                       | Evidência                                                                                                                   | Incremento                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Livros, capítulos e atos               | [Book](../../../../src/features/books/model/book.ts), [Chapter](../../../../src/features/books/model/chapter.ts)            | Cenas sem trocar IDs ou redividir o manuscrito                 |
| Salvamento e recuperação local         | [Autosave](../../../../src/features/editor/hooks/useAutoSave.ts)                                                            | Histórico persistente e proteção contra edição concorrente     |
| Universos opcionais e lore             | [Universe](../../../../src/features/universes/model/universe.ts), [Lore](../../../../src/features/lore/model/loreEntity.ts) | Variantes de campanha e promoção explícita de cânone           |
| Aceite atômico de IA                   | [Aplicação](../../../../functions/src/chapterChat.mjs)                                                                      | Preservar texto, hash, crédito e recibo ao acrescentar versões |
| Publicação pública por projeção        | [Publicação](../../../../src/features/books/services/publicationService.ts), [regras](../../../../firestore.rules)          | Edição paga com autorização distinta; original privado         |
| Markdown, DOCX, impressão PDF e backup | [Exportação](../../../../src/features/editor/services/exportManuscript.ts)                                                  | EPUB e pacote de aventura por audiência                        |
| Arquivos de capa privados              | [Storage](../../../../storage.rules)                                                                                        | Materiais compartilhados e downloads pagos protegidos          |

Campanhas/sessões, revisão por convidados e comércio são novos domínios.
Limites do código não são benchmark de acervo. A fila de autosave é local à instância;
não resolve conflitos entre abas. Backup privado não é pacote comercial.

## Cenários de referência

- **Conto “A última luz do cais”:** dois capítulos, uma cena por capítulo, uma personagem,
  um segredo privado e um trecho de amostra escolhido pelo autor.
- **Aventura “O sino da aldeia”:** praça, torre, guardiã, pista pública e segredo do mestre;
  duas mesas chegam a consequências diferentes para a mesma origem.

São cenários originais preparados para roteiro; não são arquivos reais importados,
sessões jogadas nem piloto humano concluído. Corpus real autorizado foi inventariado
e medido posteriormente em [W2-F1-02](02-modelo-de-dominio.md), sem copiar conteúdo.
Não copiar aventuras comerciais para fixtures distribuíveis sem licença.
O operador indicará participantes; os roteiros serão preparados em W2-F1-05.

## Jornadas observáveis

| Ator e gatilho                  | Entradas                                                 | Resultado exigido                                            | Falhas e recuperação                                                           | Tarefas                    |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------- |
| Autor começa/retoma livro       | Livro novo/legado, universo opcional, capítulos/atos     | Conteúdo/ordem preservados e próxima atividade identificável | Retry de busca; rascunho preservado na navegação                               | F2-01, F2-04, F2-09        |
| Autor planeja/escreve           | Cenas, objetivos, arco, lore e texto                     | Planejamento ligado ao manuscrito e versão recuperável       | Conflito não sobrescreve silenciosamente                                       | F2-02 a F2-05              |
| Autor/criador solicita revisão  | Snapshot, revisor, rodada                                | Comentários sobre conteúdo autorizado; autor decide aplicar  | Conta errada/revogação negadas; sugestão obsoleta exige comparação             | F3-01 a F3-03              |
| Autor publica                   | Conteúdo selecionado, direitos, metadados                | Edição conferida, amostra, publicação Writer e EPUB          | Incompleta não ativa; segredo e backup não vão ao produto                      | F4-01, F4-02, F4-05        |
| Criador convidado vende livro   | Edição, contrato, preço BRL, capacidade de vendedor      | Oferta avulsa no catálogo acompanhado                        | Sem convite/licença/capacidade: venda não habilita                             | F4-04 a F4-08              |
| Criador escreve aventura        | Estrutura, pistas, prosa, materiais, universo opcional   | Original editável; preparação e pacotes por audiência        | Relação indisponível identificável; privado não vira amostra                   | F2-06, F2-09, F4-03        |
| Mestre cria campanha            | Aventura própria/adquirida ou campanha independente      | Campanha particular com origem identificada; edição intacta  | Compra inválida impede cópia; retry não duplica campanha                       | F2-07, F4-12               |
| Mestre prepara/conduz           | Cenas, missões, pistas, participantes, materiais         | Painel para revelar, registrar e retomar sessão              | Falha de rede preserva notas; mesas independentes                              | F2-08, F3-04 a F3-06       |
| Jogador recebe convite/material | Conta, participação, liberação explícita                 | Portal recebe só projeção liberada                           | URL, busca, alias, download e cache não expõem segredo; revogação corta acesso | F3-01, F3-04, F3-05        |
| Mestre registra consequências   | Acontecimentos e mudanças locais                         | Diário atualizado e proposta ao dono do universo             | Cânone nunca muda automaticamente; comparação de proposta obsoleta             | F3-07                      |
| Criador vende aventura          | Edição, materiais, licença e oferta                      | Pacote funciona em campanha própria; original intacto        | Importação sem direito bloqueia distribuição                                   | F4-03 a F4-12              |
| Visitante descobre obra         | Catálogo, criador, série, amostra                        | Metadados públicos sem corpo pago                            | Retirada bloqueia novas compras; amostra não libera original                   | F4-04, F4-05               |
| Comprador paga/recebe           | Conta, oferta e pedido                                   | Confirmação no servidor, biblioteca/download retomáveis      | Redirecionamento não concede acesso; evento repetido não duplica direito       | F4-06 a F4-09              |
| Comprador usa edição            | Direito vigente, edição comprada, escolha de atualização | Edição mantida, atualização opcional e uso em mesa própria   | Retirada suspende vendas; reversão depende de política pendente                | F4-09, F4-10, F4-12        |
| Operador atende/concilia        | Criador convidado, contrato, pedidos/eventos             | Catálogo acompanhado, atendimento central e razão rastreável | Pagamento, transferência e payout distintos; perda de webhook recuperável      | F4-04, F4-08, F4-10, F4-11 |

## Cobertura e classificação

| Requisito | Demonstração futura                                                  | Responsáveis                      |
| --------- | -------------------------------------------------------------------- | --------------------------------- |
| EV-01     | Conto completo e aventura em duas mesas; pilotos equilibrados        | F1-05, F3-08, F5-01, F5-06        |
| EV-02     | Lore compartilhado, consequências independentes e promoção explícita | F1-02, F2-03, F2-07, F2-09, F3-07 |
| EV-03     | Planejar/escrever/revisar/restaurar sem perda                        | F2-02 a F2-05, F3-02, F3-03       |
| EV-04     | Preparar/conduzir duas sessões; revelar só material escolhido        | F2-06 a F2-08, F3-04 a F3-08      |
| EV-05     | Publicação Writer, EPUB em leitor e pacote por audiência             | F4-01 a F4-05                     |
| EV-06     | Livro/aventura comprados, entregues, conciliados e atendidos         | F4-06 a F4-12, F5-04 a F5-06      |
| EV-07     | Vendedor sem convite não publica oferta; catálogo acompanhado        | F1-04, F4-04, F4-11               |
| EV-08     | Estimativa/capacidade revistas por fase, 20 h/semana                 | F1-06, F5-02                      |

A [matriz central](../matriz-de-cobertura.md) mantém IDs estáveis e lista completa.
Tudo acima integra a primeira versão pública. Percentuais, reversões, retenção e
capacidade Connect estão pendentes; comércio permanece no escopo.
VTT, mapas avançados, edição simultânea, assinaturas, áudio, apps e marketplace aberto
continuam candidatos posteriores. Exportar para loja não inclui publicar nela.

## Revisão documental

- As duas jornadas incluem criação, revisão, compartilhamento, publicação e consumo.
- Comprador e operador têm caminho até atendimento, reversão e repasse.
- Brasil/BRL, vendedor criador, comissão configurável e atendimento Writer são escolhas recebidas.
- Percentuais, encargos e responsabilidade pelo déficit não foram inventados.
- PRD, regras, interface e dependências não mudam neste incremento.

Pendentes: fidelidade de importação do corpus, aceite humano de protótipos, CI no PR e política
financeira completa. Esses resultados não são inferidos da revisão documental.
