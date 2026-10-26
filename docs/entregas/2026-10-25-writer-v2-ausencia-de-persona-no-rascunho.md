# Writer V2 — ausência de persona no rascunho portátil

## Resultado local parcial

Rascunho explícito aceita a metadata fechada da ADR 0163. Ausência declarada
preserva texto/complemento sem perfil ou lookup por coincidência. Overrides
antigos conservam snapshot próprio autorizado, valores e revalidação final.
Sem marcador, perfil indisponível continua falhando. Marca inválida falha antes
de I/O; seleção de outro vínculo omite a marca antiga.

Schema compartilhado por rascunho e histórico mantém identidade/traits estritos
fora da exceção explícita. Máquina conta avisos também nas versões recuperadas,
conservando checkpoints anteriores. Restauro normal usa a versão separada já
existente; nenhum manuscrito é sobrescrito/recriado e nenhum perfil ausente é
instalado. Sem alteração em endpoints, Rules, namespaces ou dependências.

[Plano 141](../tasks/writer-v2/execucao/141-ausencia-de-persona-no-rascunho-portatil.md)
e [ADR 0164](../decisions/0164-explicit-draft-persona-absence.md).

## Validação dirigida

- Node: 32/32, zero skipped, 552.8914 ms, bookContentMachine e bookBackupContent.
  Seis casos novos: ausência/overrides no draft/histórico com retomada a cada
  checkpoint; dois casos de recusa com seis corrupções cada. Demais 26 regressões.
  Sem inventar perfil/binding, com warning exato e contagem de perfis preservada.
- Vitest da captura: 16/16, 2.83 s. Quatro novos: ausência não consulta biblioteca
  mesmo com ID disponível, snapshot anterior a next, raiz reautorizada, valores
  antigos com perfil revalidado, vínculo novo sem marca antiga, metadata fechada
  e falha sem marcador preservada. Doze regressões, incluindo 20 MiB/Unicode/abort.
- Vitest roundtrip: 2/2 selecionados, 14 não selecionados, 11.92 s. Rascunho vazio
  de capítulo removido com perfil ausente e texto Unicode/BOM com override antigo
  passam por captura normal, inspeção, cliente real start/upload/preparação/
  ativação/mídia/limpeza, histórico e nova cópia. Texto, datas, IDs remapeados,
  complemento, perfil/ausência e avisos comparados. Sem recriar capítulo.
  Ports locais e banco em memória; não comprova infraestrutura de produção.

Typecheck, formato e lint dos arquivos, arquitetura, links de docs, syntax dos
297 módulos Functions e diff passaram. Revisão do diff sem bloqueador no escopo. Sem nova UI, consulta SDK ou criptografia;
não repetir provas Chromium/SDK do plano 140 sem alteração nesses contratos.

## Limites

Este incremento resolve rascunho explicitamente marcado. Raízes/fontes antigas
sem marca não recebem inferência automática. Inventário geral, exclusão/coleta,
migração/certificação legada, rollout e validate integral permanecem pendentes.
P1/F2-09/V2, fases 3–5 e gates humanos/comerciais continuam abertos.
Somente commit local; sem CI, push, PR, merge, deploy ou subagentes.
