# Writer V2 — backup completo no editor

## Resultado local parcial

Diálogo de exportação oferece Backup privado com histórico (.writer), sempre
livro inteiro. Usa captura completa e histórico existentes, arquivo por fluxo,
seleção explícita do destino e fechamento só após selo/provas. Texto salvo e
rascunho legado aberto ficam separados; vazio/removido é preservado. Composição
por cenas usa textos salvos. JSON antigo continua disponível com rótulo correto
e seu aviso de ausência do histórico; demais formatos continuam funcionando.

Cancelamento do seletor é neutro. Sem API compatível, só a nova gravação é
desabilitada e a disponibilidade é explicada. Conta/contexto/unmount abortam
tentativa; falhas de write/close/abort não anunciam sucesso. Hosts remontam por
autor/livro. Não há cópia plaintext oculta nem Blob integral de fallback.

[Plano 143](../tasks/writer-v2/execucao/143-backup-completo-no-dialogo-de-exportacao.md)
e [ADR 0166](../decisions/0166-book-archive-export-dialog.md).

## Testes dirigidos

22 Vitest distintos positivos em seleções: oito do serviço, onze ExportButton e
três EditorOptionsMenu. Primeira rodada: 21/22, 6.26 s. Expectativa de cancelamento
tratava o aviso de privacidade como erro; corrigida para verificar ausência de
Falha na exportação. Caso repetido 1/1, 2.14 s (dez não selecionados).
Após tipar mocks/contratos para lint, oito serviços repetidos 8/8, 6.07 s.
Não houve rodada global única de 22 após a correção.

Serviço: ordem produtor/seletor, destino único/nome sanitizado, rascunho vazio,
cenas salvas, cancelamento, plataforma indisponível, conta/capítulo errados,
troca de conta enquanto escolhe, abort após writable, fechamento e erro de cleanup.
UI: formato/scope, mensagem de sucesso só ao concluir, seleção cancelada,
disponibilidade, outros formatos, troca de livro suprime resposta tardia.
Regressões da exportação existente e do menu preservadas.

## Chromium — exportação real

Seis verificações positivas, arquivo 20244 bytes e 87 RPC locais. React, produtor
completo e Functions reais com banco em memória. Identidade/callable simulados;
seletor QA devolve handle OPFS real, com createWritable/write/close/abort nativos.
Não é automação do seletor de arquivos externo do sistema operacional.

Cancelamento não chama captura nem abre writable. Produtor congela rascunho vazio
de capítulo removido antes de aguardar seletor; mudar título durante essa espera
não altera metadata capturada. Arquivo foi inspecionado semanticamente, com
histórico igual à preparação real. Falha injetada no meio aborta temporário e
preserva bytes do arquivo anterior. Troca de conta na seleção impede abrir
writable e fazer novos RPCs.

Três temas, larguras 360/1280, seis capturas, sem overflow horizontal. Escape/
retorno ao botão e Tab na armadilha conferidos. Capturas claro 360, escuro 1280
e sépia 360 revisadas visualmente; restantes capturadas. Artefatos m55-export-ui,
m55-exported.writer e perfis ficam fora do Git e contêm somente fixture própria.

Roteiro inicialmente precisava dos exports completos da identidade simulada.
Primeira tentativa de ajustar o script falhou no quoting e não o alterou;
escrita UTF-8 segura corrigiu. Depois foi necessário aguardar foco no botão,
em vez de aceitar body com mesmo texto, e comparar versões com a fixture real
(uma, não a suposição de duas). Execuções com falha não foram contadas como sucesso.

## Chromium — restauração do arquivo exportado

O mesmo arquivo produzido pelo editor entrou no diálogo real do Estúdio.
Sete verificações positivas: revisão, respostas perdidas de start/append/
ativação, três reinícios, confirmação explícita, revogação da chave, mídia/limpeza
e raiz ativa preservada. 20244 bytes, 413 pedidos de chave e 1363 RPC locais.
OPFS/IndexedDB/Web Locks/WebCrypto/HTTP reais, banco em memória; identidade/
callable/abertura final simulados. Não mede custo ou latência de produção.

Seis capturas e verificações de tema/largura/foco/overflow/contraste do roteiro
anterior; novas capturas dessa restauração não revisadas individualmente.
Artefatos m55-roundtrip-restore-ui; não houve leitura de manuscrito real.

## Checks e limites

Typecheck, arquitetura e styleguide passaram. Lint inicialmente revelou tipos
any de rejeição/mocks, métodos sem this void e async sem await em fixtures;
corrigidos e arquivos afetados passaram. Formato, lint de todos os arquivos,
links de docs e diff passaram; revisão final sem bloqueador no escopo. Checkout
master preservado limpo e dev server respondeu HTTP 200.

Não foi executado validate/build global neste incremento. P1/F2-09/V2 continuam
abertos: inventários gerais, exclusão/coleta, fontes antigas v1 sem marca,
certificação/migração, drain/rollout e validação integral seguem pendentes.
Seletor externo físico, zoom/leitor de tela e gates humanos/comerciais não foram
declarados concluídos. Sem CI, push, PR, merge, deploy, dependências ou subagentes.
