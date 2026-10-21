# F2-09 I — Importação revisada para nova aventura

**Estado em 2026-10-21:** contrato fechado e implementação liberada pelo integrador,
após revisão cruzada cliente/backend/QA sem P1/P2 remanescente. Decisão de
recuperação protegida recebida; 13 hashes e vetor AES reproduzidos independentemente.
Implementado, revisado e validado localmente; CI do novo incremento pendente.
Ver [entrega I](../../../entregas/2026-10-21-writer-v2-importacao-revisada-de-aventura.md).
**Origem:** [F2-09](../fase-02-criar-e-preparar/09-lore-importacao-e-portabilidade.md)
e [sequência executável](25-lore-importacao-e-portabilidade.md).
**Base:** lore L implementado/validado localmente em `2af6df5`, com expectativas
legadas corrigidas em `087bced`. CI geral 39607044458 e regras 39607044506 verdes
do head corrigido, após cancelamento inicial de um shard; evidência L preservada.
Sem merge/deploy.

## Objetivo e resultado confirmado

Criar uma nova aventura privada a partir de documento revisto. Cada seção
selecionada, na ordem confirmada, gera uma parte, uma cena e seu texto principal
virtual, sem duplicar a prosa como bloco adicional. A aventura só fica utilizável
após preparação completa e ativação atômica.

O operador escolheu em 2026-10-21 guardar **a revisão confirmada protegida no
dispositivo, sem guardar o PDF**. Isso preserva títulos, divisões, uniões, seleção
e texto confirmado para retomar um upload incompleto após reload. Não é autosave
do trabalho anterior à confirmação, nem sincronização de rascunhos entre aparelhos.

## Escopo e limites de produto

- PDF, DOCX, Markdown, texto e HTML continuam passando pelo parser local existente.
  A revisão permite conferir, selecionar, renomear, dividir e unir antes de gravar.
- No Estúdio, Importar Documento explicita o destino Livro ou Nova aventura.
  O gravador do livro mantém sua interface e comportamento; não criar livro
  intermediário para converter em aventura.
- A aventura recebe título/sinopse e universo opcional existente, seguindo os
  limites e a autorização do Estúdio. Toda prosa começa com audiência creator.
- Caixas de leitura, monstros e títulos de missão continuam prosa privada. Não
  inferir audiências, fichas de lore, pistas, missões, sessões ou imagens.
- Esta vertical cria somente nova aventura. Acrescentar ou substituir conteúdo
  de aventura existente exige outro contrato.
- PDFs originais não são enviados ou persistidos pelo fluxo; após reload, sua
  prévia visual exige reanexar o mesmo arquivo, sem impedir retomar a revisão.
- Acima do limite por seção, oferecer divisão explícita antes do primeiro envio.
  Nunca truncar nem alterar silenciosamente o conteúdo depois do hash confirmado.
- Não implementar IA, OCR, extração de mapas/imagens para biblioteca, publicação,
  backup/restauração ou exclusão integral de aventura.

## Evidência da descoberta

`ImportBookModal` conserva IDs e capítulos concluídos em refs, cria a raiz antes
de gravar os capítulos e não limpa o projeto ao cancelar depois de falha parcial.
Esse laço não atende à retomada/ativação/limpeza exigidas para aventura.

O parser e a revisão reutilizáveis ainda pertencem internamente a books.
Somente PDF fornece `blocks`; os demais formatos não oferecem hoje pontos de
divisão na conferência. O modelo também monta prévia segura, mas conserva
`content.trim()`; a revisão de aventura deve congelar exatamente o HTML seguro
que foi conferido. União atual herda seleção do primeiro trecho, podendo absorver
trecho desmarcado.

`Studio.createAdventure` testa apenas a existência da raiz. Escrever filhos sob
raiz ausente sem reserva global permitiria que outro escritor abrisse aquele ID
prematuramente. Não adotar flag incomplete/deleting numa raiz visível: os leitores
atuais e a máscara de listagem não formam um gate completo para esse estado.

A fonte principal de uma cena já projeta o bloco main. Não criar outra cópia em
sceneBlocks. Gates de cenas, blocos, histórico, progresso e captura exigem raiz
autorizada; essa fronteira pode proteger a materialização incompleta.

## Arquitetura mínima do cliente

Criar `features/document-import` como folha de shared, com modelo, parser,
PDF/layout/texto, conferência e prévia local. API pública oferece o resultado e
transformações existentes, com aliases de seção; books pode reexportar os caminhos
anteriores sem importar internos da feature nova. Não mover seu gravador para
um framework genérico.

Mover a função pura countWords de books/model/chapter para shared/lib, preservando
algoritmo e reexport legado. Isso evita dependência document-import → books.
Preservar a paridade existente com visibleWordCount do servidor.

Para formatos não PDF, derivar blocos dos nós superiores do HTML já sanitizado.
Preservar integralmente a representação segura produzida pelo parser, incluindo
listas e citações, sem achatar elementos ou reordenar texto. O sanitizador legado
já transforma tabelas; este incremento não promete recuperar a estrutura original
delas. A concatenação dos blocos precisa reproduzir o HTML seguro conferido.
Um trecho sem fronteira válida não recebe uma divisão fictícia.

Na aventura, união só é permitida entre trechos adjacentes com seleção igual.
Para unir selecionado e desmarcado, o usuário iguala explicitamente a seleção.
A conferência não incorpora conteúdo descartado implicitamente.

Criar `features/adventure-import`, folha de auth/shared/document-import e APIs
públicas necessárias. Studio compõe diálogo e painel de preparações por UID.
Orquestração, chave, journal e transporte ficam nessa feature, com APIs externas
e IndexedDB atrás de adaptadores. Não criar dependência books ↔ adventure-import.

## Protocolo de preparação e ativação

```text
uploading → preparing → ready → activated
     └──────────→ deleting → deleted
```

1. Revisar localmente; congelar projeto, fonte e seções selecionadas normalizadas.
   Gerar importId conhecido antes de enviar e reviewHash canônico.
2. Start idempotente cria o controle privado e uma reserva global persistente.
   AdventureId deriva de UID/importId/kind por SHA-256; nunca vem do arquivo.
3. Obter chave autorizada pela RPC dedicada. Cifrar a revisão e confirmar o seal
   durável no dispositivo antes de enviar qualquer seção.
4. Append sequencial recebe uma seção confirmada por chamada, com índice e CAS.
   Grava manifesto metadata e corpo final oculto sob a cena reservada, ainda sem
   raiz de aventura nem documento pai de cena utilizável.
5. Advance prepara uma seção por etapa: parte, cena, planejamento vazio e ledger
   coerentes. O main é virtual sobre body/current, tipo scene, audiência creator.
6. Ready exige todas as seções, cadeia de hashes, totais, ordem e contagem conferidos.
7. Activate cria raiz própria, vínculo de universo autorizado e recibo atomicamente;
   só então a aventura aparece como utilizável no Estúdio.
8. Cancel fecha admissão antes da limpeza. Advance remove recursos reservados em
   páginas limitadas; preserva fence/reserva terminal e jamais apaga projeto ativado.

A reserva global também deve ser conferida pelo escritor Studio.createAdventure.
IDs consumidos não são reutilizados. Toda escrita/limpeza revalida UID, job,
reserva, token e estado na mesma transação; late append/activate não ressuscitam
uma importação cancelada. Se activate vencer a corrida, cancel não exclui a obra.

Antes da rede, journal metadata guarda o fingerprint canônico do start. Resolver
um start incerto usa somente operationId, requestHash e intenção cancel: não exige
reconstituir projeto/sinopse antes de existir snapshot. O servidor compara esse
hash com o start conhecido ou instala fence para impedir start tardio.

JobToken deriva de UID, importId e createTime real do controle, sem confiar em
campo fornecido pelo cliente. Toda mutação usa operationId estável,
expectedCheckpoint e fingerprint canônico. Retry histórico é reconhecido antes
de exigir o checkpoint atual; nunca devolve prosa ou outra revisão para rebase.

Não usar um manifesto crescente no pai. Acumular cadeia por índice/título/hash/
bytes/contagem; o hash final também prende metadados e totais confirmados.
Nenhuma etapa lê ou grava todas as seções numa transação.

Materializar com inicializadores puros compartilhados dos modelos de cena/parte,
sem reproduzir uma versão divergente desses campos no importador. Ledger recebe
corpo explícito e grupos futuros; conta pronta antes da ativação. Não criar versões
históricas automáticas: a política vigente continua manual e antes de restauração.

## Fronteiras de persistência propostas

```text
adventureImportReservations/{adventureId}
users/{uid}/adventureImports/{importId}
users/{uid}/adventureImports/{importId}/sections/{index}
users/{uid}/adventureImportRecoveryKeys/{importId}
users/{uid}/adventureImportOperations/{operationId}
users/{uid}/adventureImportStartFences/{importId}
adventures/{reservedId}/scenes/{sceneId}/body/current
```

Os namespaces novos ficam fechados ao SDK direto, inclusive para o proprietário.
List/get retornam metadata por seleção explícita. PDF e prosa não entram em lista,
recibo, fence, cursor ou log. Corpos reservados ficam protegidos pelos gates da
raiz ausente; testar também leitura por endereço conhecido e criação concorrente.

No cancelamento, limpar corpos, partes, cenas, planejamento e ledger apenas pelos
IDs dessa reserva e sob seu token. Não invocar exclusão geral de aventura ou C4.
Concluir com controles mínimos terminais sem prosa/chave; C4 permanece v4.
A ativação conserva os corpos como definitivos, evitando duplicação e GC de prosa.

## ABI e revisão cruzada

O [adendo ABI 28](28-contratos-da-importacao-de-aventura.md) fixa DTOs, hashes,
recibos, cursores, HTTP e vetores independentes. Nove APIs específicas:

| API                           | Responsabilidade                                                           |
| ----------------------------- | -------------------------------------------------------------------------- |
| startAdventureImport          | Congelar descritor/hash, reservar IDs/keyId e criar controle               |
| resolveAdventureImportStart   | Consultar o mesmo start ou instalar fence contra start tardio              |
| listAdventureImports          | Descobrir preparações próprias, metadata paginada                          |
| getAdventureImport            | Consultar identidade, estado, contadores/checkpoint e resultado, sem corpo |
| appendAdventureImportSection  | Receber uma seção e avançar cadeia/CAS com recibo                          |
| advanceAdventureImport        | Materializar uma seção ou avançar limpeza limitada                         |
| activateAdventureImport       | Criar raiz/vínculo somente com preparação completa                         |
| cancelAdventureImport         | Fechar admissão e iniciar limpeza sem depender de ciphertext               |
| getAdventureImportRecoveryKey | Entregar chave somente após autorização específica                         |

Identidade comum:

```ts
Identity = { schemaVersion: 1, ownerId, importId, jobToken, adventureId };
RecoveryKeyInput = { importId, jobToken, reviewHash, expectedKeyId? };
RecoveryKey = Identity & {
  reviewHash, keyId, algorithm: 'AES-GCM', keyBase64
};
```

expectedKeyId é opcional apenas no primeiro seal e obrigatório para recuperar
snapshot existente. KeyId de 32 bytes hex é reservado no start; chave AES de 32
bytes nasce uma única vez pela RPC dedicada e fica vinculada a UID/jobToken/
reviewHash/keyId. Divergências falham, sem rotação silenciosa.

A chave só é entregue nos estados uploading/preparing/ready. Universo indisponível
não bloqueia recuperar prosa própria; vínculo é reautorizado ao ativar. Cancel e
activate removem a chave atomicamente; estados terminais nunca a recriam.
List/get/start/recibos não incluem chave. Oito APIs usam onCall; a entrega de chave
usa onRequest próprio, POST same-origin em /api/adventure-import/recovery-key,
com rewrite Hosting antes da rota SPA. Definir private,no-store na entrada, antes
de validar Auth/App Check, método e corpo. O cliente envia JSON como text/plain
para o parse manual ocorrer após os headers; resposta application/json. Erros
controlados 400/401/403/405/503 também carregam no-store. Testar o handler HTTP
real: a validação anterior ao callback de onCall não permite garantir esses headers.
Falhas de infraestrutura anteriores ao handler não emitem chave e não constituem
prova dos headers do handler. No desenvolvimento, proxy Vite somente da rota exata
encaminha à mesma função/região/projeto usados pelas callables. Usa a configuração
pública existente VITE_FIREBASE_PROJECT_ID, validada, sem variável ou dependência
nova. Headers de Auth/App Check são preservados; demais rotas seguem iguais.

Antes da implementação, completar no adendo ABI os campos exatos de cada uma das
oito operações restantes, DTOs de progress/receipt, enum de sourceMediaType,
normalização, hash/cadeia, datas, nullability e cursores. Criar vetores canônicos
independentes e limites equivalentes entre cliente e servidor.

## Snapshot protegido e retomada local

Envelope local fechado:

```ts
type ProtectedReviewSnapshot = {
  schemaVersion: 1;
  ownerId: string;
  importId: string;
  jobToken: string;
  keyId: string;
  reviewHash: string;
  sectionCount: number;
  nonce: Uint8Array;
  ciphertext: ArrayBuffer;
};

const aad = [
  snapshot.schemaVersion,
  snapshot.ownerId,
  snapshot.importId,
  snapshot.jobToken,
  snapshot.keyId,
  snapshot.reviewHash,
  snapshot.sectionCount,
];
```

AES-256-GCM usa IV novo de 12 bytes por seal, inclusive após tentativa interrompida;
tag de 16 bytes. Chave raw/CryptoKey apenas em RAM, nunca em localStorage,
sessionStorage, IndexedDB, journal, recibos ou logs. Plaintext contém somente
projeto, identificação da fonte e seções confirmadas, sem arquivo original.

Antes do primeiro append, aguardar transaction.oncomplete da gravação IndexedDB.
Falha de criptografia/capacidade/storage mantém a revisão em memória e bloqueia
envio. Não anunciar preservação antes de comprová-la.

A janela start confirmado → seal durável ainda não tem revisão recuperável após
reload. UI mostra preparação sem cópia local completa, permitindo cancelar ou
reconstruir/reconfirmar o mesmo hash. A escolha do operador não transforma essa
janela em autosave anterior à confirmação.

Na retomada: validar envelope, consultar metadata atual, conferir UID/jobToken/
reviewHash/keyId, pedir chave com expectedKeyId, revalidar o ator e só então
decifrar. Validar conteúdo, quantidade, ordem, bytes e hash antes de append.
PDF não é necessário para isso; reanexar original só habilita a prévia visual e
precisa conferir a identificação da fonte, sem substituir a revisão congelada.

Journal separado contém apenas intenção, ação, operationId, checkpoint, índice e
fingerprint. O append é reconstruído do snapshot protegido. Web Locks cobrem
reserva/CAS locais curtos; nunca ficam adquiridos durante HTTP. Limpar/alterar
estado compara o snapshot esperado e não afeta outro UID/job/token.

Fechar o diálogo preserva preparação, cancelar exige escolha explícita e acompanha
a limpeza. Troca de conta cerca continuations antes de renderizar/resolver dados.
Sem snapshot no novo dispositivo, servidor ainda permite retomar materialização
ou limpeza do que recebeu; não promete recuperar texto que só existia no outro.

Se a ativação já foi concluída e a resposta se perdeu, get confirma o resultado
sem exigir chave/ciphertext. Abrir a aventura existente somente após autorização;
não importar de novo. Cancelamento também funciona com snapshot ausente/corrompido.

## Limites técnicos

| Recurso                            | Regra                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| Prosa de cada seção                | Até 800.000 bytes UTF-8, sem truncamento ou trim após congelar           |
| Envelope de seção/corpo persistido | Até 900.000 bytes completos, incluindo overhead                          |
| Append/materialização              | Uma seção por chamada/transação                                          |
| Listas de metadata                 | Padrão 25, máximo 50; resposta limitada a 4 MiB                          |
| Limpeza                            | Até 50 documentos por etapa; cursor/checkpoint verificáveis              |
| Contadores/somas                   | Inteiros seguros; rejeitar overflow antes de gravar                      |
| Metadados do projeto               | Limites e normalização vigentes de Studio, antes do hash                 |
| Conteúdo agregado                  | Sem novo teto comercial por obra/seções; falha de capacidade é explícita |
| Histórico                          | Não criar versões automáticas na importação                              |
| Binários                           | PDF não entra no servidor ou snapshot local                              |

Uma seção válida não deve exceder o orçamento após inclusão dos campos
Firestore; medir envelope completo, não só HTML. Conteúdo legado maior continua
legível/exportável, sem migração automática. A importação nova oferece divisão ou
recusa antes de escrever, preservando revisão/arquivo em memória.

## Inventário previsto

| Área                               | Intervenção                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| document-import/model              | Tipos atuais, aliases de seção, normalização segura e divisão/união                           |
| document-import/services           | Parser dos cinco formatos, extração PDF/layout/texto e prévia local                           |
| document-import/components         | Conferência e PDF sob demanda, CSS próprio, rótulos de seção/capítulo                         |
| books                              | Reexports públicos compatíveis; modal e gravador legados preservados                          |
| shared/lib                         | countWords neutro, com reexport e paridade preservados                                        |
| adventure-import                   | Modelo/DTOs, callables/HTTP de chave, crypto, journal/IndexedDB, hooks, diálogo e preparações |
| studio                             | Escolha explícita de destino e composição das preparações                                     |
| adventures/model                   | Origem authored/imported conforme domínio; sem flag de projeto parcial                        |
| functions/adventureImportContracts | Validação, identidade, hashes, budgets e DTOs puros                                           |
| functions/adventureImport          | Start, recibos/fences, append, materialização e ativação                                      |
| functions/adventureImportCleanup   | Cancelamento/limpeza limitada por reserva                                                     |
| functions/adventureImportRecovery  | Chave e entrada autenticada no-store com testes HTTP                                          |
| functions/studio                   | Gate da reserva global em createAdventure                                                     |
| scenes/sceneContracts              | Inicializadores puros compartilhados, sem caminhos alternativos de autoria                    |
| index/package/regras/índices       | Bindings, sintaxe, fronteiras SDK fechadas e consultas limitadas                              |
| vitest.config.ts                   | Resolver a configuração Vite por contexto antes de merge, preservando todos os gates          |
| vite.config.ts                     | Proxy de desenvolvimento somente da rota exata de chave, mesmo projeto configurado            |
| firebase.json                      | Rewrite same-origin da chave antes da SPA, sem alterar os demais destinos                     |
| testes/fixtures                    | Contratos, SDK real, transportes isolados e jornadas curtas                                   |
| docs/ADR/AGENTS/entrega            | Regras, decisões e evidência real após fechamento                                             |

Os nomes de módulos novos são proposta de corte; evitar fragmentar sem necessidade
demonstrada. Não importar internos de outra feature nem criar domínio em shared.
Nenhuma dependência nova foi demonstrada como necessária.

## Sequência de implementação

1. Fechar ABI/normalização/hash/cadeia/chave e vetores independentes; revisar
   root/cliente/backend/QA e liberar explicitamente a implementação.
2. Extrair parser/modelo/conferência por API pública, mantendo regressões de livros.
3. Produzir blocos seguros nos formatos não PDF e fechar divisão/união/seleção.
4. Implementar reserva, start/resolver, consultas metadata e chave protegida.
5. Implementar append/materialização/ledger/ativação com identidades e CAS.
6. Implementar cancel/fence e limpeza paginada; concorrer contra pedidos atrasados.
7. Compor revisão e preparação de aventura; congelar/cifrar/persistir antes do envio.
8. Integrar recuperação, conta/abas, descoberta sem snapshot e resultado ativado.
9. Rodar os dirigidos afetados e corrigir; congelar fontes antes de SDK/nativo.
10. Executar matriz integrada, npm ci de Functions e npm run validate no fechamento;
    revisar diff, atualizar documentação, registrar entrega, commit/push com hooks.
11. Acompanhar CI em paralelo ao próximo incremento após fechamento local, conforme
    decisão do operador. Não chamar fase 2 ou V2 inteira concluída por esta vertical.

## Matriz de validação

Quatro famílias SDK com regras/Admin reais:

| Família                 | Provas principais                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Autorização/privacidade | Dono/intruso/anônimo, namespaces fechados, chave, reserva concorrente e filhos inacessíveis sem raiz                       |
| Paginação/ativação      | Mais de 25 seções, ordem/hash/totais completos, N partes/N cenas/N principais virtuais privados, zero adicionais inferidos |
| Retry/retomada/CAS      | Antes/depois do commit, operações congeladas, outra instância, checkpoint/payload trocados e resultado já ativado          |
| Cancel/fence/limpeza    | Antes/durante upload, resposta perdida, corrida com activate, limpeza retomável e outros projetos preservados              |

Frontend e unidades de Functions protegem limites reais de bytes/envelope,
corpo/hash, índices ausentes/repetidos/fora de ordem, cancelamento de análise,
troca de arquivo/conta, conteúdo ativo, arquivo vazio/inválido e estado completo.
Não usar fixtures como prova de idempotência: a fixture antiga de createChapter
ignora creationId.

Duas jornadas novas curtas em seis perfis: documento sintético → revisão →
aventura privada; preparação parcial → reload/retomada/cancelamento/limpeza.
AES-GCM e storage/Web Locks do navegador são reais, com transportes substituídos
somente no servidor visual. Casos curtos específicos exercitam lock livre durante
HTTP, ciphertext adulterado, pré-seal e perda local após ativação.

DOCX OOXML válido passa pelo Mammoth real; jszip já existe para construí-lo.
Markdown e regressões de livro são casos curtos em desktop, sem multiplicar todo
formato × tema. Preservar livro novo/existente, retry parcial, PDF sintético de
nove capítulos e rolagem de diálogo. Não aumentar timeout/retries ou reduzir gates.

Casos adicionais de recuperação:

- Nenhum append antes de seal durável; falha local não cai para plaintext.
- AAD/token/hash/nonce adulterados bloqueiam decifragem e upload.
- Chave só por RPC própria autorizada; cache não substitui autorização atual.
- Storage/IndexedDB/recibos/logs sem chave, PDF ou prosa em claro.
- Resposta de outra conta/job não altera o snapshot atual.
- Cancel pode limpar sem texto local; resultado ativado pode ser confirmado sem chave.
- Limpeza local faz CAS e não remove journal de outro UID/job/token.

## Corpora privados e limites da evidência

Os binários permanecem fora do Git e da rede. Arquivos confirmados:

- Phandelver: 21.126.626 bytes, 64 páginas.
- Manuscrito indicado pelo operador: 1.459.149 bytes, 327 páginas.

O integrador mediu ambos com PyMuPDF em 2026-10-21 e inspecionou páginas
renderizadas. Baseline estrutural: aventura 280.592 bytes UTF-8, maior página
7.122 bytes; livro 477.711 bytes UTF-8, maior página 2.098 bytes.
Esses números diferem levemente do ensaio pypdf anterior por método de extração;
não substituem a saída do parser Writer ou seu overhead HTML/JSON.

Evidência privada em
`C:/Users/gaabr/.codex/visualizations/2026/10/12/01a131c1-057d-7721-88fb-d2454dec09b9/writer-v2-adventure-import-qa`.
Foram inspecionadas páginas 1/8 do livro e 2/6/14 da aventura, verificando
coluna simples versus duas colunas, caixas, listas e hierarquia. Nenhuma página,
prosa ou binário entra na documentação versionada.

O teste legado WRITER_IMPORT_PDF é específico de Phandelver: sete seções e mapas
nas páginas 5/13/43. Nunca apontá-lo para o manuscrito do operador. Criar prova
separada desse manuscrito, com expectativas medidas no parser real.
Não confundir PDF sintético de nove capítulos com um arquivo real do usuário.

Baseline Writer anterior a I: o teste legado de Phandelver real passou em
2026-10-21 no desktop escuro, 1/1, sem retry/skip, 8.115 ms de teste e
10.929,528 ms de relatório. Confirmou sete seções, mapas 5/13/43, hierarquia,
caixa de leitura, atributos e prévia original. Collector: zero erros de runtime e
zero pedidos externos; captura inspecionada pelo integrador. Artefatos
phandelver-before-import no diretório privado acima. Não demonstra a gravação I,
a compatibilidade do manuscrito de 327 páginas ou a regressão após a extração.

Medição separada pelo parser Writer real no Chromium, antes de I, sem mocks do
parser: manuscrito de 327 páginas produziu **uma seção**, 3.627 blocos e 77.618
palavras; 504.481 bytes HTML (envelope simples de medição 504.527 bytes), em
1.297,8 ms. Há pontos de divisão manual, mas os capítulos não foram reconhecidos
automaticamente; não declarar estrutura de capítulos recuperada. Phandelver
produziu sete seções, 45.338 palavras, 298.744 bytes HTML totais e maior seção de
69.493 bytes, em 748,8 ms. Ambos ficaram abaixo do limite técnico de seção e
registraram zero erros de runtime/pedidos externos. Os envelopes completos do
protocolo ainda precisam ser medidos na implementação. Relatórios privados
private-book-writer-before.json e private-adventure-writer-before.json conservam
métricas/hashes, sem prosa. O primeiro lançamento do script de medição falhou no
loader ESM Windows antes de abrir servidor; o import file URL foi corrigido somente
no script externo, e a execução seguinte concluiu os dois arquivos sem mudar produção.

## Referência de esforço e riscos

Horas humanas O/C/P, confiança baixa; não são horas realizadas, saldo ou data:

| Parcela sem sobreposição                     | Otimista | Central | Pessimista |
| -------------------------------------------- | -------: | ------: | ---------: |
| Backend, contratos e unidades próprias       |     26 h |    44 h |       72 h |
| Cliente, snapshot e unidades próprias        |     30 h |    50 h |       86 h |
| QA integrada, regressões/corpora e evidência |     22 h |    38 h |       64 h |
| Total I                                      |     78 h |   132 h |      222 h |

A 20 h/semana, equivalem somente a referência de capacidade de 3,9/6,6/11,1
semanas humanas, sem compromisso de calendário. I reabre sua parcela na baseline;
não somar novamente ao subtotal histórico. O saldo de F2-09 não está consolidado.

Riscos principais: reservas ignoradas por escritor concorrente; filhos parciais
expostos por raiz antecipada; deriva dos modelos de cena/ledger; upload sem cópia
durável; perda de chave ou nonce reutilizado; metadata crescendo sem limite;
normalização após o hash; divisão não PDF que altera listas; cancel tardio apagando
projeto ativado; corpus privado confundido com sintético; storage local incapaz.
Cada risco tem um gate ou caso negativo descrito acima.

## Portão de implementação

- [x] Decisão do operador sobre revisão confirmada protegida, sem PDF.
- [x] Descobrir reuso do parser, limites do laço de livro e pontos de divisão.
- [x] Separar raiz ausente/reserva/ativação e principal virtual da cena.
- [x] Medir corpora e conferir layout, sem declarar compatibilidade do parser.
- [x] Fechar ABI completa, seam HTTP de chave e vetores canônicos.
- [x] Revisar este plano entre cliente, backend, QA e integrador.
- [x] Concluir/envio da correção local L no recorte autorizado, acompanhando CI.
- [x] Integrador liberar implementação após os itens anteriores, sem esperar CI verde.

Nenhuma autorização de merge, deploy, migração ou exclusão de dados reais por este
documento. Pilotos humanos e habilitação comercial continuam pendentes nas fases próprias.

## Responsabilidades da implementação liberada

Backend implementa Functions/modelos puros compartilhados, reserva Studio,
bindings, regras/índices e suas unidades. Cliente implementa src/document-import,
adventure-import, integração Studio e regressões de books com unidades próprias.
QA implementa somente novas provas SDK/nativas e seus transportes isolados após
alinhar as APIs reais; fixtures não substituem prova de autorização. Integrador
mantém configurações Hosting/proxy Vite, documentação, revisão e fechamento.
Não compartilhar arquivos em escrita sem combinar; suítes com cobertura, emulador
e jornadas nativas só após coordenação/congelamento. Nenhum agente faz Git,
merge, deploy ou altera thresholds/retries/timeouts. Runners dirigidos sem
cobertura podem ocorrer em arquivos próprios; validate integral pertence ao integrador.

## Evidência histórica durante a implementação

As primeiras rodadas abaixo antecedem o fechamento local registrado ao final.
Backend pronto e congelado para integração:
77 testes únicos positivos (17 novos, 60 regressões). Depois de 76/76 iniciais,
o reforço de recibos repetiu somente 12 afetados, 12/12 positivos. Recibos têm
projeção fechada; preparedChainHash amarra preparação ordenada ao hash congelado.
Nenhuma alteração no algoritmo do ledger ou no C4. ESLint/sintaxe/formatação verdes.

SDK I: quatro famílias únicas positivas. Seis execuções, quatro passes e duas
falhas iniciais de arranjo, zero skips/retries: primeira rodada 2/4, 37.168,8114 ms;
repetição somente famílias 2/4, 2/2, 26.326,7371 ms. O roteiro chamou a API legada
de blocos com target em vez de adventureId e reutilizou IDs de operação entre
jobs; os dois arranjos foram corrigidos sem modificar produção. Dez fontes de
servidor/regras/índices permaneceram com hashes iguais. Spec final
4d64695ca8797731f4dd3546cdbd851f59509a173054c499f34bc6c9a460db21.
O HTTP percorreu raw/onRequest real, com verificadores Auth/App Check injetados;
não é prova de autorização Google em produção. Emuladores temporários encerrados.

Proxy Vite real dirigido passou com upstream HTTP sintético local: rota exata,
headers Auth/App Check e no-store preservados; rota vizinha não encaminhada.
Trim/fallback do projectId e rejeição de ID inválido conferidos, rewrite Hosting
antes da SPA. Não comprova Hosting implantado. Vitest precisou resolver a factory
Vite antes do merge; configuração corrigida, sete testes de ambiente positivos,
sem alterar cobertura/isolamento/workers/exclusões. Prettier sofreu um lock Windows
transitório e a repetição dirigida concluiu com exit0.

Nesse checkpoint o frontend ainda estava em correção; nativo e validate integral
não haviam sido executados. O fechamento abaixo substitui somente esse estado. Artefatos privados sdk-verified.json, sdk-source-freeze.json,
sdk-directed-freeze.json e development-proxy-result.json ficam no diretório I
registrado acima. Falhas iniciais, logs e relatórios foram preservados.

## Fechamento local — 2026-10-21

Implementação e revisão concluídas. Validate final exit0: 2.123 testes frontend
em 204 arquivos, 85 scripts, 444 Functions, cobertura 90,69/85,06/90,25/93,34%
(statements/branches/functions/lines), lint/tipos/build/smoke verdes. O primeiro
validate também foi verde, antes de dois P2 encontrados na revisão final:
vínculo local antes de clear/execute e remoção de sinopse temporária terminal.
Correções dirigidas passaram, seguidas do validate final; limites preservados.

SDK: quatro famílias únicas positivas, oito execuções com seis passes e duas
falhas iniciais de arranjo preservadas; repetição final somente 2/4, 2/2 positiva.
Nativo: 16 combinações novas únicas positivas e cinco legadas. Total 24 execuções,
22 passes e duas falhas iniciais; zero retry/skip/flaky e 24 coletores sem erros
ou pedidos externos. Matrizes, falhas, capturas e limites constam na entrega.

Corpora antes/depois têm hashes, seções, palavras e avisos iguais no parser real.
Preflight completo: manuscrito327/1 com maior RPC504.707/corpo506.630 bytes;
Phandelver64/7 com RPC69.735/corpo71.644. Zero chamadas de servidor, PDFs/prosa
fora do Git. Manuscrito continua uma seção, sem capítulos detectados automaticamente.

67 fontes congeladas, incluindo a descrição de aventura importada e ambos P2;
revisão final cruzada sem P1/P2 remanescente. SDK/browser/proxy são provas locais
com limites distintos, sem autorização Google/Hosting live ou piloto humano.
CI do novo commit continua pendente; não impede planejamento do próximo incremento.
F2-09, backup e IA não estão concluídos. Sem merge/deploy.
