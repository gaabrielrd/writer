# Incremento 45 — produtor e arquivo editorial provisório

## Escopo e estado

O objetivo integral continua sendo implementar as cinco etapas do
[plano aprovado](plano-integral.md). Este incremento compõe o produtor editorial
interno e sua confirmação de arquivo; não encerra a restauração nem o plano.
Worktree `C:/Users/gaabr/.codex/worktrees/producao-literaria/writer`, branch
`codex/producao-literaria`, principal incorporada em `b666233`.

A [rodada anterior](validacao-atual-principal-b666233.md) executou testes após
conferir a principal. Seus resultados não validam o novo estágio cifrado descrito
abaixo. A implementação posterior volta a aguardar o próximo gate anterior à
integração, conforme a instrução do autor. Nenhum teste, typecheck, lint,
formatter, build, navegador, coverage ou check foi executado neste incremento.
A revisão foi feita por leitura do código. Sem commit, merge de volta, push ou deploy.

## Catálogo e captura interna

`bookEditorialCaptureCatalog` centraliza as 37 famílias, versão do catálogo e
limites do protocolo. O setor existente `bookPortabilityApi` registra sete ações:
fonte, catálogo, lista, leitura de parte, inspeção metadata, verificação de item e
verificação da fonte. O cliente usa o transporte setorial existente, sem criar
uma Function por ação nem requisitar segredo de geração.

A fonte conserva autorização e tokens nativos. A lista informa `lastId` da página
bruta para atravessar páginas vazias depois do filtro de UID. A inspeção reconstrói
uma projeção limitada no servidor para conferir seu hash, sem transportar corpo.
Alias é somente metadata e não possui partes a baixar.

O produtor confere partes de 64 KiB, hashes de parte e SHA integral, DTO fechado,
contagem e IDs locais do bundle. Desmembra bundles em artefatos e emite vínculos
explícitos pelo extrator compartilhado de referências. Nunca deduz relação por
texto. O censo cobre todas as famílias, inclusive vazias, e usa digests encadeados
por família em vez de guardar o catálogo inteiro na RAM. Uma segunda passagem
confere metadata; o host reconfere o censo antes de footer/selo.

`editorial-saved-records-v1` identifica o contrato compilado dos writers
coordenados e do catálogo, não uma prova de rollout ou autorização. A revisão dos
writers acrescentou o marcador na reserva da unidade de preservação e nas escritas
de rechecagem da integração. O token do fence é v3. Clientes/writers anteriores
precisam ser drenados antes de habilitar o produtor; os testes finais continuam
necessários para conferir o conjunto.

## Confirmação do arquivo

O stream permite v2 somente mediante um port editorial explícito. Esse port é
copiado no início, antes do seletor de arquivo e das esperas do stream. O formato
padrão continua v1 e a interface não escolhe v2. O stream é um protocolo de bytes
provisórios; selo/framing não constituem validação semântica.

Para v2, `saveBookBackup` acrescenta `bookBackupStage`: estágio OPFS próprio da
operação, sob diretório UUID e namespace separado do índice semântico. Persiste
somente partes cifradas AES-GCM. A chave não é extraível nem persistida. AAD liga
cada parte à operação, posição e comprimento; IV é novo por parte. A conta e o
estado do arquivo permanecem em memória. Não há adoção de bytes de outra operação.

O estágio acumula no máximo uma parte de 64 KiB e limita cada chamada de leitura/
escrita a 1 MiB. O produtor continua sob pressão de consumo: aguarda estágio e
destino antes de pedir o próximo frame. Uma chamada copia os bytes antes de
esperar I/O. Após terminar a gravação, a leitura é limitada e somente do estágio
selado, com conferência de tamanho e autenticação antes de entregar cada intervalo.
Partes ausentes, truncadas, trocadas ou alteradas interrompem a operação.

Antes de `sink.close`, o host executa o mesmo `inspectBookBackupContent` da
importação, incluindo verificação do contêiner inteiro e índice temporário cifrado
compartilhado. Isso confere identidades duplicadas entre bundles, referências e
vínculos de todo o pacote sem um Set global de IDs em RAM. O relatório precisa
corresponder ao livro, versão, tamanho e selo do stream original.

O índice é limpo pelo runner existente, e o estágio próprio precisa ser removido
antes da confirmação do destino. Erro de validação, perda de sessão ou limpeza
não confirmada conduz ao aborto do arquivo provisório. A limpeza não depende da
sessão ou de chave remota, não remove outras operações e permite repetir uma
retirada falha pelo mesmo handle. Finalizar/limpar durante escrita pendente é
recusado. Leituras em voo não podem devolver corpo depois do descarte.

Uma queda do processo pode deixar ciphertext sem chave, como no índice existente;
o estágio não é um mecanismo durável de recuperação. Uma nova exportação começa
uma operação distinta. Não há fallback para cache de prosa em claro ou para RAM
proporcional ao livro inteiro. V1 conserva seu caminho anterior e não exige OPFS
por causa deste incremento.

## Testes preparados e evidência anterior

Foram preparados oito casos do estágio e seis casos adicionais do host, sem
execução. Os casos negativos do host exigem primeiro um contêiner válido e as duas
provas nativas para demonstrar rejeição semântica, não uma falha anterior casual.
Há cenários de corrupção, troca de partes/operações, limites, mutação durante I/O,
revogação, limpeza própria/repetível, IDs duplicados, referência sem alvo, erro de
limpeza, perda de sessão durante a inspeção semântica e congelamento do port antes do seletor. Os testes optativos v2 existentes
passam a utilizar armazenamento simulado com criptografia e validador reais.

A rodada anterior registrou 275 testes editoriais, 24 de produtor/host, 27 SDK de
captura e quatro SDK do marcador nas respectivas reconferências. O frontend
completo teve 5.465/5.465 casos, mas cobertura de funções em 85,81% reprovou o gate
de 90%; Rules completas atingiram timeout de 30 minutos. Esses números são
históricos, não aprovação dos arquivos agora alterados nem `npm run validate` verde.

## Próximo incremento obrigatório

Implementar restauração editorial útil: contrato e planos editáveis, histórico
privado completo e vínculos remapeados. Ampliar inventários e cleanup antes dos
primeiros recursos, manter raiz ausente durante preparação e ativação atômica com
origem nativa. Revisão precisa distinguir estado autoral histórico de concessões
atuais; tokens antigos ou observações de fontes recriadas não podem autorizar
referências. Execuções antigas permanecem desabilitadas e publicação privada.

A restauração v2 continua recusada pelo cliente e servidor até esse protocolo e
sua revisão estarem completos. Depois faltam auditoria E1–E5, reconferência da
principal e gates integrais, incluindo cobertura de funções de 90% e Rules.
**0/5 etapas formalmente encerradas.** O objetivo integral permanece ativo.
