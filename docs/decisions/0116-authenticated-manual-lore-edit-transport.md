# ADR 0116 — Transporte autenticado da edição manual de lore

- Data: 2026-10-24.
- Estado: aceito internamente; sem implantação ou host habilitado.
- Plano: [101 / M38c5c](../tasks/writer-v2/execucao/101-transporte-autenticado-da-edicao-de-lore.md).
- Antecedente: [ADR 0115](0115-unit-coordination-of-book-lore-edits.md).

## Contexto

O coordenador por unidade já mantém pedidos/CAS/bytes, retry e cancelamento,
mas recebe um port injetado. Expor serviços internos indiscriminadamente
permitiria alcançar operações e IDs reservados de outros coordenadores.
O transporte deve preservar a autenticação vigente e a intenção congelada.

## Decisão

A callable bookLoreEdit usa envelope fechado method/input e lista pura,
imutável, de 18 operações: inspeção, campo e edição manuais, com get metadata.
UID vem somente de request.auth; autoriza antes de validar o envelope.
IDs primários e referências de inspeção/uploads exigem os prefixos manuais
lore-source/field/edit-<hash> de M38c5b. Proíbe criação e IDs reservados da análise,
inclusive get/cancel/cleanup. Não despacha propriedades herdadas ou nomes livres.

O roteador escolhe somente a factory correspondente e encaminha input
integral, sem normalizar, clonar ou substituir CAS. Serviços existentes
continuam decidindo domínio, origem/provas nativas, replay, adoção e cleanup.
O envelope não concede grant nem transforma unidades em transação agregada.

Entry usa o wrapper regional existente: App Check obrigatório, timeout servidor
120 s, memória 512 MiB, sem segredo ou provedor. Rota antecipada evita criar
serviços alheios. Respostas do handler e seus erros de domínio recebem
private/no-store e Vary Authorization. Rejeições anteriores do middleware
retornam erro genérico do SDK sem eco de dados. Preflight CORS permanece no SDK.

bookLoreEditSession captura objeto da conta, UID e guard de contexto. Prepare
força UID capturado e combina guard do host com o da sessão. O port confere
contexto antes/depois de httpsCallable regional, usa timeout de 130 s e
devolve somente data. Falha não consulta escritor SDK legado ou leitor público.
Troca de conta, inclusive objeto novo com mesmo UID, invalida resposta;
coordenador mantém seu pedido incerto para reconciliação autorizada.

## Evidência e consequências

Node verifica fronteira, isolamento por UID e callable exportada por HTTP.
Mensagem Unauthenticated do SDK distingue rejeição App Check da autorização
do handler. Testes diretos do handler exercitam auth/argumentos sem I/O.
Preflight real confirma origem/headers exigidos pelo navegador.

SDK Firebase real no Chromium percorre callable HTTP e serviços reais sobre
double transacional em loopback. Auth fixa e App Check desabilitado existem
somente nesse harness: sucesso com tokens reais continua sem certificação.
Ele confirma serialização multipart/literais, retry e cancelamento pendente;
não comprova Firestore nativo, UI ou implantação.

Sem mudança em Rules, contratos de armazenamento, crédito, dependências ou
política de persistência. Host visual e recuperação protegida após recarga
continuam necessários. Demais writers/consumidores/backup/ativação devem ser
integrados antes de rollout conjunto; o export novo não autoriza deploy.
P1/F2-09/V2, fases 3–5 e condições humanas/comerciais continuam abertos.
