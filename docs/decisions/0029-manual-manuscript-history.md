# ADR 0029 — Versões privadas manuais do texto

- **Status:** Aceito; implementado e validado localmente, CI pendente
- **Data:** 2026-10-15

## Contexto

Autores e mestres precisam recuperar texto sem perder o estado substituído.
O operador escolheu versões manuais, cópia antes de restaurar e retenção até
exclusão explícita, substituindo a proposta de histórico em cada autosave.
Capítulos legados não têm revisão numérica; cenas têm revisão de metadados/corpo.
Ambos já dependem de escritores e ledger transacionais.

## Decisão

Uma feature pública `manuscript-history` oferece o diálogo nos editores e consulta
por projeto. A fonte é o texto salvo autorizado, identificado por token opaco com
timestamp preciso do Firestore e hash. O editor precisa coincidir com essa fonte;
uma atualização de comparação não adota silenciosamente uma nova base de escrita.

Manifestos privados ficam separados de corpos em blocos de até 64 KiB UTF-8.
Listas paginam metadados; leitura do corpo selecionado verifica ordem, tamanho e
SHA-256. Não aplicar novo teto aos capítulos legados nem truncar Unicode/HTML;
cenas conservam seus limites existentes. Não há compactação/expiração automática.

Restauração grava a cópia anterior, texto, contagens e recibo na mesma transação,
reutilizando os escritores atuais. Replay não reaplica texto sobre edição posterior.
O capítulo ativa a proteção legada pelo protocolo de progresso em um lote somente
na primeira mutação explícita; o token original continua obrigatório após ativar.

Pedido incerto conserva identidade por UID/recurso sem corpo no adaptador privado.
Editores reservam a escrita antes de await; uma resposta confirmada atualiza corpo,
revisão e bases do autosave juntos. Desfazer gera nova edição normal. Salvar agora
não é tratado como barreira de sucesso e não entra dentro da própria fila.

## Consequências

Versões consomem armazenamento até exclusão explícita. Excluir versão é definitivo
e não altera o manuscrito atual; limpeza de corpos é retomável. Exclusão de livro
limpa os filhos antes de terminar. A futura exclusão de aventuras deve fazer o mesmo.

Origem removida/convertida continua consultável, copiável e excluível, sem recriação
ou conversão reversa implícita. Histórico não muda publicação, créditos, planejamento,
ordenação ou arquivo. O backup v6 não inclui versões; a UI informa essa limitação,
com portabilidade integral na tarefa F2-09. CI é acompanhada em paralelo conforme
o processo aprovado; resultados reais ficam no
[contrato F2-05](../tasks/writer-v2/execucao/11-historico-e-restauracao.md).
