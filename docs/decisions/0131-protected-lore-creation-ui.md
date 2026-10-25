# ADR 0131 — Interface da criação protegida de lore

- Data: 2026-10-24.
- Estado: host/lista exportados e validados; entrada no compêndio pendente.
- Plano: [116 / M38c5r](../tasks/writer-v2/execucao/116-interface-da-criacao-protegida-de-lore.md).

## Host e campos

Oferecer BookLoreCreationEditor separado do host de edição. Compor exclusivamente
createLore/resumeLoreCreation da sessão Auth, sem SDK direto, captura fictícia,
fallback legado ou chamada produtora em efeito de montagem.

Reusar BookLoreLiteralFields recebendo apenas data. O editor existente continua
compatível; IDs/sourceToken não são necessários à apresentação. Nome e categoria
permanecem presentes; nova ficha começa privada. Compor os campos tocados sobre
o draft e validar pelo schema puro, preservando ausências, vazios, duplicados,
BOM/CRLF e texto grande, sem caps/trims novos.

Preparar congela o pedido e dirige a preparação até revisão. Campos ficam
somente leitura, mantendo navegação entre campos/itens. Criar exige clique
distinto. Pedido de apply sem resposta oferece verificar resultado por advance;
não reaplicar automaticamente ao retomar ou verificar. Notificar onCreated
uma vez por writeId, somente após o evento próprio confirmado.

## Recuperação e contexto

Acrescentar creationTicket à sessão Auth: leitura metadata de UID/writeId com
guarda antes/depois do I/O, sem chave ou claim. Conferir livro/writeId antes
de construir uma retomada ou encerrar seus pedidos. Texto só aparece após
readDraft autorizado e nova conferência de origem.

BookLoreCreationRecoveries pagina até 50 por conta, filtra livro/tombstones
completos e cobre loading/vazio/erro/retry/sucesso. Listar não abre texto,
reserva recursos ou dirige produção. Cancel solicitado é encerramento pendente;
somente jobsClosed permite rotular preparação cancelada.

Host usa useBookLoreActor: atualização de perfil preserva draft e troca do
actor SDK remonta/fenceia o conteúdo. Guardas de epoch/montagem conferem toda
resposta. Não renderizar texto devolvido para outra preparação/livro.

## Fechamento e foco

Cancel/discard possuem lock próprio e não aguardam produtor/chave/crypto.
Um failed-precondition esperado pode ser reconciliado; uma nova rejeição na
mesma ação encerra com erro preservado e exige retry explícito. Descarte pede confirmação, mantém ficha já aplicada
e só remove cópia após o protocolo nativo. Resposta tardia não repõe campos.

Confirmar foco em erro/aviso e devolver ao acionador, inclusive quando o botão
foi remontado pela troca do footer. Sair/rota/reload protegem texto sem confirmação;
estado aplicado ou cópia descartada não provoca aviso indevido de beforeunload.

Após cancel com cópia autorizada, permitir usar o draft em uma nova criação
por clique próprio, gerando outro writeId e conservando a recuperação anterior.
Não chamar isso de continuação automática do pedido cancelado.

## Composição visual e limites

Reusar Dialog/controles/tokens/CSS existentes; reservar o destaque destrutivo
para a confirmação do descarte. Tema acompanha classe e data-theme do provider.
Footer quebra linhas no celular; campos permanecem no corpo rolável.

Host e lista não estão montados na entrada legada. Completar exclusão nativa
do cliente antes da integração coordenada de edição/criação/exclusão no compêndio.
Lifecycle, consumidores/backup/rollout e validate de P1 continuam pendentes.
P1/F2-09/V2/fases 3–5 e gates humanos/comerciais abertos; somente commit local.

Chromium usa componentes/kit e executor reais, com ports Auth/Functions e
identidades de banco de fixture. Não certificar SDK/Auth/App Check reais,
leitor de tela, zoom físico 200% ou outro dispositivo por esses testes.
Sem backend/Rules/dependências/env ou rota de demonstração em produção.
