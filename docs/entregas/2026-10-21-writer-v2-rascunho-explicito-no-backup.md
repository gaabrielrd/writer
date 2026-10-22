# Writer V2 — Rascunho explícito no backup (P1 M8)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2; desenvolvimento em commit local.
- **Plano:** [contrato 41](../tasks/writer-v2/execucao/41-rascunho-explicito-no-backup.md).
- **Decisão:** [ADR 0052](../decisions/0052-explicit-book-draft-backup.md).
- **Estado:** marco interno com checks dirigidos; P1/F2-09 abertos.

## Comportamento entregue

- [x] Congelar rascunho local antes de qualquer next/await.
- [x] Preservar vazio e capítulo removido sem autosave ou versão manual.
- [x] Distinguir ausência explícita de contribuição e prosa vazia.
- [x] Preservar metadata/complemento/datas conhecidos sem copiar extras.
- [x] Capturar perfil próprio declarado mesmo sem vínculo de capítulo salvo.
- [x] Conferir hash incremental, UTF-8/BOM e partes de até 64 KiB.
- [x] Interromper após abort/contexto alterado ou retorno antecipado.
- [x] Reautorizar raiz/perfil e impedir selo após mudança.
- [ ] Interface, revisão/restauração e arquivo persistente P1 completos.

Arquivos: contrato puro/read servidor de draft, helper interno de identidade
M6 exportado sem alterar seleção salva, dispatcher/check Functions, gerador/
adaptador/API pública book-portability e testes Functions/cliente/SDK.
Sem dependências, Rules ou coleções novas; nenhum rascunho gravado no servidor.

## Resultados reais

Functions **15/15**, 120 ms: seis novos casos e nove de regressão M6. Confere
perfil arquivado/preset, remoção do capítulo, namespace, hash/projeção, raiz
alterada/deleting e troca/recriação nativa de perfil com raiz imóvel.
Vetor de perfil com campos no limite permanece abaixo de 256 KiB e não trunca.
A revisão ampliou o vetor para os 16 atributos e todos os campos textuais no
limite, com caracteres de escape máximo: repetição dirigida desse caso 1/1.

Cliente primeiro **12/12**, 1,79 s. Lote com transporte e regressão do exportador
JSON v1–v6 **44/44** em três arquivos, 3,05 s. Inclui rascunho de **20 MiB em
320 partes**, hash comparado ao Node crypto, sem array de partes no consumidor
desse caso. Spy exige encodeInto com segmentos/buffers até 64 KiB e proíbe
TextEncoder.encode do corpo inteiro.

Cobre congelamento antes de next, Unicode/BOM/NUL nas fronteiras, surrogate
solto recusado antes do cabeçalho, metadata grande em partes, opcionais ausentes,
modo scenes/livro errado, prova/perfil corrompidos, troca de contexto, abort durante
a primeira passagem, retorno antecipado e erro de transporte sem retry.
Nenhuma regressão antiga de rascunho vazio/removido foi retirada.

SDK real **4/4**, 3,61 s. Leitura de perfil declarado funciona sem capítulo,
vínculo salvo ou versão de histórico; raiz permanece intacta. Writer SDK real de
perfil invalida token sem mudar livro. Exclusão SDK continua proibida; recriação
Admin de mesmo corpo invalida. Isolamento, ausência e raiz deleting testados.
Sem skips/falhas/retries.

Chromium com Firestore real no emulador: **17 cenários em um probe**, 21,67 s.
Compõe M3b–M8 em **161 registros e 1.093.043 bytes** de fixture: 58 versões,
lore próprio, três perfis salvos, universo e rascunho de 216.003 bytes em quatro
partes com seu perfil exclusivo. Dois arquivos adicionais distinguem none de
present vazio com uma parte vazia.

O input foi alterado antes de iniciar o gerador, e o arquivo manteve texto/título
congelados. Estilo não referenciado no estado salvo foi incluído somente no
rascunho. Alteração desse perfil com livro imóvel invalida prova e deixa arquivo
sem selo. Todos os cenários anteriores continuam; zero runtime errors e
requisições externas bloqueadas.

## Checks e revisão

Build/typecheck/bundle/smoke, lint dirigido, arquitetura e sintaxe Functions
passaram. Formato, links e diff conferidos antes do commit; hooks preservados.
Avisos conhecidos de chunks grandes e imports estáticos/dinâmicos de
workHistoryCallables/exportDocx permanecem. Dependências não mudaram: auditoria
M4 com três moderados preexistentes segue registrada, sem nova auditoria ou
alegação de audit verde.

Revisão conferiu distinção contribuição/salvo, foto síncrona, UTF-8 por partes,
pressão de consumo, perfil declarado somente próprio, ausência de chaves,
reautorização e retorno final obrigatório. Validate completo fica para fechar P1.
Nenhuma CI consultada/disparada, push, PR, merge ou deploy.

## Limites e próximos passos

String de origem já está na memória do editor; o produtor não cria um buffer
UTF-8 do corpo inteiro. Isso não prova orçamento de memória do editor, sink
persistente, disco ou navegador sob qualquer tamanho. Metadata mantém o limite
M3b por item, sem novo limite total do texto.

Ponte HTTP do probe fixa UID de teste; isolamento tem prova SDK distinta, sem
alegar Auth/App Check produtivos. Fixture pequena acumula frames/Blob para
asserções, sem representar o sink final. Não há UI, revisão, restauração ou
recriação automática de capítulo entregue.

Mídia autorizada, schema/leitor legado, arquivo persistente, revisão e
preparação/remapeamento/ativação/cleanup/recuperação continuam em P1.
Nenhuma tarefa ampla da V2 adicional é contada por este marco.
