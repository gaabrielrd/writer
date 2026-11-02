# P2 — narrativa própria no backup de aventuras

Base: d5efcd2. Incremento interno: arcos, eventos da cronologia, marcos,
controles de ordem e vínculos narrativos. Lore completo terá seu próximo
incremento: contratos de metadata/corpo e identidade nativa são específicos.

Grafo writer-v2 consultado sem resultados; indexação anterior falhou por worker
crash. Fontes atuais conferidas: narrativePlanning/Contracts/Jobs e seus testes.
A narrativa é inline no head, diferente dos corpos de cena. Milestones moram
sob arco; narrativeLinks guarda source/reference e índices derivados. Controles
de sequência ficam em narrativeControls/hash(kind, arcId), sem owner/schema
próprios. entity-scenes é índice derivado e não deve entrar como texto/autoria.

## Contrato antes do código

Estender as definições fechadas e o leitor de recursos 149, sem framework novo.
Famílias: arc, event, milestone, arc-order, event-order, milestone-order e
narrative-link. Coleções arc/event/links por metadata N+1 e limite 50.
Milestone recebe parentId do arco. Ordens são singletons de ID determinístico
pelo contrato nativo; milestone-order recebe parentId, mas o documento está na
coleção raiz narrativeControls. Nenhum caminho arbitrário ou listagem irrestrita
dos controles. Controle ausente é descriptor present false, nunca default novo.

Arco/evento/marco devem ter owner/schema 1/kind coerentes; marco precisa do arco
autorizado e arcId igual ao pai físico. Link depende do source próprio autorizado,
inclusive marco + arco, sem resolver disponibilidade/labels de seu alvo. Metadata
de link usa somente source.kind/id/arcId para essa prova, não prose/reference
inteiros. Tokens incluem dependências nativas; mudança/ABA bloqueia continuidade.
Arco em remoção e controle em reorganização falham sem alterar origem.

Codec conserva title e campos inline de cada tipo, datas, ranks A/B; evento
conserva dateLabel textual livre. Link conserva somente source/reference neutros,
com referência fechada a cena, evento ou lore(kind/scopeId/entityId). Excluir
sourceKey/sourceArcId/loreKey, referenceCount, revisões, jobs, operações e labels.
Ordem conserva somente rankSlot. Manter vazio/ausência literal e não inventar
defaults. Unidade continua 64 KiB/hash integral, intenção capturada antes de await.

Sem novo writer, namespace, Rule, endpoint, frontend, concessão de acesso ou
alteração no formato de livro. Tokens ainda não são selo global da aventura.

## Sequência e testes

1. Definições/codec e endereços determinísticos, estendendo somente flags
   concretamente necessárias ao domínio narrativo.
2. Autorizar fonte e dependências no mesmo snapshot; ler metadata sem prosa,
   conteúdo apenas em read. Controle usa autorização do próprio root/arco.
3. Testar produtores reais: arco/evento/data livre/marco/refs; ordem após
   rebalance; controle ausente; >50; autoria/schema/pai/ABA e alvo externo
   indisponível neutro; falha/retry, máscaras, bytes e nenhuma escrita.
4. Regressões 147–149 e SDK dirigido real do novo recorte, lint/sintaxe/docs/
   arquitetura/styleguide/format/diff. Validate integral no fechamento de P2.
5. Revisão, ADR, evidência parcial e commit local; continuar lore/demais famílias.
   Sem CI, remoto, deploy ou subagentes.

## Aceites

- [x] Sete famílias e ordens determinísticas com ausência explícita.
- [x] Metadata/prosa separadas e source/pai coerentes na mesma transação.
- [x] Valores próprios literais; referências neutras sem resolver alvos globais.
- [x] Testes/SDK/checks, revisão/docs/commit; demais P2/P3/D abertos.

## Resultado dirigido e revisão

158 Node positivos (40 novos + 118 regressões), sem skip, em 576,7703 ms.
Cinco SDK positivos (dois novos + três regressões) em 11.673,5812 ms.
Produtores reais, data livre, 53/52 eventos, reorganização rank B, ancestrais
nativos e controle ausente foram comprovados. Lint dirigido positivo; checks
documentais/arquiteturais/styleguide/sintaxe/formatação/diff no fechamento.

Revisão confere fonte estrutural de link, controle raiz de marco e projeção
neutra de alvos indisponíveis. Nenhum lookup externo ou writer novo.
[ADR 0173](../../../decisions/0173-adventure-backup-narrative-resources.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-narrativa-no-backup-de-aventuras.md).
P2 integral, lore/demais famílias e validate do bloco continuam pendentes.
