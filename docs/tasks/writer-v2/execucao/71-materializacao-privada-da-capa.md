# P1 / M35b — Materialização privada da capa

## Objetivo e contrato

Materializar a contribuição M35a sem expor capa parcial nem sobrescrever arquivo
atual. Preservar bytes/nome/datas; imagem só será disponibilizada na ativação P1.

- Reservar intenção nativa preparedCoverStorage/current sob inventário v13 antes
  de I/O. Conferir item M21/descriptor e namespaces/journals vazios na migração.
  Progresso v10 registra reservado/preparado e prova generation/metageneration.
- Uma capa por operação de materialização, limitada aos 16 MiB existentes;
  remontar frames autenticados, conferir SHA/tamanho, validar PNG com o codec
  existente sem recomprimir. RAM proporcional à capa, não ao projeto.
- Caminho canônico derivado de UID/ID novo, nunca recebido do pacote. Escrita
  create-only (ifGenerationMatch 0), metadata accepted false/private/no-store,
  sem URL/token. Retomada confere dono, bytes/hash e geração; não regrava.
- Descriptor/journal/progresso/recibo atômicos depois de reconferir provas.
  Ausência/legado não criam objeto. Encerrar em personas-integrate; raiz ausente
  e countReady false. APIs internas; dispatcher público ainda não expõe etapas.
- Cancelamento revoga autorização no Firestore antes do I/O. Cleanup v13 começa
  em cover-storage, antes de remover a intenção/bytes. Substituir objeto próprio
  por marcador vazio privado com geração/metageração condicionais, ou criá-lo
  com geração 0 se ainda ausente. O marcador permanece como reserva permanente:
  removê-lo permitiria que upload atrasado create-only recriasse bytes.
- Marcador conserva geração anterior para retry de remoção explícita da versão
  antiga, inclusive em bucket versionado. Nunca apagar marcador atual. Conferir
  geração/metageração já registradas; objeto estrangeiro/reatribuído após
  confirmação deve falhar sem sobrescrita. Enquanto resposta do upload for
  desconhecida, só adotar objeto com identidade privada integral da intenção,
  sob o contrato de que manutenção Admin também respeita o protocolo.
- Guardar prova do fence no progresso/recibo antes de seguir ao cleanup genérico;
  certificar namespace novo vazio. Preservar inventários v1–v12 e replay antigo.

## Tarefas e aceites

1. [x] Contratos de intenção/progresso v10 e inventário v13.
2. [x] Adaptador Storage privado: create-only, retomada, fence e versões antigas.
3. [x] Serviços de reserva/materialização e limpeza com provas/CAS/recibos.
4. [x] Testes dirigidos de bytes reais, ausência, formato inválido, falhas,
       resposta perdida, cancelamento/I/O tardio, gerações e privacidade.
5. [x] Revisão, ADR, documentação/evidência e commit local.

## Fundamentação e limites

Precondições oficiais de [Cloud Storage](https://docs.cloud.google.com/storage/docs/request-preconditions)
dão semântica create-only a geração 0 e protegem mutações por geração/metageração.
O marcador permanente é necessário porque uma ausência simples não distingue
cancelamento de caminho nunca usado. Nenhum custo de crédito ou pagamento muda.

PNG será validado com sharp já instalado; não introduzir limite de resolução
no contrato portátil nem reamostrar os pixels. Erro/limite operacional do codec
interrompe sem ativar ou omitir a capa.

A imagem fica accepted false e sem linha de biblioteca/uso. Publicação da mídia,
integração de personas, campos grandes/consumidores, certificação/ativação e
host/UI/roundtrip/validate integral continuam obrigatórios. Não declarar P1 ou
Writer V2 concluídos. Sem Rule/dependência/subagente/CI/push/PR/deploy novo.
