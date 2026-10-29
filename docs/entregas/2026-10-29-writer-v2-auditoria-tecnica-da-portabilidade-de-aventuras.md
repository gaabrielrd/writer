# Writer V2 — auditoria técnica da portabilidade de aventuras

- Data: 2026-10-29.
- Base: 8d7bb5a, branch codex/writer-v2.
- Escopo: [auditoria 200](../tasks/writer-v2/execucao/200-auditoria-tecnica-da-portabilidade-de-aventuras.md) dos nove passos do plano 147.

## Resultado

Foram cruzados os requisitos originais com código, testes e relatórios nativos.
A captura completa, oito seções, histórico, rascunho explícito, imagens/personas/
universo, formato próprio, revisão, nova cópia/remap, recuperação/cancelamento/
coleta, interface e ciclo/exclusão possuem implementação e evidência técnica local.

A auditoria não identificou uma nova lacuna técnica nos contratos v1 atuais.
Não adicionou código, dependência, teste, regra ou permissão. Não encerra a
decisão de perguntas do plano 199 nem os requisitos restantes de P3/D/F2-09.
O relatório distingue o que foi comprovado localmente de operação e aceite humano.

## Provas conferidas

- Âncora/source, inventário de todas as famílias e segunda passagem por
  identidade/presença, incluindo persona de cena e dependências externas.
- Histórico manual/before-restore, 53 versões por paginação, UTF-8 literal,
  recurso histórico removido sem recriação e rascunho separado do salvo.
- Vetores binários independentes de livro/aventura; erro de domínio, versão
  futura, corrupção, truncamento e arquivo concatenado antes de uso.
- Inspeção inerte/metadata e validação do servidor, nova identidade privada,
  guards de conta, revisão, recuperação cifrada/CAS e recibos exatos.
- Ativação/rollback/fence, mídia por geração, coleta da fonte/chave e preservação
  de biblioteca/personas/jobs/recibos; universo original reautorizado sem duplicar.
- UI de backup/restauração e consumidores; exclusão completa ligada ao ciclo
  restaurado, com irmã/campanha/notas e cópias independentes preservadas.

Relatórios m109-ui-result.json e m110-ui-result.json foram lidos: nove checks
cada, com sobreposição explícita, arquivo de 316.497 bytes, serviços reais sobre
doubles e APIs nativas OPFS/IndexedDB/Web Locks/WebCrypto. Há chooser/Auth/AppCheck/
SDK sintéticos. Não somar como 18 jornadas únicas ou como prova de seletor do SO.

O relatório m121-browser-results.json conserva 36 esperados e zero skipped,
unexpected ou flaky. Essas jornadas cobrem diálogo/rotas/recarga da exclusão com
auth/RPC fictícios; não substituem o pipeline nativo de restauração.
O diff 38c6673..8d7bb5a foi conferido: no escopo src/functions/e2e só três arquivos
de teste mudaram. As provas anteriores não foram apresentadas como nova execução.

## Limites medidos

Um probe de metadata chamou importSource e sourceDescriptor reais com os tamanhos
históricos de F1: 21.126.626 bytes (323 chunks) e 1.459.149 bytes (23 chunks).
Os dois foram aceitos sem teto global incompatível; acima de 0xffffffff chunks
foi recusado. O maior texto de página medido em F1 é 7.127 bytes, diante de
800.000 por seção de importação, sem dispensar o orçamento HTML/JSON.

O probe não leu/importou/restaurou os PDFs ou mediu sua performance/layout.
PNG de até 16 MiB é um limite de mídia, não limite global de PDF ou .writer.
Payload de registro P2, frame e tamanho total de arquivo são medidas distintas;
não foi prometido suporte ilimitado nem uma restauração real do corpus por
aceitar somente seu comprimento numérico.

## Testes e validação

Nenhuma suíte foi repetida por este incremento documental. Código, testes e
dependências permanecem na base já validada:
4.890 frontend, 94 scripts e 3.989 Functions, com tipos/build/smoke e cobertura
89,67/85,86/90,88/92,84. Ver o
[fechamento integral real](2026-10-29-writer-v2-validacao-integral-das-aventuras.md).

Probe de limites encerrou com código 0; resultado em m123-size-probe.log no
diretório local writer-v2-portability-qa. Não é um roundtrip ou uma nova suíte.
O primeiro check documental encontrou nome incorreto do módulo de coleta;
o link foi corrigido para adventureRestoreArchive.mjs e o check passou.

## Documentação e próximos passos

Plano 200 registra requisito, fonte, prova e alcance dos nove passos, conteúdo,
limites e pendências. Inventário/matriz, progresso, README e índices/contrato F2-09
foram consolidados para retirar estados antigos apresentados como atuais.
Sem criar regra global ou mudar AGENTS.

Plano 199 continua aguardando a política final de perguntas do chat. A aprovação
não foi inferida. P3 pode começar pelo contrato técnico de campanha: o arquivo
exclui conversas, e procedência/edição congelada/acesso atual têm obrigações
próprias. D e os aceites humanos/comerciais/operação permanecem abertos.
Macro 8/35 inalterada. Somente commit local, sem CI/push/PR/merge/deploy.

## Checks finais do incremento

check-docs, Prettier dos onze arquivos e git diff --check passaram.
Produção, testes, e2e e dependências foram conferidos sem diff em relação à base
8d7bb5a. Revisão manteve requisitos originais, limites e a pendência de perguntas;
não aprovou produto/operação por inferência. Evidência integral anterior não foi
rotulada como nova execução. Nenhum segredo ou artefato grande integra o escopo.
