# F2-05 — Histórico privado e restauração do texto

**Estado:** implementado, validado localmente e enviado em `cd5edb0`; CI pendente.
**Origem:** [W2-F2-05](../fase-02-criar-e-preparar/05-historico-e-restauracao.md).
**Base:** F2-04 e correção `16e71f6` validados localmente e enviados; CI acompanhada
em paralelo por autorização explícita do operador em 2026-10-15.

## Objetivo e decisões confirmadas

Autores e mestres podem guardar um ponto do texto, compará-lo com o estado atual
e restaurá-lo sem perder o texto substituído. O operador confirmou:

- Versões criadas manualmente e cópia automática imediatamente antes de restaurar.
- Retenção até exclusão explícita da versão ou projeto, sem expiração ou compactação automática.
- Nenhuma versão a cada autosave, conversa ou aplicação de IA.

Isso substitui a previsão inicial de capturar antes/depois de toda gravação no
[contrato de domínio](02-modelo-de-dominio.md). Crédito, publicação, planos privados,
ordenação, arquivo e composição continuam com seus próprios contratos.

## Escopo e suposições

- Texto salvo de capítulo legado de livro ou cena de livro/aventura; sem campanha,
  restauração de projeto inteiro ou versionamento de lore/metadados nesta tarefa.
- Captura exata do texto armazenado, sem reformatar HTML/Markdown. Comparação usa
  renderização sanitizada; texto atual e selecionado aparecem lado a lado ou
  empilhados no celular, sem depender de um novo motor de diff.
- Restauração exige o mesmo recurso existente e editável. Capítulo convertido
  não recebe texto por cima da composição de cenas; origem removida não é recriada
  implicitamente. Versões permanecem consultáveis no histórico do projeto e podem
  ser copiadas ou excluídas explicitamente.
- Criar/restaurar requer texto confirmado, sem autosave, recuperação, conflito ou
  aplicação de IA pendentes. Listar/comparar não apaga nem salva o preenchimento.
- Nenhuma quota comercial de versões. A interface informa o crescimento do
  armazenamento e oferece exclusão explícita; não promete armazenamento infinito.

## Persistência privada e corpos

Manifestos em `books/{id}/workVersions` ou `adventures/{id}/workVersions` guardam
identidade do recurso, versão do formato, data do servidor, motivo manual/anterior
à restauração, rótulo opcional, hash, tamanho e contagem do texto. Não guardar
chaves, contexto de IA, débitos, seleção ou URLs do navegador.

Corpos ficam separados em blocos privados identificados pela versão e ordem,
sem array crescente no projeto ou manifesto. Usar blocos de até 64 KiB UTF-8,
preservando Unicode e a reconstrução exata; validar o envelope de cada documento.
Essa janela é orçamento de transporte/armazenamento, não limite de manuscrito.
Não aplicar um novo teto de 800.000 bytes ao capítulo legado na captura ou na
restauração; cenas conservam seus limites já implementados. Gravação real e corpus
Unicode/HTML devem provar tamanho, hash e roundtrip, sem truncamento.

Listas retornam só metadados, padrão 25/máximo 50 + 1, ordenação data/ID descendentes
e cursor vinculado a UID/projeto/recurso/filtro. Corpo é carregado somente para a
versão selecionada, em janelas limitadas e canceláveis. A restauração no servidor
lê a versão inteira autorizada antes de escrever, dentro dos limites transacionais.
Não introduzir Storage ou dependências apenas para contornar um envelope.

## Contrato mínimo das APIs

Alvo: `{kind: book | adventure, id}`; recurso: `{kind: chapter | scene, id}`,
capítulo somente em livro. Manter a feature pública `manuscript-history` separada
de `shared` e reutilizável nos dois editores.

| API                    | Comportamento                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| `getWorkVersionSource` | Texto salvo atual, identidade e token opaco da fonte autorizada                |
| `createWorkVersion`    | operationId, fonte observada e rótulo opcional; captura o estado salvo exato   |
| `listWorkVersions`     | Metadados por projeto/recurso opcional, cursor e limite                        |
| `readWorkVersion`      | Manifesto e janela de corpo da versão selecionada                              |
| `restoreWorkVersion`   | operationId, versão e fonte observada; texto confirmado e ID da cópia anterior |
| `deleteWorkVersion`    | Exclusão explícita idempotente e limpeza retomável dos blocos                  |

DTOs compartilhados para implementação independente:

- `VersionSource`: target, resource, title, content, sourceToken, contentHash e
  revision (revisão real da cena; `null` em capítulo). Fonte indisponível/convertida
  retorna `null`; não inventar revisão numérica. O editor aceita texto/revisão
  devolvidos juntos, sem buscar uma nova base depois de restaurar.
- `VersionSummary`: id, target, resource, createdAt, reason (`manual` ou
  `before-restore`), label (string ou null), wordCount, byteLength, contentHash e chunkCount.
- `listWorkVersions`: `{items, nextCursor}`; recurso é filtro opcional.
- `readWorkVersion`: `{version, chunks: [{index, content}], nextCursor}`; entrada
  target, versionId e cursor opcional. Padrão quatro blocos, máximo oito por chamada.
- `createWorkVersion`: target, resource, operationId, expectedSourceToken e label
  opcional; retorna `{version}`.
- `restoreWorkVersion`: target, resource, versionId, operationId e
  expectedSourceToken; retorna `{source, previousVersion}`.
- `deleteWorkVersion`: target, versionId e operationId; retorna
  `{complete, processed}` e continua com o mesmo pedido até concluir.

Hash é SHA-256 hexadecimal do texto UTF-8. O cliente só publica o corpo completo
depois de verificar ordem, tamanho e hash e da autorização na última janela.
Excluir uma versão durante leitura invalida/limpa seu preview. Conflito mantém
a base observada até uma nova comparação/aceite explícitos, sem rebase automático.

O token da fonte precisa representar a versão real. Capítulo legado não tem revisão
numérica: não inventá-la no cliente. Preferir token opaco derivado do `updateTime`
preciso do snapshot e hash; cenas incluem revisão/metadados/corpo pertinentes.
Comparar o token dentro da transação; revalidar que o texto confirmado do editor
coincide com a fonte, sem usar uma leitura nova para sobrescrever texto local.
Token usa `updateTime.seconds/nanoseconds`, sem arredondar para milissegundos;
inclui identidade/UID/hash e, em cena, metadados, corpo e revisão pertinentes.
Não depende da data do projeto, que muda por operações não relacionadas ao texto.

Na primeira captura/restauração explícita de capítulo, reutilizar
`prepareWorkWordCount` com limite 1 e operationId derivado estável para ativar
`hasProgressResources`. Não executar essa preparação ao abrir/listar o histórico.
A transação seguinte compara o token originalmente observado; não atualizá-lo
automaticamente após a ativação. Esse protocolo não exige contagem completa,
novo marcador ou revisão numérica e preserva prosa/datas/total atual do projeto.

Captura e restauração reautorizam projeto e fonte. Restauração preserva a prosa
anterior, aplica a escolhida, atualiza contribuição/contagem/revisões e grava recibo
na mesma transação. Extrair/reutilizar o plano transacional dos escritores atuais;
não chamar primeiro snapshot e depois escritor em commits independentes, nem
duplicar a matemática de contadores. Créditos e estado público não mudam.

Replay não reaplica a restauração. Se outra gravação ocorreu após o commit,
devolver conflito/prova mínima e comparação atual, sem recolocar resposta antiga
no editor. Mesmo operationId com outro payload é inválido. Resposta incerta mantém
pedido estável, scoped por UID/recurso, e bloqueia novas escritas até reconciliação.

## Integração com os editores

Capítulo usa a fila pública `runChapterOperation` já compartilhada com IA.
`saveNow()` não é barreira de sucesso e não pode ser chamado dentro dessa fila;
cena também não garante drenagem ao chamar `save()` ocupado. Oferecer salvar/tentar
novamente e liberar mutações só quando o estado confirmado permitir.

Reservar a operação antes do primeiro await e bloquear edição/aplicação de IA
durante captura/restauração. Cena precisa aceitar conteúdo confirmado, revisão,
bases internas e rascunho juntos; `acceptMetadata()` não serve para restauração.
Substituição no RichEditor deve ter fronteira de desfazer própria: desfazer é uma
nova edição normal, sem reaplicar recibo ou estornar crédito. Troca de conta e
respostas antigas não podem atingir outro documento.

Histórico fica no menu do capítulo, no editor da cena e no projeto para consulta
de fontes removidas. Estados carregando/vazio/erro/revogado e confirmação destrutiva
usam shared/ui, tokens, Lucide, foco/teclado e três temas. Mostrar o alcance da
restauração e a preservação automática do texto anterior em linguagem de produto.

## Exclusão, compatibilidade e não escopo

Remover versão marca indisponibilidade antes da limpeza limitada dos blocos.
Exclusão existente de livro limpa versões/corpos antes de concluir; remover agrupador ou
arquivar cena conserva o histórico da identidade. Histórico não concede acesso
direto por Firestore, leitor público, jogador ou comprador.
A exclusão de projeto de aventura ainda não existe; sua futura implementação
deverá incorporar a limpeza do histórico. Exclusão individual de versão funciona
nos dois tipos de projeto.

Backup privado atual v6 não inclui esse histórico; informar essa limitação no
fluxo de backup. Portabilidade integral do histórico fica em F2-09. Não reconstruir
versões de autosaves anteriores à feature, recriar recurso excluído, desfazer
conversão, fazer merge automático ou versionar operações financeiras.

## Passos, arquivos e validação proporcional

1. Fechar token/ativação e reuso transacional; testar protótipo dirigido desses
   contratos antes de alterar a UI.
2. `functions/src/workHistory*.mjs`, escritores em `workProgressLegacy.mjs`/`scenes.mjs`,
   `sceneJobs.mjs`, exports, regras/índices e testes de serviço/SDK: captura,
   leitura, restauração atômica, replay, exclusão e corpos grandes.
3. Feature `src/features/manuscript-history`: modelos, serviço, adaptador privado de
   pedido incerto, hook e diálogo; tipos públicos sem imports internos de vizinhos.
4. Integrar `EditorOptionsMenu`, `EditorPage`, `RichEditor`, `SceneEditorPage`,
   `useSceneAutosave` e páginas de projetos; explicar o backup sem histórico.
5. Testes dirigidos a cada ajuste, revisão e documentação/ADR/AGENTS. Validate
   integral no fechamento; SDK real para autorização/transações e Chromium nos
   caminhos alterados, sem repetir suítes verdes sem mudança ou causa nova.
6. Registrar entrega real, commit/envio autorizado e acompanhar CI em paralelo.

Backend e UI isolada podem usar subagentes após fechar o contrato; integração dos
editores depende das APIs. Não modificar os mesmos arquivos em paralelo.

## Aceite

- Captura manual não muda manuscrito, contagem, publicação ou créditos.
- Restaurar preserva uma cópia anterior no mesmo commit e conserva planejamento/posição/arquivo.
- Concorrência, perda de resposta e replay não duplicam versões nem sobrescrevem edição posterior.
- Texto pendente, IA e rascunho de recuperação são preservados; desfazer e edição seguinte funcionam.
- Fonte legada grande e Unicode têm roundtrip exato, sem novo teto ou truncamento.
- Histórico é privado em acesso direto e respostas tardias; recursos removidos não são recriados.
- Exclusão explícita e exclusão de projeto limpam corpos de forma retomável.
- Paginação, corpo selecionado, erro/retry, teclado, foco, temas e 320 px são verificados.
- Resultados locais e CI são registrados separadamente; pilotos e condições comerciais continuam pendentes.

## Evidência local — 2026-10-15

Os gates de validate foram concluídos após corrigir somente a formatação do teste
SDK e retomar do ponto da falha: 1.423 testes frontend com cobertura, 77 scripts,
237 Functions, sintaxe, tipos, build e smoke verdes. O SDK inicial passou 89/90;
o ID inválido do novo teste foi corrigido e somente esse caso reexecutado, 1/1 verde.
Chromium: 36/36 sem retry, três temas, desktop/celular e 320 px; produção 6 verdes
e um skip preexistente Windows. Revisões sem bloqueadores e capturas inspecionadas.
Veja [entrega e limites da evidência](../../../entregas/2026-10-15-writer-v2-historico.md).
CI do novo SHA segue em paralelo; isso não declara aprovação remota ou implantação.
