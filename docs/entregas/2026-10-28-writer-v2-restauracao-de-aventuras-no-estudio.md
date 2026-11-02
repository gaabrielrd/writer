# Writer V2 — restauração de aventuras no Estúdio

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: fe83aa9.
- Plano: [196](../tasks/writer-v2/execucao/196-restauracao-de-aventuras-no-estudio.md).
- Decisão: [ADR 0218](../decisions/0218-adventure-restore-studio-flow.md).

## Resultado

O Estúdio oferece Restaurar backup de aventura e uma lista de retomadas
independente das obras atualmente listadas. O diálogo confere o arquivo local,
mostra contagens/avisos e prepara uma nova cópia privada. A criação só ocorre
após uma segunda confirmação da revisão final. É possível pausar, fechar,
retomar, verificar pedidos e concluir mídia/coleta ou cancelar.

Abrir aventura consulta o acesso atual no servidor. Histórico de restauração
não abre uma raiz ausente/estrangeira nem recria projeto excluído.
Cancelamento e remoção de recuperação local têm confirmações separadas.
Descarte local revalida estado terminal e usa CAS do envelope inteiro sem
decifrar ou recuperar chave já encerrada.

A inspeção aceita apenas backup nativo de aventura, independentemente do nome/
MIME; usa Blob nativo, hash completo e revisão metadata congelada. Nenhum nome,
arquivo/prosa/chave entra na retomada persistida. Após recarga, upload incompleto
pede o mesmo arquivo; preparação já enviada pode continuar sem ele.

A revisão encontrou um caso de falha inicial de persistência. Retomar agora
repete a mesma revisão/ID somente após bootstrap ausente e not-found remoto;
offline/indisponibilidade não causam nova operação. O caso foi reproduzido no
IndexedDB real e em teste de UI.

## Arquivos

Seis arquivos de implementação novos: inspeção, recuperação local, hook,
Dialog, Preparations e CSS. Barrel, DB do journal e StudioPage ajustados.
Quatro testes novos e o teste do Estúdio atualizado: 14 arquivos de código/
testes, sem dependência, backend, Rules, índice ou variável nova.

## Testes dirigidos finais

**103/103 em oito arquivos**, **12,56 s** entre início do runner e último
arquivo no relatório JSON; sem falhas/pending. São **44 novos e 59 regressões**.

| Arquivo                             | Casos | Comportamento                                                                                    |
| ----------------------------------- | ----: | ------------------------------------------------------------------------------------------------ |
| AdventureRestoreDialog              |    14 | Duas confirmações, pausa/fechamento/conta, perdas, arquivo errado, retry original e acesso atual |
| AdventureRestorePreparations        |     6 | Fontes independentes, erro parcial, vazio/loading/retry, paginação/conta e IDs não expostos      |
| inspectAdventureRestoreFile         |     8 | Container real, SHA, revisão sem prosa, Blob sobrescrito, formatos errados, guard/abort/limpeza  |
| adventureRestoreLocalRecovery       |    11 | Contexto inicial/antigo, terminal, corrupção/CAS/conta e ausência de chave no descarte           |
| StudioPage                          |    28 | 23 regressões e cinco casos da ação/retomada/abertura autorizada de aventura                     |
| inspectAdventureBackupContent       |     7 | Regressão do validador e exports públicos                                                        |
| adventureRestorePreparationJournal  |    13 | Regressão do journal cifrado                                                                     |
| adventureRestorePreparationPipeline |    16 | Regressão das fases/recibos próprios                                                             |

Seleções anteriores passaram: 65 casos de interface/Estúdio, 36 regressões e
retake de 14 casos do diálogo após corrigir retry. Não somar essas rodadas aos
103 casos distintos da seleção final. Lint apontou coerção redundante e retorno
any em mock; corrigidos antes dos checks finais, sem reduzir testes/cobertura.

## Chromium com UI real

**12/12 verificações**, **9185 ms**, Chromium **153.0.8010.12**.
Exportador real gerou um arquivo nativo de **9859 bytes**, com cena, bloco e PNG.
A mesma imagem original tem dois usos; a restauração criou **duas imagens
ativas**, conforme o contrato por recurso, sem deduplicar pelo imageId original.

O cenário confirmou:

1. Captura pelo exportador real.
2. Inspeção local antes de qualquer início remoto.
3. Claro/Escuro/Sépia em 1280/320 px, sem overflow horizontal e com footer visível.
4. Tab contido no diálogo, Escape e retorno de foco ao gatilho.
5. Quota inicial injetada impede start; Retomar usa o mesmo ID após not-found.
6. Pausa confirma a unidade corrente e não inicia a próxima.
7. Fechar/recarregar durante validação conserva journal cifrado; repetição
   usa o pedido exato antes de avançar outras unidades.
8. Revisão final mostra contagens reais, sem ativação automática.
9. Confirmação ativa uma única cópia; Abrir consulta serviço atual do servidor.
10. Finalização/coleta encerram chave e preservam job congelado, com imagens ativas.
11. Cancelamento conclui com dívida cifrada local, sem buscar a chave encerrada.
12. Remoção explícita terminal elimina o envelope exato por CAS, sem alterar
    a cópia ativa anterior ou acessar chave.

IndexedDB, Web Locks e WebCrypto são nativos. UI, hook, HTTP privado da chave,
exportador e serviços backend são reais. Auth/App Check e SDK Functions são
adaptadores sintéticos de teste; banco com timestamps nativos e bucket Storage
são simulados. Não prova credenciais reais, Firestore/Storage remoto, deploy,
disco cheio, dispositivo físico, leitor de tela ou zoom físico de 200%.

O harness precisou de imports CJS compatíveis, preâmbulo e transformação pelo
Vite para compartilhar a instância React. Também corrigiu a espera assíncrona
do foco e as asserções de origem v2/imagens por uso. As primeiras tentativas
não foram contadas como passes. Não foi alterado produto para contornar essas
falhas do teste. Arquivo temporário de entrada removido no finally; browser,
contexto e HTTP encerrados. O navegador/dados do usuário não foram usados.

## Visual, checks e revisão

Oito capturas: revisão local nos três temas e duas larguras, mais revisão
final em desktop/320 px. Conferidas visualmente as capturas móvel claro,
desktop escuro, móvel sépia e final móvel. O ensaio aguarda as transições
existentes antes das imagens. Cores computadas do diálogo após estabilizar:
claro rgb(44,37,32) sobre rgb(249,248,246), escuro rgb(243,241,236) sobre
rgb(34,30,28), sépia rgb(58,40,29) sobre rgb(249,246,241).

ESLint da feature e Estúdio, arquitetura, styleguide e build passaram.
Build final: tipos, **3096 módulos em 2,32 s**, smoke verde. Há avisos de chunks
grandes/imports dinâmicos sem separação, sem erro. O fluxo de restauração agora
possui consumidor real de interface.
Os 14 hashes foram conferidos após os checks finais.

Revisão conferiu fronteiras públicas, ausência de persistência de arquivo/
prosa, contexto da chave original, reautorização, CAS/terminal, retry sem
substituir identidade, pausa/geração/conta e abertura atual. Documentação/
formato/diff recebem conferência antes do commit com hooks.

## Pendências

Validate integral de 196 não executado: fica para o fechamento do próximo
bloco integrado com geração do arquivo pela UI/corpus de roundtrip. O validate
189–194 é base anterior, não prova de 195/196. Cobertura/limites preservados.

Geração de backup pela interface, corpus amplo de roundtrip e demais P2/P3/D/
F2-09 permanecem abertos. Macro 8/35 e gates humanos/comerciais não mudam.
O backend precisa estar disponível no ambiente de teste para uso com conta
real; configurar proxy/rewrite não equivale a implantação. Sem subagentes,
CI, push/PR, merge ou deploy.

## Auditoria final

22 arquivos no escopo, sendo 14 de código/testes. Hashes dos 14 conferidos
após os checks finais. Nenhum marcador de segredo identificado, arquivo .env,
artefato maior que 5 MiB ou CR nos arquivos da entrega. Entrada temporária do
harness removida; nenhum browser/HTTP/teste ficou ativo. Documentação/diff
passaram. Checkout E preservado limpo em 522ccaa; /studio respondeu HTTP 200.
Commit local com hooks normais; sem operação remota.
