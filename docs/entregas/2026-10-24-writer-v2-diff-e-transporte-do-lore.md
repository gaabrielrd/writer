# Writer V2 — Diff literal e transporte dos campos de lore

- **Data**: 2026-10-24.
- **Branch**: codex/writer-v2, somente commit local.
- **Plano**: [99 / M38c5a](../tasks/writer-v2/execucao/99-diff-e-transporte-dos-campos-de-lore.md).
- **Decisão**: [ADR 0114](../decisions/0114-literal-book-lore-client-edits.md).

## Objetivo e funcionalidades

Preparar o editor completo para alterar somente os campos e páginas tocados,
com CAS da leitura integral. Capture no leitor C1 conserva readToken e
dados brutos reconfirmados, imutáveis e em memória; get/list conservam seu
formato e resultados mutáveis anteriores.

O planejador recebe substituição/remoção explícita por campo. Ausente,
vazio e false são diferentes. Conserva BOM/Unicode/CRLF, espaços, duplicatas,
ordem e datas; não aplica defaults ou trim. No-op não produz upload.
Recusa campos/valores desconhecidos, getters, toJSON, arrays esparsos e
remoção de nome/categoria.

Relações são comparadas em páginas de 64. Somente páginas novas/alteradas
viram uploads; contagem/presença orientam cópia/retirada servidor. A mudança
de forma da última página também exige upload quando necessário.

O codec navegador congela valores antes de await e produz JSON/UTF-8 em
partes de até 64 KiB, sem serializar/codificar o campo inteiro. Duas passagens
lineares calculam SHA/Merkle/manifesto e produzem as partes/provas. IDs e hashes
seguem exatamente o servidor. Retomada percorre o prefixo uma vez; cancelamento
e guard conferem cada unidade, com event loop disponível durante preparo/salto.
Sem teto novo de 8 MiB ou 128 partes e sem dependência Node no codec.

## Critérios

- [x] Captura C1 integral/reconfirmada, CAS e snapshot privado imutável.
- [x] Get/list compatíveis; nenhum cache persistente novo.
- [x] Diff por presença/valor literal e remoção explícita, sem datas/defaults.
- [x] Relações por página, incluindo contagem, ordem e última página.
- [x] Codec limitado, hashes/IDs/provas iguais aos do servidor.
- [x] Valores congelados antes de await, abort/guard e retomada linear.
- [x] Roundtrip com serviços reais e corpo grande intocado preservado.
- [x] Checks dirigidos, Chromium, revisão e documentação.
- [ ] Host visual, orquestração de RPCs e recuperação protegida.
- [ ] Demais integrações e validate integral de P1/F2-09/V2.

## Arquivos e fronteira

bookLoreWritePlan e bookLoreWritePayload na feature lore; capture no leitor
C1, exportações puras e testes do planejador, codec, leitura e roundtrip.
Plano, ADR, AGENTS, README, arquitetura, testing e registro de execução
atualizados. Backend, Rules, endpoints, UI e escritor SDK legado não mudaram.

## Testes e validações executados

**175 casos Vitest distintos positivos**, em rodadas dirigidas:

- Rodada inicial de quatro arquivos: 133 casos, 125 positivos e oito falhas.
  As falhas vinham da fixture passar base64 à função de verificação que
  recebe Uint8Array; manifestos/partes já coincidiam. A chamada foi corrigida.
- **17/17**, 6.13 s: codec completo corrigido e quatro roundtrips novos com
  C1, produtores, selo, reserva, composição e adoção reais sobre banco de teste.
  Inline/v1/v2 preservam campos intocados. O v1 conserva a base de 9 MiB e
  envia somente resumo e página 2 de relações. CAS antigo e origem revogada
  não autorizam upload; replay confirma sem nova adoção.
- **5/5 dirigidos**, 2.18 s: três capturas novas e dois casos de retomada já
  contados. Inclui token da reconfirmação, conta revogada e ausência de
  defaults. Os 62 casos excluídos pelo filtro não são novas aprovações.
- **1/1 dirigido**, 641 ms: conteúdo com muitos escapes e surrogate pairs
  nunca passa strings maiores que 4096 unidades ao escape nem texto maior
  que 64 KiB ao encoder; partes continuam limitadas.
- **34/34**, 5.94 s: serviço C1, vínculo de conta e leitura real da preparação
  restaurada/remapeada. Não confundir esse harness com ativação de restauração.

A soma considera casos distintos: repetições verdes do codec e retomada não
são somadas novamente. Os testes cobrem presenças/literais, no-op, páginas
0/1/64/65/130, inserção/remoção/ordem, snapshot, domínio, corpo acima de 8 MiB
e todas as provas comparadas ao codec real do servidor.

**Cinco verificações Chromium headless positivas**, com o módulo servido
pelo Vite local: texto Unicode/escapes, aliases duplicados/vazios, página de
relações e 9 MiB em 145 partes. Cada manifesto/parte/prova foi comparado ao
servidor. Um quinto cenário confirma cancelamento real pelo event loop.
São smokes do codec, sem interface visual de edição ou autenticação real.

Tipos positivos após corrigir o narrowing do helper de erro. Lint dirigido
positivo após remover seis casts desnecessários e async sem await em dois
callbacks. Erro de codificação na gravação do teste de captura foi corrigido
restaurando integralmente o original antes de adicionar os três casos.
Arquitetura, npm run build (inclui tipos e smoke do bundle), docs, formato
e diff positivos. Build mantém avisos de chunks grandes e imports dinâmicos
ineficazes; não foram alterados limites para ocultá-los. Logs fora do Git.

## Revisão, limitações e próximo passo

Revisão verificou clone sem execução de accessors/toJSON, plano sem valores
intocados, forma das páginas, domínios/hash/endianness/Merkle do servidor,
alocações limitadas, imutabilidade antes de await e guard após cada unidade.
O codec não retém um segundo JSON/UTF-8 completo; mantém valor congelado e
metadados da árvore. O leitor C1 ainda monta a ficha completa em memória.

Não habilita o formulário antigo para payloads. O futuro host precisa marcar
campos tocados explicitamente, usar captura bruta, coordenar uploads/CAS/
recibos e fechar política de recuperação. Não se inferiu autorização ou
persistência protegida só por existir readToken/manifesto.

Não repetimos SDK/Rules porque backend e regras não mudaram; os testes de
integração usam serviços reais com double transacional, sem certificar novas
combinações nativas. Validate/cobertura integrais no fechamento de P1,
conforme autorizado. Outros escritores/consumidores, backup, ativação/rollout,
fases 3–5 e aceites humanos/comerciais continuam pendentes.
Somente commit local, sem CI, push, PR, merge ou deploy.

## Como conferir

Executar os arquivos bookLoreWritePlan.test.ts, bookLoreWritePayload.test.mjs
e bookLoreWriteRoundtrip.test.mjs em src/features/lore/tests com Vitest.
Os smokes Chromium/logs ficam na pasta externa de QA da sessão.
Dev server permanece em http://127.0.0.1:5173/.
