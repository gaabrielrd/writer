# Writer V2 — Revisão retomável da autorização das origens

- Data: 2026-10-29.
- Branch: codex/writer-v2; base ab8598b.
- Escopo: [plano 232](../tasks/writer-v2/execucao/232-revisao-de-origens-retomavel.md).
- Decisão: [ADR 0262](../decisions/0262-campaign-resumable-origin-review.md).
- Estado: núcleo interno implementado; materialização/ativação/UI pendentes.

## Funcionalidades e critérios atendidos

Captura/rechecagem da autorização atual retomam por até 25 eventos, com
testemunhas existentes do índice derivado e project reconstruído do own
validado. As regras compartilhadas mantêm o resultado/digest anterior.
Leitores conferem metadata e nascimento das origens, sem ler prosa original.

Estado limitado fica cifrado no job, vinculado à conta/encarnação/arquivo/
índice/project e clock. Gravação reconfere clock na mesma transação do
checkpoint. Reinício explícito preserva etapas anteriores e revisa fontes
atuais. Cancel limpa estado/chave atomicamente; recibos originais sobrevivem.

Prova interna é campaign-origin-review-only, sem grant por recurso.
Materialização deverá reautorizar cada origem na própria escrita.
Não há coleção nova, dependência, endpoint público ou mudança de interface.

## Testes dirigidos e compatibilidade

17 casos novos distintos positivos em rodadas: origens reais, retomada por
evento/serviço, mudança entre passes, recriação do clock/ficha, universo retirado,
legado v1, omissões, máscaras sem prosa, replay, rollback em três pontos, CAS,
cancelamento durante leitura, revogação/C4/isolamento e clock alterado entre
a leitura da origem e a gravação do checkpoint.

A rodada inicial teve 15 passes e uma falha: o identificador da operação no
helper era curto para um arquivo com poucas etapas. Corrigido o prefixo,
o caso de omissão passou (470,9383 ms). O caso adicional da corrida de clock
passou em 1.799,768 ms. Nenhuma regra de produção ou limite foi reduzido.
A regressão da extração compartilhada passou nos 56 testes existentes de
origens em 8.457,8054 ms (m155-origin-extraction.log).

Cinco perfis assinados compararam o algoritmo anterior congelado em QA,
o revisor completo compartilhado e o persistido: acesso atual, dono alterado,
universo retirado, legado e omissão exportada. Provas/digests exatamente iguais
(m155-compatibility.log). Referência e runner ficam apenas no QA local.

SDK/Rules: 1/1 jornada nova positiva em 69.593,3969 ms (m155-sdk.log).
Campanha independente nativa foi emitida/enviada/revisada; CAS concorrente,
retomada em novo serviço, prova equivalente, clock alterado, restart explícito,
revogação, SDK negado e cancelamento/chave/recibo histórico foram conferidos.
Emulador demo/JAR verificado em porta efêmera, encerrado pelo próprio runner.

## Validação integral do bloco 227–232

npm run validate terminou com exit 0 (m155-validate.log). Total de 9.871 testes:
4.978 frontend em 370 arquivos, 94 scripts e 4.799 Functions. Zero falhas,
skips ou cancelamentos nos resumos Node; os 17 casos novos passaram também
nessa rodada integral. Frontend em 486,37 s, scripts em 20.732,9564 ms e
Functions em 534.837,6197 ms.

Cobertura frontend: 89,71% statements, 85,93% branches, 90,94% functions e
92,87% lines; limites preservados. Skills, arquitetura, documentação, styleguide,
formato e lint completos positivos. Sintaxe de 472 módulos Functions, typecheck,
build e smoke positivos. Build conserva avisos de chunks grandes e importações
dinâmicas também estáticas; frontend/dependências não mudaram neste incremento.

Depois de registrar esta evidência, formato e links da documentação foram
conferidos novamente. A validação integral pertence ao código do bloco 227–232;
não é aprovação de CI, SDK de produção, publicação ou interface de restauração.

## Arquivos, revisão e limites

Núcleo compartilhado de origens, coordenador/formatos/contratos de restauração,
getter privado project, composição, cancelamento e whitelist de operações;
testes Node/helper e SDK próximos. ADR, arquitetura, AGENTS e inventário
registram a nova regra e as etapas ainda necessárias.

ESLint dirigido aos 13 mjs positivo, incluindo teste SDK; caso adicional
formatado e lintado. Revisão manual de todos os diffs/módulos novos e scan de
segredos conferidos. Master e servidor manual preservados. Nenhum teste visual
ou jornada de interface nova foi executado: não há interface nova no incremento.

Remapeamento/materialização/mídia, integração C4 dos temporários antes da
ativação e Estúdio/ciclos continuam necessários. Macro 8/35 (22,9%) e
P3/D/F2-09 continuam abertos. Condições humanas/comerciais e política final
das perguntas conservam seus gates. Somente commit local; sem agentes,
CI/push/PR/merge/deploy.
