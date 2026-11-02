# ADR 0082 — Materialização privada da capa restaurada

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M35b, depois da ADR 0081

## Problema

Os bytes estão preparados, mas falta uma imagem íntegra no Storage. Firestore e
Storage não oferecem uma transação conjunta. Apenas apagar o objeto no
cancelamento permitiria que um upload atrasado create-only recriasse os bytes.

## Decisão

reserveBookRestoreCover confirma intenção nativa em preparedCoverStorage/current,
journal e progresso v10 sob inventário v13 antes de qualquer I/O. Comprovar
namespace/journal vazios na migração. Descriptor e item M21 precisam concordar.

materializeBookRestoreCover autentica cada frame em transação própria, confere
bytes/hash integral e decodifica PNG com sharp existente, sem recomprimir nem
introduzir limite de resolução no contrato portátil. Uma capa de até 16 MiB
fica na RAM; nunca o projeto inteiro. Erro operacional do codec interrompe
intacto, sem omitir a capa ou ativar o livro.

Reconferir autorização, item e observações nativas antes/depois de I/O. Caminho
canônico deriva de UID e imageId remapeado. Escrita somente create-only, com
accepted false, cache private/no-store e sem token/URL. Retomada faz HEAD antes
de escrever e exige identidade privada, bytes/hash e geração exatos.

Confirmação registra generation/metageneration, intenção/journal/progresso/recibo
atomicamente. Fase personas-integrate; raiz ausente/countReady false e nenhuma
linha de biblioteca/uso. None/legacy-unavailable não criam objeto.

## Cancelamento e limpeza

Cancelamento no Firestore precede cover-storage, primeira fase do inventário v13.
Objeto próprio é substituído por marcador vazio privado com precondições de
geração/metageração; se ausente, criar marcador com generation-match 0.
O marcador é reserva permanente. Não removê-lo por cleanup, manutenção ou
lifecycle: a ausência reabriria a janela de upload atrasado.

Marcador conserva a geração/metageração substituídas. Reconferir metadata da
versão antiga antes de excluí-la explicitamente, inclusive em bucket versionado.
Versão inexistente é idempotente; resposta com outra geração falha sem excluir
o marcador. Repetição após resposta perdida conclui a limpeza da versão antiga.

Geração confirmada recriada ou metadata alterada são protegidas. Upload com
resposta desconhecida só pode ser adotado pela identidade privada integral da
intenção; manutenção Admin também deve seguir esse protocolo. Após o fence,
confirmar sua prova no progresso/intenção/journal/recibo antes da limpeza dos
recursos Firestore. Certificar o namespace novo vazio ao terminar.

Inventários v1–v12 e recibos anteriores continuam compatíveis. Marcadores vazios
e reservas permanentes não equivalem a imagem ativa nem contêm bytes da capa.

## SDK e verificação

SDK instalado converte generation do construtor para Number. Interceptor do
arquivo preserva a string decimal exata nas requisições de leitura/exclusão.
Contrato HTTP com SDK real prova criação condicionada, leitura, exclusão da
geração antiga, metageração e HTTP 412 em upload atrasado.

Firebase CLI 15.24.0 instalado ignora precondições e geração no DELETE do Storage.
A primeira tentativa conjunta expôs isso e falhou; não é prova de segurança do
protocolo. Emulador verifica bytes/Rules/privacidade e estágio iniciado depois
do fence; corridas/precondições/exclusão versionada usam contrato HTTP local
com o SDK real e testes do protocolo. Nenhuma execução contra GCS de produção.

Fontes: [precondições GCS](https://docs.cloud.google.com/storage/docs/request-preconditions),
[limites do emulador Firebase](https://firebase.google.com/docs/emulator-suite/connect_storage)
e código instalado do SDK/CLI inspecionado localmente. O servidor HTTP de teste
modela o contrato documentado; não é o serviço GCS nem o emulador Firebase.

## Estado e próximos passos

Disponibilizar imagem/uso exige ativação autorizada e nova conferência da prova
Storage; progresso preparado não é grant. Validar configuração real de bucket,
preservação dos marcadores e permissões no rollout antes de habilitar o host.
Integração de personas, campos grandes/consumidores, certificação/ativação e
host/UI/roundtrip/validate integral continuam obrigatórios.

P1/F2-09 e Writer V2 abertos. Sem API pública nova, Rule, dependência, crédito,
subagentes ou CI/push/PR/deploy. Adaptador é composto nos handlers existentes,
para que a limpeza v13 tenha o mesmo backend de Storage do escritor.
