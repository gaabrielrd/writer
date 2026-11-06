# ADR 0288 — captura da integração e procedência de síntese

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

Integração reúne leituras, transições e sínteses. Seus resultados são ocultados
pelo leitor nativo quando a origem do job muda. Usar o leitor interativo no backup
alteraria o job; tratar IDs de relatórios de síntese como citações inventaria
uma espécie de evidência que o produtor não registrou.

## Decisão

Compartilhar inspeção read-only da origem e conservar a transição stale no fluxo
interativo. Abrir resultados apenas após o gate de job e a autorização nativa do
pedido. Preservar input próprio independentemente da disponibilidade dos derivados.

Registrar testemunhos privados de nascimento em novos pedidos/sínteses, sem
backfill de registros antigos pela cabeça atual. Preservar referências originais
indisponíveis em recriações. Configuração efetiva exige vínculo ao job original.

Acrescentar reportSources por achado/observação ao DTO portátil; são referências
a relatórios, distintas de evidenceIds. Verificação semântica exige alvo report;
remapeamento conserva vínculos e privacidade. Preservar escopos nativos de segmento,
transição, arquitetura e síntese. Evidência pode registrar o contexto canonical-json
fornecido, sem afirmar observação na prosa.

## Consequências

Dezenove famílias internas, sem endpoint ou produtor habilitado. Bundles de
integração até 242 artefatos/2 MiB, partes de 64 KiB. Nenhum cache de resultado é
aberto antes dos gates. Vinte e seis casos preparados, nenhum executado. Produtor,
restauração v2 e fechamento das cinco etapas continuam pendentes. Ver o
[incremento 40](../tasks/producao-literaria/40-captura-de-integracao-literaria.md).
