# F2-09 P1 M7 — Origem de universo sem cópia global

Contrato de implementação em 2026-10-21 sobre 296ce1e. P1/F2-09 abertos.
Grafo consultado primeiro, helpers recentes ausentes; universes e captura M3b
conferidos nas fontes atuais. Regra atual de acesso: authorId próprio e raiz
de universo não deleting. Não antecipar compartilhamento/papéis.

## Objetivo

Capturar a referência ao universo original com encarnação nativa, sem duplicar
universo/lore global e sem usar arquivo como grant. Preservar backup de dados
próprios quando a origem vinculada estiver indisponível.

## Contrato

Uma callable somente de leitura getBookBackupUniverse recebe bookId/sourceToken
e expectedUniverseToken opcional. Nunca aceita universeId/caminho arbitrário.
Reautoriza livro ativo próprio e fixa sua origem M3b em transação. Resolve o
vínculo atual da raiz, validando o formato de ID já exigido pelo domínio.

Três descriptors portáteis fechados: kind none; kind reference com id e created
nativo (seconds/nanoseconds exatos); kind unavailable com somente id.
Vínculo ausente/null produz none. Universo ausente, deleting ou de outro autor
produz unavailable, indistinguíveis no resultado. Vínculo malformado falha, sem
construir caminho arbitrário ou omitir silenciosamente.

Ler somente authorId/deleting do universo por máscara; não carregar nome,
descrição, lore ou subcoleções. Para referência autorizada, token privado fixa
origem de livro, UID e identidade nativa integral de universo. Para unavailable,
token fixa somente origem/descriptor, sem hash de metadados da origem alheia.
Não revelar alterações de uma raiz não autorizada por mudança desse token.

O descriptor native created é identificação, não autorização. Futuro restaurador
deve conferir a mesma encarnação e acesso atual na transação de ativação junto ao
vínculo/contador estritos. Reference nunca recria universo. Unavailable nunca é
promovido por reaparecimento do ID durante restauração; exige nova decisão fora
dessa confirmação. Legados sem encarnação continuam com aviso explícito de
ausência de prova; seu leitor ainda será implementado.

Cliente captura um único registro book-universe, id do livro, schemaVersion 1
e origin; tokens/UID não entram no arquivo. Prova privada fixa source/origin/token;
verifyBookBackupUniverse reautoriza source e exige o mesmo token/descriptor após
as demais seções e antes do selo M2. Mudança de vínculo, disponibilidade,
encarnação ou versão autorizada invalida. Nenhum I/O de mídia/global.

## Arquivos e sequência

1. bookBackupUniverse(.mjs/.d.mts) puro para descriptor fechado; novo
   bookBackupUniverseRead servidor, dispatcher e syntax check Functions.
2. book-portability bookUniverseCapture/Callables e interface pública.
3. Functions/cliente: none/null, autorizado, inacessível, ownership/deleting,
   ID malformado, timestamps nativos, recriação/edição com raiz imóvel,
   transparência de unavailable, hash/prova/sessão/abort e sink aguardado.
4. SDK real: máscaras/timestamps, writers reais de universo/vínculo,
   isolamento e mutações entre captura/conferência.
5. Chromium com emulador compõe M3b–M7 em M2 e prova recusa de selo após
   mudança de origem. Fixture não é UI/sink persistente/restaurador.
6. Build/checks dirigidos, revisão, ADR/docs/entrega/AGENTS e commit local.

## Limites

Sem gravações, coleções, Rules, permissões, créditos ou dependências novas.
Não implementa ativação/restauração ou prova de direitos a partir do arquivo.
Mídia, rascunho, schema integral/leitor legado, sink persistente, revisão,
preparação/remapeamento/cleanup e recuperação continuam em P1.
Validate completo no fechamento P1, sem CI/push/deploy. Não fecha tarefa ampla.

## Resultado local

Implementado descriptor fechado com origem M3b, máscara de autorização e criação
nativa precisa. Functions 8/8 após corrigir duas expectativas de teste; cliente
14/14, SDK cinco cenários e Chromium 14 cenários positivos, compondo 156 registros
e 58 versões. Alteração/recriação de universo com livro imóvel impede selo.
Build e checks dirigidos passaram; [entrega M7](../../../entregas/2026-10-21-writer-v2-origem-de-universo-no-backup.md)
e [ADR 0051](../../../decisions/0051-book-universe-origin.md) registram os limites.
Religação na restauração continua pendente; P1/F2-09 abertos, sem CI/push/deploy.
