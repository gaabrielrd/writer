# P1 — backup completo no diálogo de exportação

## Descoberta e objetivo

Após 4a4e782, o inventário encontrou a composição streamEditorBookBackup/
saveEditorBookBackup e o sink do plano 43 sem consumidor de interface.
ExportDialog oferece somente Markdown/DOCX/PDF/JSON v6, cujo rótulo completo
é incorreto para o histórico. Conectar o produtor validado ao editor, mantendo
o JSON antigo explicitamente identificado.

Grafo não atualizado (worker fast falhou); fontes reais ExportDialog/ExportButton/
EditorOptionsMenu, bookBackup, bookBackupSink/streamBookBackup e testes conferidos.
Este incremento resolve a entrada visual, sem declarar inventário geral concluído.

## Contrato antes do código

1. Acrescentar formato visual Backup privado com histórico (.writer), sempre
   livro inteiro. Usar saveEditorBookBackup pela composição existente; JSON
   continua disponível como Backup JSON antigo (.json), com aviso sem histórico.
   Não alterar o schema nem encaminhar writer ao exportador de manuscrito antigo.
2. Novo serviço exportBookArchive controla seleção do destino e lifecycle.
   Congelar contribuição local antes de aguardar o seletor: título/metadata/texto
   legado aberto, inclusive vazio e recurso removido. Capítulo scenes não recebe
   rascunho de composição; capítulos/cenas salvos continuam no backup normal.
   Não salvar manuscrito nem criar versão por exportar.
3. API da plataforma showSaveFilePicker somente no serviço. Arquivo .writer por
   createBookBackupFileSink, um quadro por vez; close só depois das provas/selo.
   Abort/falha não anunciam sucesso nem acumulam projeto num Blob.
4. Não guardar cópia temporária plaintext oculta no navegador. Se a plataforma
   não oferecer seleção/gravação segura de arquivo, explicar indisponibilidade
   e desabilitar só essa gravação; outros formatos continuam funcionando.
   Cancelamento do seletor é resultado neutro, sem erro técnico.
5. Fixar conta/livro ao início; guard antes/depois dos awaits e sinal de abort
   valem para seletor, sink e captura. Troca de conta/contexto/unmount fecha a
   tentativa sem mensagem tardia. Depois de close confirmado não prometer
   apagar arquivo já salvo. Sem outro download/link para contornar destino.
6. UI cobre pendente/erro/sucesso/cancelado e evita cliques concorrentes.
   Arquivo privado contém estado atual/histórico/rascunho separado e mídia própria;
   origem do universo é só vínculo autorizado, sem lore global copiado.
   Mensagem orienta restaurar pelo Estúdio, sem anunciar publicação/venda.
7. Sem namespace, callable, dependência, nova persistência ou rollout padrão.
   Adaptador do seletor é injetável em testes; provas OPFS não substituem
   interação física com seletor externo nem validação humana.

## Sequência e arquivos

- [x] Serviço de gravação/adapter de plataforma e testes do lifecycle.
- [x] ExportDialog, nomes de arquivo e hosts/contexto, com testes observáveis.
- [x] Browser com diálogo real e arquivo nativo dirigido ao sink por adapter QA;
      inspeção/roundtrip e temas, teclado, 360 px, cancelamento/erros/conta.
- [x] Checks dirigidos, revisão, ADR/docs/AGENTS/evidência e commit local.

Arquivos previstos: editor/services/exportBookArchive.ts e interfaces públicas,
model/exportDocument.ts (extensão do nome), ExportDialog/ExportButton/
EditorOptionsMenu se necessário ao guard; testes existentes e serviço novo.

## Riscos e limites

Seletor exige gesto do usuário/contexto seguro; evitar await de rede antes dele.
Não suprimir falha de abort/close nem converter falta de permissão em ausência
de dados. JSON v1–v6 continuam com as mesmas regressões e limites.
Inventário de escritores/exclusão, fontes v1 sem marca, certificação/migração,
drain/rollout e validate de P1 continuam pendentes. Somente local; sem CI,
push, PR, merge, deploy ou subagentes. Demais fases/gates permanecem no objetivo.
