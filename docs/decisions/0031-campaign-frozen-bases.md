# ADR 0031 — Base congelada de campanha e captura retomável

**Estado:** aceita e implementada em F2-07 B, com validação local verde; CI do envio pendente.
**Data:** 2026-10-15.

## Contexto

O operador escolheu copiar a aventura completa e somente fichas de lore
explicitamente referenciadas. Duas mesas devem preservar o original e manter
bases próprias. Uma aventura pode exceder uma transação ou resposta HTTP; guardar
somente seu ID ou um array crescente não satisfaz congelamento, paginação e retomada.
Ver [contrato executável](../tasks/writer-v2/execucao/15-captura-de-aventura.md).

## Decisão

Preparar campanha em users/{uid}/campaignPreparations e geração permanente em
users/{uid}/campaignBases, com schemaVersion 1. Checkpoint é a revisão monotônica
do controle mutável; itens são snapshots imutáveis sob o schema da geração.
Somente a ativação cria campaigns/{id}, original/activeBaseId, vínculo de universo
e geração ready na mesma transação. IDs reservados permitem conferir resposta de
ativação sem duplicar seu algoritmo no cliente nem expor campanha parcial.

Capturar partes, cenas, blocos, planejamento, narrativa, arquivo, textos e imagens.
Texto legado permanece separado; principal pode compartilhar o manifesto do corpo
da cena. Capturar união canônica de referências explícitas de cenas e narrativa,
sem detecção de nomes ou expansão pelas relações de fichas. Guardar vínculos em
filhos flat, sem arrays crescentes. Não copiar histórico, metas, checklist ou atividade.

Conferir token preciso da origem em cada passo e ativação. Origem alterada aborta
duravelmente, sem rollback por exceção e sem trocar silenciosamente o token.
Metadados usam páginas de 25/50; um corpo por transação, até 2 MiB preparado;
chunks UTF-8 de 64 KiB; respostas até 4 MiB. Conteúdo não é truncado.

Separar versão do conteúdo de autorização atual. Uma edição normal do original
não atualiza nem bloqueia uma base pronta. Leitura exige campanha/aventura próprias
atuais; fichas também exigem universo/ficha originais disponíveis. No escopo own-only,
privacidade pode ser reautorizada quando o UID continua dono integral. Essa exceção
não autoriza futuras compras, grants ou jogadores. Descartar/comparar variantes
futuras terá o mesmo gate; notas próprias ficam separadas.

Corpos e relações passam pelo servidor antes de resposta. Relação só aponta para
ficha capturada/autorizada, com título congelado; alvo indisponível sai inteiro.
SDK direto permanece negado. Token público comum vincula geração/projeção; cursores
também observam as relações autorizadas do recurso para impedir composição mista.
O cliente valida chunks/bytes/hash e mantém derivados somente em memória.

Imagem usa pin próprio campaign-base e identidade Storage de geração, com alt e
legenda por bloco. Escritores da aplicação não editam os bytes de imagens aceitas;
SDK Storage não pode gravá-los. Não presumir bucket versioning nem recuperação de
geração perdida: alteração externa produz indisponibilidade. Mídia é reautorizada
antes/depois do I/O, derivada com limites e entregue sem URL permanente ou caminho.

Preservar método/ID/payload/checkpoint e identidades esperadas antes da rede, com
escopo UID. Resposta incerta repete o mesmo pedido. Lista de preparações do servidor
permite retomada noutro dispositivo; controles locais pendentes também aparecem
quando a ativação/limpeza já os retirou dessa lista. Não ocultar estado desconhecido
por incluir campanhas ativadas artificialmente entre preparações do servidor.

Cancelar/abortar revoga a preparação e limpa seus filhos/pins em lotes retomáveis,
mesmo sem a origem. Bases prontas não expiram silenciosamente. Exclusão integral,
variantes e atualização explícita têm etapas próprias posteriores de F2-07.

## Consequências

Preparação tem mais documentos e pedidos, mas custo acompanha o conteúdo capturado;
não varre o universo inteiro. Corpus grande permanece íntegro e nenhuma campanha
parcial aparece pronta. Falha de mídia ou fonte mantém retomada/limpeza explícitas.
Vínculo organizacional pode mudar sem alterar a procedência da base.

Firestore SDK prova transações e negação direta. Storage injetado nos testes locais
não comprova bucket/credenciais de produção. Navegador comprova composição e
recuperação do cliente. Pilotos humanos, comércio e implantação conservam seus gates.
