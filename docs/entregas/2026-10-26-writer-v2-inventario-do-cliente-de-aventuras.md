# Writer V2 — inventário limitado do cliente de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: 2760e45.
[Plano 160](../tasks/writer-v2/execucao/160-inventario-limitado-do-cliente-de-aventuras.md),
[ADR 0182](../decisions/0182-adventure-client-inventory.md).

## Entrega e fronteira

Registro de recursos puro extraído com aliases compatíveis; feature
adventure-portability acrescenta port injetado, percurso completo de metadata
limitado por página/profundidade e prova SHA incremental. Segunda passagem
reconfere tudo, inclusive presença/tokens e origem do universo, terminando com
revalidação da fonte. IDs usam ordem de bytes UTF-8; páginas e callbacks são
congelados antes de suspender.

Prova é explicitamente inventory-only. Não certifica bytes, Storage, texto
histórico completo ou autoria do pacote. Não monta/sela arquivo, transporta
RPC, abre interface ou restaura/ativa aventura. Metadados de imagem/perfil
seguem APIs próprias; não há cópia de biblioteca/lore externo ou grant.

## Validação dirigida real

Frontend final: 24/24 casos em 2,80 s (casos em 928 ms), incluindo recusa de
corpo obrigatório ausente. Seleção anterior de 22 passou em 2,74 s (880 ms);
caso posterior com importador passou isolado em 58 ms (um positivo, 22 não
selecionados; duração total 1,91 s).

Usam Studio/scenes/blocos/narrativa/lore/checklist/histórico/persona e os leitores
nativos no banco de fixture com createTime/updateTime. Conferem 53 cenas e página
50+3, ordinais físicos de chunks, filhos, origem neutra; mudanças de corpo,
persona e universo com rootclock/contagem iguais; recriação da raiz; conta/abort/
falha durante suspensão, port/options/page mutáveis; ausência singleton, IDs
duplicados entre páginas, UTF-8 astral e source final. Prova/visitas sem prosa.

Seleção Node dos codecs/leitores de recursos/narrativa/progresso:

```text
ℹ tests 115
ℹ pass 115
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 646.0974
```

Lint dirigido e typecheck finais: código 0. Bundle isolado da interface pública
para navegador, com Vite e sem config do app: dez módulos, 30,65 kB (gzip 10,10),
62 ms, código 0. Saída em QA fora do Git, sem limpar diretório existente. Esse
bundle verifica imports de plataforma; não é nova prova de interface/Chromium.

Primeira seleção frontend parou na fixture: entidade e operationId de criação
de lore divergiam (17 falhas antes das assertions). Fixture corrigida conforme
regra nativa, sem relaxar serviço; 17 depois passaram antes dos casos extras.
A regressão Node inicial encontrou 45 falhas/70 positivos por import local de
KINDS omitido na extração, também identificado pelo lint. Binding restaurado;
115/115 finais. Remoção de cast redundante revelou inferência circular do
cursor (TS7022); anotação explícita string|null resolveu tipos/lint, sem mudar
JavaScript ou baixar limites. Tentativas e logs preservados fora do Git.

Logs m72-frontend*.log, m72-imported.log, m72-node*.log,
m72-types*.log e m72-browser-bundle*.log em writer-v2-portability-qa.
Não houve SDK novo: não mudam handlers/autorizações/Rules do servidor; aliases
foram exercitados nas regressões nativas. O validate integral de 158 não é
atribuído a esse código posterior; novo fechamento ocorre no fim do grande bloco.

## Revisão e continuidade

Diff confere extração literal, exports/binding local, imports puros, DTOs e
source do começo/fim, cópias antes de await e checksum de todo percurso. Captura
de corpo/hash/imagem ainda precisa ser composta antes de qualquer footer autoral.
Novas views exigem registro/fixture/manifesto e não podem ser omitidas em silêncio.

Checks de docs/arquitetura/formatação/diff são conferidos antes do commit.
Sem dependências, credenciais, armazenamento local novo, endpoints, Rules ou
runtime alterados. P2/P3/D, F2-09 e demais gates abertos; contagem 8/35 preservada.
Somente commit local, sem CI/push/PR/merge/deploy/subagentes.
