# Writer V2 — roundtrip normal dos livros

## Resultado parcial

Backup normal da cópia ativa percorre captura → inspeção → upload/preparação →
revisão/ativação → mídia/limpeza → recaptura, sem leitores internos como
substitutos do produto. Casos atuais e JSON v1–v6 preservam dados próprios;
extremos v1/v6 são restaurados novamente a partir do backup atual.

Corrigida listagem de narrativa: controle derivado entity-scenes não é conteúdo
portátil. Página metadata de até limit+2 conserva cursor e todos os controles
autorais; ID desconhecido continua falhando no leitor, sem ocultação genérica.

Ausência de perfil/overrides antigos recebe metadata explícita personaAvailability
no dono. Complemento/valores permanecem, sem inventar perfil ou adotar biblioteca
por coincidência de ID. Novo normalizador v2, replay v1 literal, remap, projeções,
leitores e semântica atual integrados. JSON antigo omite só o campo novo da
fonte clonada; normalizador deriva o aviso por seu catálogo real.

[ADR 0163](../decisions/0163-portable-persona-absence-and-native-roundtrip.md),
[plano 140](../tasks/writer-v2/execucao/140-roundtrip-dos-livros-com-consumidores-normais.md).

## Vitest dirigido — 16 casos distintos positivos em seleções

14 roundtrips/consumidores novos e dois de captura JSON (um novo/uma regressão).
Não houve rodada global única de 16.

- Arquivo atual completo: atos/capítulos, cenas ativas/arquivadas/sem pai,
  fontes, referências, narrativa/data livre, lore, progresso, personas, histórico
  de recursos removidos, capa PNG e prosa literal. Comparação usa remap e datas
  nativas previstas no plano 55; datas de histórico/perfis/capa não são ignoradas.
- JSON v1–v6: cópias privadas, avisos de ausência, sem histórico/progresso/capa
  fabricados, prosa global/labels/tokens não copiados; arquivo atual gerado
  validado. Extremos v1/v6 passam por segunda restauração e comparação completa.
- Ausência de persona do livro e overrides antigos da fonte preservam IDs neutros,
  valores e warnings por dois ciclos. Cena/capítulo editáveis por APIs normais;
  ledger/contagem e versão manual reaparecem em nova cópia.
- Lore indexado: detalhes acima de 8 MiB, aliases duplicados/vazios, 65 relações,
  BOM/Unicode/escapes literais e datas 12/17 preservados. Campo não volta como
  stub e cópia mantém payloadStorage schemaVersion 2. Flag global não alterada.
- Quatro casos de rascunho: diferente, vazio, recurso removido e texto já salvo.
  Manuscrito não é sobrescrito/recriado; versão separada conserva texto, metadata,
  datas, perfil e estilo; recaptura não produz cópia extra do rascunho.
- JSON legado: retirar a marca nova não modifica objeto original ou complemento.

Resultados finais: sete casos atual/JSON, 7/7, 15.61 s (sete não selecionados);
ausências + escritores normais, 2/2, 11.72 s (oito não selecionados);
lore grande, 1/1, 36.59 s (nove não selecionados);
rascunhos, 4/4, 14.68 s (dez não selecionados);
captura JSON, 2/2, 1.16 s (17 não selecionados).

O índice local e journals são ports em memória nesses testes; criptografia/
armazenamento nativos são provas separadas do browser, não inferidos desses maps.

## Node dirigido — 109 casos distintos positivos

14 de recursos, 43 de disponibilidade/máquina/normalizador/personas e 52
regressões de conteúdo/JSON/remap/validação servidor. Sem rodada única de 109.

Recursos: 14/14, 180.6666 ms. Inclui páginas limit 1/50 com 64 controles autorais,
controle derivado omitido, nenhuma exclusão/mutação e desconhecido recusado.
Grupo de disponibilidade: primeira execução 42/43, 759.323 ms; teste antigo
tratava schemaVersion 2 como futuro. Agora v2 é explícito; versão inválida virou 3. Caso afetado repetido 1/1, 88.456 ms. Demais 42 permaneceram positivos.
Regressões: 52/52, 1851.8017 ms, zero skipped.

Mantidos: entrada fechada, marcador sem autoridade, ausência/coincidência de ID,
troca explícita de vínculo, invariantes, checkpoints/limites, perfil disponível,
provas de origem, v1/v2, contagem e recusa sem marcador.

## Firestore SDK/Rules

2/2 casos novos, zero skipped, 13587.4378 ms, emulador verificado 1.22.0 em
loopback/projetos demo isolados. Admin/serviços/Rules reais, sem produção.

Metadata mask conserva marca no livro/capítulo/fonte e não adota perfil de mesmo
ID. Dono lê/edita título, outro não lê; marca sobrevive e novo perfil escolhido
recebe autorização normal. Cursor nativo entrega todos os 64 controles, com
páginas 2/50 e derived control preservado fisicamente. Runner externo
m52-roundtrip-sdk; não se trata de roundtrip completo com SDK.

## Chromium nativo com JSON v6

Sete verificações positivas: aviso inicial de persona ausente, escolha/revisão,
respostas perdidas de start/append/ativação, três reinícios, confirmação explícita,
chave revogada, mídia/limpeza e raiz ativa preservada. Perfil isolado, React e
OPFS/IndexedDB/Web Locks/WebCrypto reais; serviços Functions e HTTP de chave reais
com banco em memória. Identidade/SDK callable/callback de abertura simulados.

4390 bytes, 303 pedidos de chave e 1021 RPC locais; não medem custo/latência
de produção. Seis capturas em temas claro/escuro/sépia e larguras 360/1280;
foco/Escape, overflow e contraste principal >=4.5:1 conferidos. Capturas
selecionadas revisadas visualmente. Artefatos externos m52-legacy-ui e
m52-legacy-restore-ui (JSON/PNG/perfil), sem manuscrito ou credencial real no Git.

## Falhas encontradas e correções

A primeira tentativa não resolveu sharp a partir da raiz; createRequire do pacote
functions existente resolveu, sem dependência nova. Recaptura revelou derived
control; depois o port de índice de teste precisava dispose. Expectativas de
datas fixas foram corrigidas para clocks nativos documentados, sem ignorar datas
particulares. V5/v6 revelaram persona ausente; marcador, semântica, remap e
metadata masks corrigidos. Lore grande passou os dados literais, mas o teste
consultava version em vez de schemaVersion do stub; corrigido e repetido.

Essas execuções com falha não foram contadas como aprovação. Arquivos de origem
e pendências não foram descartados para forçar sucesso.

## Checks e limites

Lint dirigido, syntax de 297 módulos Functions, typecheck, formato dos arquivos,
arquitetura, docs e diff passaram. Lint encontrou prefer-const num teste; corrigido
e arquivo repetido com sucesso. Declarações .d.mts não têm configuração ESLint;
foram conferidas por tipos/formato. Sem validate global ainda. Revisão do diff
não encontrou bloqueador no escopo; compatibilidades restantes seguem abaixo.
Servidor local respondeu HTTP 200; checkout master permaneceu limpo em 522ccaa.

Roundtrip cobre os cenários descritos, não inventário global de escritores,
exclusão/coleta, fontes/roots antigos v1 sem marca, todo tipo de payload ou rollout.
Rascunho explícito com perfil atualmente indisponível ainda exige o perfil pelo
contrato do plano 41; inventário seguinte deve resolver essa compatibilidade.
Provas não certificam infraestrutura de produção. P1/F2-09/V2 continuam abertos,
assim como fases 3–5 e gates humanos/comerciais. Modo indexado padrão false.
Somente commits locais; sem CI, push, PR, merge, deploy, dependências ou subagentes.
