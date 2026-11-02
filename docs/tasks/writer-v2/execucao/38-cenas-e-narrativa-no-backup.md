# F2-09 P1 M5 — Cenas, fontes e narrativa na captura limitada

Contrato técnico para implementação em 2026-10-21 sobre 78e4643. P1/F2-09 abertos.
Avanço local, sem CI/push. Grafo consultado primeiro; helpers recentes ausentes,
fontes atuais e contratos de Scenes/Narrative conferidos diretamente.

## Objetivo

Capturar todo o estado salvo de cenas, incluindo ativas, arquivadas e com
agrupador ausente, planos, corpos, referências explícitas e originais de conversão.
Incluir arcos, marcos, cronologia, vínculos e controles de ordem. Não montar
arrays do projeto inteiro nem copiar nomes/corpos globais resolvidos.

Manter M3b e M4 compatíveis. Lore próprio, personas usadas, rascunho, universo,
mídia, arquivo persistente e restauração continuam nos próximos passos de P1.

## Decisão e fonte

Reutilizar o token nativo M3b de raiz/workProgress atual e extraí-lo para um
helper servidor comum, sem alterar seu payload. Duas callables novas, somente
de leitura: listBookBackupResources e readBookBackupResource. Root ativo e do
autor reautorizado em cada transação; nested scope confere cena/arco próprios.
Nenhuma gravação, job, nova coleção privada, débito ou grant.

Cada lista é por ID, até 50 mais sentinela, com máscara vazia e tokens nativos.
Para filhos, o token também inclui a identidade do pai. Cursor vincula tipo,
pai, livro e origem; nunca recebe um caminho arbitrário do cliente. Corpo é um
documento projetado em partes de 64 KiB, JSON/hash/tamanho, limite de 8 MiB por
item igual a M3b. Largura do projeto não altera esse limite.

| Tipo              | Local relativo ao livro           | Pai    |
| ----------------- | --------------------------------- | ------ |
| scene             | scenes                            | nenhum |
| scene-body        | scenes/{sceneId}/body/current     | cena   |
| scene-planning    | scenes/{sceneId}/planning/current | cena   |
| scene-reference   | scenes/{sceneId}/references       | cena   |
| scene-control     | sceneControls/unassigned          | nenhum |
| scene-source      | sceneSources                      | nenhum |
| arc               | arcs                              | nenhum |
| milestone         | arcs/{arcId}/milestones           | arco   |
| event             | timelineEvents                    | nenhum |
| narrative-link    | narrativeLinks                    | nenhum |
| narrative-control | narrativeControls                 | nenhum |

Corpo de cena é obrigatório e confere hash/bytes com metadata do pai. Plano
ausente continua ausente, sem fabricar texto/datas. Original de conversão
confere hash do conteúdo e projeta somente os campos conhecidos de capítulo;
não copia controles ou campos desconhecidos do original.

Capturar rankA/rankB e o rankSlot ativo dos capítulos/controles, preservando a
ordem sem copiar flags/recibos de jobs. Acrescentar rankSlot à projeção de
capítulo M3b quando presente. Recusar deleting/rebalancing em itens/controles;
não aceitar snapshot intermediário de manutenção. Defaults legados A/ausência
permanecem distinguíveis nos dados; a restauração reconstruirá índices/contagens.

Referências de cena e vínculos narrativos projetam somente source e IDs de
destino (local/cena/evento/universo), sem resolver origem externa nem buscar URL.
Referências indisponíveis continuam identidade neutra e não viram conteúdo local.
Marcos são percorridos sob arcos existentes: os writers normais removem os
filhos antes do arco. Cena não depende de capítulo existente para entrar na seleção.

## Cliente e registros

Extrair a verificação de payload por item de M3b para helper interno reutilizado,
preservando ABI/resultados anteriores. Novo capturador percorre tipos globais
e filhos em profundidade máxima dois; escreve um item por vez em sink aguardado.
Ordenação UTF-8 estrita e cadeia de pares tipo/pai/ID/token, incluindo fronteiras
de escopo vazio, substituem readsets/Set ilimitados.

Envelope JSON de recurso: schemaVersion 1, kind, parentId, id e data projetada.
Registro M2 usa kind book-{tipo}, ID SHA-256 do endereço [tipo,pai,id] e parte;
o ID original continua no envelope, sem construir caminhos de arquivo. Índice
final book-resources contém somente schemaVersion e contagens por tipo.
Tokens e digest de conferência são privados e não entram no arquivo.

Retornar prova com origem/digest/contagens. Conferência final repete seleção e
identidades, reautoriza raiz e compara prova após as demais capacidades e antes
do selo M2. Todos os registros são provisórios. Guardas de pertencimento dependem
dos writers transacionais/Rules e da manutenção Admin coordenada.

## Sequência

1. Helper servidor de contexto M3b e serializer JSON limitado compartilhados;
   preservar os testes existentes, incluindo BOM/UTF-8.
2. Contrato puro de recursos, duas leituras autorizadas e registro no dispatcher;
   parent/método/ID/cursor fechados, máscaras de metadata e hashes exatos.
3. Captura/conferência e transporte públicos em book-portability, com helpers
   internos compartilhados, sem dependências novas nem import entre features.
4. Functions/Vitest/SDK: todos os tipos, cenas órfãs/arquivo, ranks A/B, referência
   neutra, fonte original, prosa grande, pai/autor errados, mudança de corpo/plano/
   metadata e origem, paginação/cancelamento/retorno sem selo.
5. Chromium com emulador: estrutura/histórico/recursos juntos em M2, texto/ordem/
   referências, corrupção/mutação/abort. Não confundir fixture com sink final.
6. Tipos/lint/sintaxe/arquitetura/formato/docs/diff dirigidos, revisão/entrega/commit
   local. Validate completo no fechamento P1; sem CI/push/deploy.

## Limites

Não fecha schema/restauração integral nem valida usuários reais. Não muda as
APIs dos JSON v1–v6. Não inclui caches, recibos, contagens, lore global ou chaves.
Não promete orçamento de memória do sink; prova apenas o produtor por item/página.
Dados que violem os contratos de corpo/autor/IDs/ordem falham explicitamente,
sem omitir item para fazer passar. Nenhuma tarefa ampla adicional concluída.

## Resultado local

Implementado sobre M4, preservando M3b e acrescentando os onze tipos.
Functions 18/18; cliente 53 casos distintos com evidência positiva composta;
SDK combinado 15/15; Chromium oito cenários com 58 versões e 146 registros M2,
incluindo ordenação B, referências neutras e recusa de selo após mudança de filho.
Build/smoke e checks dirigidos positivos. Veja [entrega M5](../../../entregas/2026-10-21-writer-v2-cenas-e-narrativa-no-backup.md)
e [ADR 0049](../../../decisions/0049-book-resources-read-proof.md).
Sem CI/push/deploy ou dependências novas. P1/F2-09 permanecem abertos.
