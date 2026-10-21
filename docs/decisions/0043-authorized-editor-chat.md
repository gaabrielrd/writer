# ADR 0043 — Chat autorizado de cenas e blocos

**Estado:** implementado e validado localmente; CI pendente; sem rollout.
**Contrato:** [plano A](../tasks/writer-v2/execucao/29-contexto-autorizado-e-ia-de-cenas.md)
e [ABI](../tasks/writer-v2/execucao/30-contratos-do-chat-de-cenas.md).

## Contexto

O chat legado recebe lore e persona do cliente e autoriza livro/capítulo. Cenas
próprias e blocos de aventura precisam de leitura autorizada por origem, inclusive
quando o histórico transmite dependências antigas. As identidades de criação não
podem ser confundidas com IDs reutilizados. O operador escolheu persona por
aventura, complemento por cena e herança nos blocos; respostas afetadas por lore
indisponível devem ser ocultadas, preservando perguntas próprias e texto aplicado.

## Decisão

Compor contexto, conversa, geração e aceite em editorChat, sem migrar históricos
legados. Auth/App Check protegem o callable. Metadados, corpos e controles privados
não são acessíveis pelo SDK direto. O servidor lê fichas locais antes de globais,
resolve persona, fecha manifesto e limita closure/histórico sem perder dependências
silenciosamente. Matcher e compilador de persona são contratos puros compartilhados.

Identidade nativa usa createTime preciso; IDs iguais de uma fonte recriada não
restauram autorização. Reautorizar todas as folhas antes de input, chunks,
conclusão, leitura e aplicação. Edição comum torna a base antiga, mas não equivale
a revogação. Respostas concluídas mantêm histórico congelado; bloqueio é projeção
sem resposta, permitindo revalidar a mesma origem posteriormente. Perguntas próprias
ficam em documento separado. Execuções ativas bloqueadas não ressuscitam.

Captura própria do editor é distinta da base HTML persistida. O host reserva a
captura e a aplicação, mantém guard do documento e seleção através de awaits e
adota metadados completos sem resetar o editor. Geração libera a escrita; mudança
no texto exige novo destino explícito e CAS. Autocomplete e aplicação legada não
operam nos novos alvos. Não criar versões manuais automaticamente ao aplicar.

Operação e fingerprint duráveis antecedem rede. Journal metadata-only usa Web Locks
curtos e CAS integral; reload observa/cancela a mesma intenção, sem reenviar prosa
ou regenerar. Contexto sem listagem só perde seu ponteiro após consumo/exclusão
confirmados. Setter de persona mantém conversa/turno e não concede token textual;
retomada textual exige prova metadata-only da mesma origem e do par nativo real.
Excluir conversa exige gesto explícito e cleanup confirmado antes de remover refs.

Conversa é gratuita. Claim de geração usa quota compartilhada com capítulo; retry
não consome nova quota. Aceite de plataforma cobra um crédito na primeira aplicação
do turno. Texto, contagens, ledger, saldo, paid e recibo são uma transação. Replay
reconhece o recibo; reapply explícito do turno pago e BYOK não cobram novamente.
Undo é edição normal. BYOK congela provedor/modelo/raciocínio e tentativa; chave
fica somente no transporte do provedor e não entra em journal, input ou histórico.

## Consequências

Fechar o painel conserva pergunta em RAM; reload anterior ao claim pode perdê-la.
A interface deve dizer isso e confirmar saída com texto não enviado. Não existe
promessa de apagar bytes vistos ou enviados ao provedor. Hints/foco invalidam a
apresentação e provocam reconsulta; não são autorização nem revogação presumida.

Recibos/fences não têm TTL e excluem prosa; exclusão de corpos é paginada e
retomável. Indisponibilidade ou resposta incerta não autoriza regeneração automática.
O armazenamento cresce até exclusão explícita, sob os limites por operação do
contrato. Comércio, publicação, IA em campanhas e portabilidade permanecem em
verticais próprias. Nenhum provedor pago ou deploy faz parte desta validação local.

Habilitação exige coordenar writers do clock local e regras com o novo backend,
e drenar clientes antigos que não incrementam o clock. Os emuladores e fixtures
não comprovam credenciais, configuração App Check ou operação de produção.
