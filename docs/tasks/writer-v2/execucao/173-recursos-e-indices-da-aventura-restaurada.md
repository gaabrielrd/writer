# P2 — recursos e índices da aventura restaurada

Base: f0a4e8c. Conferidos planos 171/172, escritores nativos de metas/checklist,
planejamento, referências de cena e narrativa/ordens/índices. Grafo parcial sem
cobertura suficiente; usar os contratos reais, sem cast de livro.

## Sequência

1. Evoluir staging com cursor resourceIndex e contagens próprias, sem recuar
   itemIndex. Fases resources/resources-ready; recibos anteriores continuam
   válidos. Conferir todas as famílias processadas contra o manifesto validado.
2. Acrescentar mutações comprovadas de target/journal: criação estrita, ensure
   de parent já comprovado e update com leitura/hash/versão anterior, preservando
   nascimento/criador. Só alterar targets próprios do restauro e confirmar os
   efeitos com checkpoint/recibo, sem adotar documento preexistente.
3. Ampliar endereços/cleanup antes de escrever checklist, arcos/eventos/marcos,
   controles narrativos, planejamento/referências e sceneLoreLinks. Filhos novos
   usam IDs de journal com prefixo ordenado antes dos pais, mantendo IDs legados.
   Parent só pode ser removido após apagar os novos filhos comprovados; um
   estrangeiro restante impede certificação. Não amostrar dois filhos e presumir
   que não há outros. Índice verifica parents ainda não criados antes de sumir.
4. advanceAdventureRestoreResources percorre a seção novamente pelo cursor próprio.
   Preparar metas/checklist (totais/conclusões nativos), planejamento presente,
   narrativa/ordens e referências/links/índices derivados. Marcos asseguram seu
   arco por lookup autenticado mesmo em arquivo fora da ordem nativa.
5. Preservar texto/data/estado/ordem e referências mapeadas. Referência externa
   continua qualificada e sujeita ao acesso atual; não ler/copiar seu corpo nem
   criar grant. Ponteiros locais podem preceder a fase de lore. Revisões são
   operacionais novas. Contagens de palavras/grupos/blocos e de referências
   narrativas serão reconstruídas antes da ativação; countReady permanece false.
6. Validar orçamento e limites nativos sem truncar. Conferir todas as provas
   antes da transação consumidora. Replay, concorrência, callback retry/rollback,
   cancelamento e source/target/journal adulterados não deixam escrita parcial.
7. Testes nativos/adversariais Node/Vitest e SDK demo, incluindo mais de 50 filhos,
   ordem de arquivo não nativa, presença/ausência, atualização com criador antigo,
   perda/recriação, estrangeiros e cleanup completo. Checks dirigidos durante
   ajustes e revisão/docs/evidência/commit local.
8. Rodada integral no fechamento do bloco de montagem conforme risco de integração,
   sem CI/push/PR/deploy ou agentes.

## Aceites

- [x] Cursor/contagens compatíveis e passagem nativa dos recursos/índices.
- [x] Criação/ensure/update comprovados sem perder criador ou adotar conteúdo.
- [x] Cleanup ordenado, limitado e seguro para muitos filhos e dados estrangeiros.
- [x] Testes pertinentes/SDK e checks positivos, revisão/docs/evidência local.
- [x] Commit local sem ativar projeto nem alterar aprovações humanas/comerciais.

Ficam obrigatórios: lore/personas/imagens, universo autorizado, histórico/draft
em versão separada, agregados/audit/ativação, recuperação cifrada/UI e roundtrip.
resources-ready indica passagem concluída, não permissão de publicar/ativar.
P2/P3/D/F2-09 e 8/35 permanecem abertos.

Evidência: [recursos privados](../../../entregas/2026-10-27-writer-v2-recursos-privados-de-aventuras.md).
40 Node e nove Vitest em seleções pertinentes, quatro SDK distintos em duas
chamadas demo, lint/sintaxe e checks dirigidos positivos. O caso de fronteira
filhos/pais reproduzido foi corrigido e confirmado também no SDK. Sem novo
validate integral neste incremento; manter a rodada no fechamento do bloco maior.
