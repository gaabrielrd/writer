# ADR 0166 — backup completo no diálogo de exportação

Status: aceita para incremento local; P1 e rollout pendentes.
Data: 2026-10-25.

## Contexto e decisão

O produtor completo por fluxo, composição com histórico e sink do plano 43
existiam sem entrada de interface. ExportDialog oferecia JSON antigo sem histórico.
Acrescentar Backup privado com histórico (.writer), sempre livro inteiro.
Identificar JSON como Backup JSON antigo (.json), conservando formato/comportamento.

Usar saveEditorBookBackup e o sink público existente. Novo serviço fixa conta/
livro e congela contribuição de rascunho pelo produtor antes de iniciar o seletor.
Capítulo legado aberto contribui explicitamente, inclusive vazio ou removido;
capítulo composto por cenas usa seus textos salvos, sem declarar composição
como rascunho. Não gravar manuscrito ou criar versão por exportar.

Selecionar destino por showSaveFilePicker num adaptador de serviço e contexto
seguro. Não aguardar rede antes do seletor. Gravar um quadro por vez e fechar
somente após provas/selo; falha/abort não são sucesso. Não acumular livro num Blob
nem persistir plaintext temporário escondido no navegador.

Sem API de gravação compatível, explicar disponibilidade e desabilitar somente
essa ação. Outros formatos continuam acessíveis. Cancelar seleção é status neutro.
Arquivo salvo é privado e será restaurado pelo Estúdio; não publica nem vende.

## Lifecycle e limites

Guard confere conta/livro/sinal/contexto antes e depois dos awaits e durante a
captura. Troca enquanto escolhe não abre writable; troca após abri-lo aborta
temporário. Erros de fechamento/abort são preservados, sem mensagem de sucesso.
Hosts remontam o diálogo por autor/livro, abortando operação de contexto anterior.
Arquivo com close confirmado não pode ser apagado remotamente por esse guard.

Chamada do seletor é injetável para QA. Arquivo OPFS nativo usado no teste não é
fallback de produção nem prova de interação física com seletor externo. Esse
seletor permanece conferência humana; nenhuma permissão foi contornada.

[Plano 143](../tasks/writer-v2/execucao/143-backup-completo-no-dialogo-de-exportacao.md)
e [evidência](../entregas/2026-10-25-writer-v2-backup-completo-no-editor.md).
Sem novo namespace, endpoint, dependência, crédito ou armazenamento de recuperação.
Inventários gerais, fontes v1, certificação/migração, rollout e validate de P1
seguem pendentes, assim como fases 3–5 e gates humanos/comerciais.
