# ADR 0060 — Validação servidor retomável de contêineres de livro

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M16](../tasks/writer-v2/execucao/49-validacao-servidor-do-conteiner.md).

## Decisão

Validar writer-book-archive v1 no servidor pela entrada verificada M14 e pelo
núcleo M15, sem criar raiz ou recurso de livro. JSON v1–v6 conserva leitor
cliente e retorna legacy-validation-pending no avanço servidor até sua próxima
integração; isso não é conclusão de P1/F2-09.

Extrair readBookBackupFrame/readBookPackageStep com cursores fechados/versionados.
Os generators existentes usam esses mesmos passos, preservando canonicidade,
hash/ordem, sete seções, footer, selo/EOF e relatório congelado.
Cursores são controle do host, nunca assinatura de arquivo ou autorização.

## Unidades e persistência

advanceBookRestoreValidation recebe só restoreId/jobToken/operationId/checkpoint.
Uma chamada processa quadro, conclusão de JSON até 8 MiB, lote de até 64
relações/referências ou conferência de 16 partes da entrada.
Cursor JSON mantém até 128 spans; raw mantém SHA serializado privado e contadores.
JSON e raw reutilizam os mesmos checks dos leitores existentes, incluindo
Unicode/BOM/vazio/PNG e hashes. Estado privado tem teto de 64 KiB.

validationIndex guarda provas sem prosa, valores até 16 KiB e origem do item.
validationItems guarda spans/cursor raw por item lógico, sem copiar autor/texto.
Metadados são suficientes para a materialização futura ler itens diretamente.
Preparação mantém overlay e até 96 efeitos, sem writes externos antecipados.

A preparação lê fora da transação final e captura todas as versões nativas de
chunks/provas e índice/recibos que utilizou. A transação final reautoriza UID,
reserva/marker/raiz ausente, checkpoint e snapshot; relê essas observações antes
de confirmar índice, item, checkpoint, progresso e recibo juntos.
Concorrência vencida não rejeita o arquivo atual. Um pedido idêntico que já
terminou é confirmado pelo recibo mesmo se uma leitura tardia ficou obsoleta.

## Nascimento e erros

Checkpoint privado mantém createTime igual ao primeiro recibo de validação,
fixado por validationBirthOperationId. Seu hash e checkpoint também conferem.
Índices imutáveis têm createdByOperationId, createTime igual ao recibo criador
e updateTime igual ao createTime. Leituras posteriores e confirmação final
recusam mutação/ABA, mesmo com corpo idêntico.
Ponteiros de itens são criados com o mesmo vínculo; seu futuro consumidor deve
conferir esse nascimento e a origem novamente.

Estados validating/content-verified/content-rejected são separados de ativação.
Somente BookBackupFormatError determinístico produz rejeição com código seguro;
erro temporário, identidade ou CAS não vira uma decisão sobre o arquivo.
Rejeição descarta efeitos da unidade e remove o snapshot privado.
Resultado verificado exige framing/EOF, núcleo done e rechecagem das provas
da entrada. Cada leitura de materialização futura ainda deve reautorizar a
mesma origem; o relatório não fixa autorização de universo nem grant comercial.

A callable usa Auth/App Check existentes, sem cache e sem retorno de corpos.
Seu timeout é 540 s para acomodar a conclusão limitada de um item de até 8 MiB
com conferências remotas; isso não promete duração produtiva nem permite
processar o projeto inteiro numa chamada. Não há validação produtiva de timeout
ou Auth/App Check nesta entrega local.

## Inventário v3

Promover cleanupVersion para 3 junto do primeiro controle de validação.
Fases: chunks → validation-index → validation-items → validation-state →
proofs → state → done. Remover até 50 documentos de dados por etapa,
conferindo contexto e EOF antes de cancelled; manter recibos/job/reservas/marker.
Estado SHA pode conter entrada, permanece privado e é removido no encerramento.

Rules recursivas de bookRestores já negam SDK para os novos filhos.
Jobs v1/v2 continuam reconhecidos. Versão/namespace/contexto alheio não é adotado
nem apagado. Livro inesperado bloqueia toda preparação/cleanup.
Antes de qualquer DTO normalizado ou mídia de preparação, ampliar inventário
novamente. Não há writer novo em books ou Storage neste marco.

## Limites

Verificação de capa aqui confere manifesto/assinatura/bytes/hash; decodificação e
normalização real continuam obrigatórias antes da materialização. Não servir
entrada bruta como mídia pronta. Conteúdo global/URLs/flags do arquivo não concedem
acesso e vínculo de universo requer autorização atual/ativação atômica posterior.

Persistência servidor de legado, remapeamento, mídia, host protegido, UI/roundtrip
e validate completo continuam em P1. [Evidência M16](../entregas/2026-10-22-writer-v2-validacao-servidor-do-conteiner.md).
Somente commits locais, sem CI/push/deploy.
