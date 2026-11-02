# P2 — restauração de aventuras no Estúdio

Base: fe83aa9. Sem subagentes, CI, push ou deploy.

## Objetivo e proposta

Integrar os serviços próprios de restauração de aventura ao Estúdio: selecionar
backup nativo, conferir conteúdo/identidade, preparar por unidades, revisar
a cópia, ativar explicitamente e concluir/cancelar com retomada. Reutilizar
componentes shared/ui e padrões visuais existentes; nenhuma dependência nova.

## Requisitos

- Inspeção local independente de nome/MIME e sem fallback para livro/JSON. Blob
  nativo imutável, leitura limitada, guard/signal e SHA completo. Revisão local
  metadata com contagens/avisos/políticas aprovadas; hash próprio da revisão.
  Nenhum arquivo, nome ou prosa na persistência de retomada.
- Hook contextual combina StartSession/UploadDriver/PreparationJournal/Driver/
  EffectSession. Ler metadata antes de obter chave privada; journal antigo
  preserva keyId. Primeiro grant descobre keyId sem chave fictícia. Não pedir
  chave para finalizar/cancelar operações terminais.
- Abrir diálogo ou atualizar lista não muta projeto. Início só após confirmação
  da revisão local; ativação só após confirmação separada da revisão final.
- Pausa conclui a unidade em andamento. Fechar/desmontar/trocar conta suprime
  resultados tardios e próximas unidades; abortar inspeção local no fechamento.
- Falha de persistência antes do início: repetir a revisão/ID originais somente
  após bootstrap ausente e not-found remoto; indisponibilidade não cria operação.
- Início/resposta incerta conserva ID e mostra Retomar/Verificar. Pendências de
  efeitos são retomadas antes de novos comandos; não oferecer nova ativação
  após erro incerto. Origem revisada pode ser reapresentada após retirada.
- Após recarga, upload requer mesmo arquivo verificado. Comparar fonte e hash da
  revisão sem substituir job. Projeto ativado continua disponível à finalização;
  acesso para abrir é consultado novamente no servidor.
- Remoção local é explícita e terminal: revalidar job/identidade, ler envelope
  fechado e remover por CAS sem decifrar nem obter chave encerrada. Corrupção,
  conta inválida ou conflito preservam bytes. Não remover efeitos não confirmados.
- Preparations lista remoto, inícios e efeitos locais, com conta/geração, fontes
  independentes e erro parcial, vazio, loading, retry e paginação por grupo.
- Dialog usa Input/Button/Alert/Badge/LoadingState/Dialog; sem cor literal.
  Confirmação de cancelamento e de remoção local têm texto e ações separados.
  Layout respeita 320 px, temas e teclado/foco/retorno, sem overflow horizontal.

## Arquivos e sequência

1. Modelo/serviço de inspeção local e metadata de recuperação do journal.
2. useAdventureRestore; AdventureRestoreDialog/Preparations e CSS modular.
3. Exports públicos e StudioPage com abertura autorizada de aventura.
4. Testes de inspeção/recuperação/UI/lista/Estúdio e regressões afetadas.
5. Chromium isolado com UI/serviços reais e armazenamento nativo, desktop/mobile/
   temas/teclado/retorno de foco; registrar limites reais de auth/Storage.
6. Checks dirigidos, revisão/docs/evidência e commit local. Suíte integral no
   fechamento deste bloco de interface/roundtrip ou subsequente se ainda faltarem
   entregas integradas; nunca atribuir validate anterior ao código novo.

## Suposições e riscos

Aventuras aceitam apenas o container nativo v1. Backend/rota HTTP existem no
checkout, mas não se presume deploy; falhas de disponibilidade são recuperáveis.
Web Locks/WebCrypto/IndexedDB já são requisitos. Leitura do envelope sem chave
é metadata, não grant: só journal pode decifrar após reautorização.
O servidor continua reautorizando origens/ativação; abrir projeto exige acesso
atual. Este incremento não modifica comércio, políticas ou outros backups.

## Aceites

- [x] Inspeção/identidade/revisão local próprias, sem conteúdo persistido.
- [x] Fluxo completo exige duas confirmações e retoma sem duplicar operações.
- [x] Pausa/fechamento/conta/pedidos incertos preservam contexto.
- [x] Lista paginada e recuperação local terminal funcionam sem grant fictício.
- [x] UI/Estúdio autorizam abertura atual e funcionam com teclado/mobile/temas.
- [x] Checks/testes, revisão, documentação/evidência e commit local.

P3/D/F2-09, demais fases e gates humanos/comerciais continuam abertos.
Não usar o avanço desta tarefa para declarar V2 integralmente concluído.

## Resultado

103 casos dirigidos em oito arquivos e 12 verificações Chromium positivos,
incluindo exportador/serviços reais com PNG por dois usos, pausa, recarga,
quota inicial e descarte terminal. Tipos/lint/arquitetura/styleguide/build/
smoke positivos. A
[evidência](../../../entregas/2026-10-28-writer-v2-restauracao-de-aventuras-no-estudio.md)
registra falhas iniciais do harness e limites de credenciais/infraestrutura.
Geração pela interface/corpus amplo e P2/P3/D/F2-09 continuam pendentes.
Validate integral no próximo bloco integrado; somente commit local.
