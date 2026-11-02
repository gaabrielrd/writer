# F2-09 P1 M18 — Catálogo e normalização legados continuáveis

Contrato em 2026-10-22 sobre d8f2657. M17 entregou scanner lexical compartilhado.
Próximo passo necessário para integrar JSON v1–v6 ao job servidor de restauração.

## Objetivo e requisitos

Extrair do catálogo M12 o estado fechado de contagens/presenças, a aceitação de
um span e a finalização com procedência. Não guardar texto no estado. O wrapper
existente continuará usando o scanner M17 e essas mesmas regras.
Catálogo devolve descriptor serializável e leitura de item por span limitado.

Converter a normalização M12 em máquina de passos. Cada unidade valida um
perfil/grupo ou emite um registro lógico. Cenas e narrativa avançam entre corpo,
planejamento e referências, conservando hash do item em andamento para impedir
mistura durante a retomada. Checkpoint é metadata-only, fechado/versionado,
ligado ao descriptor por hash, com contagens/avisos e posição. Não guarda prosa
nem listas de referências/itens.

Preservar ordem, DTOs, IDs de origem, A/B derivados, perfis usados, ausência de
histórico/draft/progresso/capa, procedência de universo e descarte de etiquetas
resolvidas/publicação. Fontes originais e complementos antigos mantêm semântica
M12. JSON normalizado continua limitado por item, sem limite de quantidade do
projeto. Um único núcleo M15 confere semântica/relações/referências.

## Sequência e arquivos

1. Extrair estado/aceitação/finalização e item do bookLegacyCatalog existente.
2. Adicionar bookLegacyNormalize com cursor fechado e passos, e fazer
   bookLegacyReview delegar para ele sem segundo normalizador.
3. Tests com cursor/descriptor serializados a cada passo e novo host de índice,
   paridade com o fluxo existente, perfis/grupos/cenas/narrativa/referências,
   falhas de I/O/índice/abort/corrupção e ausência de prosa.
4. Regressões Node e cliente/navegador conforme mudança compartilhada, tipos/lint/
   build/docs/arquitetura. SDK não muda neste passo.
5. ADR, documentação, registro de evidência, revisão e commit somente local.

## Suposições, não escopo e riscos

Fonte/índice são confiáveis e privados do host; cursores não autorizam bytes.
No servidor, preparação/índice/checkpoint/recibo deverão ser atômicos, com todas
as leituras reconferidas. Esse vínculo, snapshot ampliado, cleanup e integração
com advanceBookRestoreValidation são a continuação obrigatória.
Não criar callable/root/Storage/grant nem concluir P1 neste passo.

Descriptor serializado não pode incluir Set/closure/prosa. Não materializar
corpo global ignorado. Repetir leitura de item grande entre passos é limitado
por item, mas não promete leitura única. Observar erros e não avançar cursor
do chamador quando a operação falha; efeitos externos exigem transação do host.

Permanecem materialização/remapeamento/mídia/ativação, revisão protegida/host/
UI/roundtrip e validate completo no fechamento P1. Política de draft pendente
não bloqueia essa normalização. Sem CI, push, PR, deploy ou subagentes.

## Aceites

- [x] Catálogo e descriptor retomáveis, sem prosa.
- [x] Um único normalizador, com unidade limitada e cursor por JSON.
- [x] Paridade dos seis formatos, contagens, avisos e procedência.
- [x] Fanout não acumulado; origem divergente e cursor incompatível recusados.
- [x] Falha/abort não altera cursor; regressões dirigidas e evidência local.

Releitura de registro por cursor anterior confere identidade/hash e índices
existentes sem writes; ausência não é reparada. Provas e limites estão na
[entrega M18](../../../entregas/2026-10-22-writer-v2-catalogo-legado-retomavel.md).
O protocolo servidor legado continua pendente para a próxima etapa.
