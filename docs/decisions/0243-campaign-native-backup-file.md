# ADR 0243 — arquivo nativo de campanha por fluxo

- Data: 2026-10-29.
- Estado: escritor e validador internos implementados localmente.
- Base: a740223; [plano 213](../tasks/writer-v2/execucao/213-arquivo-nativo-de-campanha.md).

## Decisão

Usar o framing neutro existente com magic próprio WRITER-CAMP seguido de LF
(12 bytes), versão 1. Acrescentar encoder incremental start/write/finish/abort
a portableBackupContainer, reutilizando header/frame/digest/limites. Não mudar
a API nem a representação de encode/decode de livros e aventuras.

O encoder copia payload antes de await, mantém um frame limitado e recusa
operações concorrentes ou posteriores ao fechamento. Abort impede a entrega
de um frame pendente. Vetores independentes dos formatos antigos continuam iguais.

A auditoria aceita onRecord interno opcional, capturado antes de await. Sem
callback, conserva a auditoria de metadados. A passagem capture publica bytes
provisórios; recheck repete as provas e hashes, sem republicar registros.
Os leitores nativos de texto e PNG são usados também para os bytes publicados,
com seus gates por unidade/parte. Cada releitura confere tamanho e SHA completos.
A releitura evita armazenar campo/projeto completo; entidades de lore mantêm
seu limite nativo atual.

## Registros

O contêiner mantém sua metadata canônica kind/id/part. Identidades físicas,
paths e tokens não entram nos registros. IDs de unidade são ordinais decimais
contínuos desde zero; evidências possuem sequência ordinal independente.

1. campaign/header/0: JSON fechado de schemaVersion, kind, versões de conteúdo/
   procedência, originCampaignId e disponibilidade.
2. unit/ORDINAL/0: descritor canônico de section, id lógico, field quando houver,
   outcome e manifesto de bytes/partes/SHA quando disponível. PNG inclui
   contentType. Omitido carrega reason; não recebe payload de dados.
3. data/ORDINAL/INDEX: partes consecutivas de até 65.536 bytes, do tamanho exato
   declarado. Campo vazio preserva uma parte vazia. A unidade deve terminar antes
   de outro registro. Texto é byte literal; não decodificar partes isoladas.
4. witness/ORDINAL/0: evidência canônica na representação da ADR 0242, até 64 KiB,
   entre unidades completas. O JSON da evidência disponível contribui para sua
   contagem de bytes, sem confundir envelope com conteúdo.
5. attestation/manifest/0: manifesto e assinatura, depois de todos os registros
   e da segunda passagem nativa. Nenhum registro pode segui-lo.
6. Footer neutro autentica contagem/cadeia/EOF; nenhuma sobra ou concatenação.

Cabeçalho, descritores e pacote assinado são limitados a 16 KiB no leitor;
dados/evidências a 64 KiB. Limite neutro de frame permanece 256 KiB, com
comprimentos conferidos antes da alocação/leitura do corpo.

## Destino e validação

O escritor recebe sink temporário write/commit/abort, captura métodos/intenção
antes de I/O e aguarda cada escrita. Emite footer somente após auditoria completa
e assinatura; confirma destino depois do footer. Falha ou abort solicita
descarte. Não fornece adaptador que acumula campanhas reais em RAM.

O host deve implementar armazenamento fiel e commit/abort do temporário.
Falhas desses métodos são propagadas; durabilidade, perda de ACK e limpeza
persistente pertencem ao adaptador/job futuro, com C4 e recibos próprios.

O validador lê um frame/unidade por vez, sem índice do projeto. Confere JSON
canônico, ordinais, tipos, controle omitido, partes, PNG e SHA por unidade.
Dobra todas as unidades/evidências nas raízes do manifesto, compara contagens,
conta vinculada e assinatura e exige footer/EOF antes do retorno.
Uma cadeia refeita pelo atacante não substitui a assinatura dessas raízes.

Resultado é campaign-file-integrity-only. A fonte size/read é emprestada:
o host conserva responsabilidade por handles e sua duração. O leitor captura
read, observa mudanças de size e confere abort após I/O/progresso e no retorno.

## Limites

Integridade/emissão não são autorização atual ou restauração. Vínculos
semânticos completos e origem vigente por nascimento continuam obrigatórios.
Excluir campanha/base/origem depois da captura não altera a verificação dos
bytes do arquivo já emitido; não concede acesso a derivados revogados.

Sem endpoint, UI, chave real, dependência, Rules ou produtor persistente novo.
Sinks de teste em RAM provam o protocolo, não orçamento de memória de um
adaptador real. Operação remota precisará de checkpoints e limites de execução.
Ampliar consumidores de procedência e cleanup C4 v1–v4 antes de persistência.
P3/D/F2-09 e macro 8/35 continuam abertos; validate integral no grande bloco.

Veja a [evidência parcial](../entregas/2026-10-29-writer-v2-arquivo-nativo-de-campanha.md).
