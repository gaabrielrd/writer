# P3 — Inventário C4 das campanhas restauradas

- Data: 2026-10-29.
- Base: e8be4b2; sequência de [225](225-ciclo-das-variantes-com-relacoes-nao-resolvidas.md).
- Estado: implementado e validado localmente; npm run validate verde no bloco 219–226.

## Descoberta e decisão

O C4 atual já apaga documentos inteiros das coleções em que os leitores
restaurados guardam sourceEvidence, referências portáteis e bodyCodec.
Esses campos não criam novas famílias. Não alterar versões antigas nem
inventar namespaces de jobs que ainda não têm produtor/contrato.

Hoje listas de coleções e limites de cursores das versões 1–4 estão duplicados
em Contracts/Cleanup. Centralizar o inventário real para que executor e
validador usem a mesma definição versionada. Preservar exatamente ordem,
masks, filtros, whitelists e limites, inclusive a versão 1 implícita.
Qualquer futura família persistente da restauração exigirá integração própria
na limpeza e nas reservas antes de seu produtor; este passo não a declara coberta.

## Sequência e aceite

1. Extrair inventário privado puro e imutável v1–v4: recovery, controls,
   coleções de base/geração e filhos da campanha. Cleanup e validação dos
   checkpoints derivam os limites da mesma versão, sem reinterpretar jobs
   existentes. Não mudar start v4, DTOs, fases públicas ou Rules.
2. Reutilizar fixture portátil rica do incremento 225 extraindo helper, sem
   mudar seus 41 casos. Adicionar cenários C4 com campanha restaurada real,
   base original/retida, variante portátil, corpos emprestados após C3,
   gerações antigas/inativas e imagens compartilhadas.
3. Provar revogação antes da limpeza, nenhuma leitura de prosa ou dependência
   da autorização original, páginas limitadas/retry exato e falha sem avanço
   quando identidade/pin são inconsistentes. Preservar biblioteca, outra
   mesa e fontes. Confirmar ausência física do material e retenção mínima.
4. Provar execução de jobs 1–4 em seus inventários reais, inclusive ausência
   de cleanupVersion, limites/certificados existentes e preservação de recursos
   de versões posteriores ao retomar uma versão antiga.
5. Testes dirigidos e revisão, ADR/AGENTS/inventário/evidência. Rodar validate
   integral para fechar o bloco de leitores/cleanup 219–226 antes de seguir
   para produtor de upload/restauração. Registrar resultado real.

## Limites e continuação

Sem jobs/uploads/Storage privados de restauração novos, endpoint ou UI.
Os recursos atuais são cobertos pela exclusão existente; os futuros precisam
de contrato de cancelamento/coleta e vínculo seletivo à campanha antes da
primeira gravação. Não usar ID bruto/hash do arquivo como autorização de alvo.
Pais devem permanecer registrados até coletar seus filhos.

A restauração persistente, remapeamento/materialização/ativação, revisão no
Estúdio e ciclos ricos continuam necessários. Macro 8/35 e P3/D/F2-09 abertos.
Somente commits locais; sem agentes/CI/push/PR/merge/deploy. Preservar servidor
manual e checkout master.

## Conferência adicional de metadata

A máscara de confirmação contém título/procedência, mas o guard de cada passo
só precisa dono/schema/marca/deletionId e identidade nativa. Separar essas
máscaras para que os passos de coleta não leiam prosa da raiz. A confirmação
mostrada ao usuário conserva seu contrato; nenhuma fase ou versão muda.

## Resultado dirigido

Inventário imutável extraído sem alterar layouts 1–4; validação e execução
compartilham as listas. Guard de passo usa máscara sem prosa. Fixture portátil
reutilizável mantém seus 41 casos e suporta os novos cenários de limpeza rica.
11 novos e 57 regressões positivos (68/68); ESLint dirigido positivo.
A [evidência](../../../entregas/2026-10-29-writer-v2-inventario-c4-das-campanhas-restauradas.md)
registra orçamentos, retry, fontes/pins preservados e limites do inventário.
Validação integral do bloco 219–226 positiva: npm run validate exit 0, 9.710
testes (4.978 frontend, 94 scripts, 4.638 Functions), cobertura e limites
preservados, sintaxe de 451 módulos, lint/typecheck/build/smoke positivos.
