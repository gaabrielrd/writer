# ADR 0124 — Host literal e descarte local da edição de lore

- Data: 2026-10-24.
- Estado: implementado internamente; entrada produtora ainda não ativada.
- Plano: [109 / M38c5k](../tasks/writer-v2/execucao/109-interface-e-descarte-da-edicao-manual-de-lore.md).
- Antecedente: [reserva e liberação](0123-discoverable-lore-recovery-reservations.md).

## Interface e preservação

BookLoreManualEditor compõe captura C1 bruta e sessão de edição, sem converter
pelo LoreEntity normalizado. Campos tocados são explícitos; ausência/vazio,
BOM, espaços e campos intocados permanecem. Sem caps herdados de nome/
resumo/detalhes/aliases/relações. Arrays são editados por item e características
por chave; retirar campo é diferente de esvaziar. Textarea conserva fragmentos
CR/CRLF intocados quando o navegador fornece LF; inserções novas vêm do input.

Prepare congela a intenção, dirige cópia e unidades até ready; aplicar exige
clique próprio. Navegação e cópia dos campos congelados permanecem possíveis.
Erro conserva handle e oferece retry. Retomada verifica UID/livro/ficha antes
de abrir o draft autorizado. Cancel fecha jobs conservando chave/cópia;
reutilizar rascunho cancelado cria nova intenção sem rebasear o CAS original.

Fechar e navegar pelo router exigem confirmação quando há dados/pedidos.
beforeunload cobre saída do navegador. Texto ainda sem cópia nunca é anunciado
salvo. Lista paginada de recuperações filtra o livro e esconde somente tombstones
completos; não lê prosa para listar. Escopo/conta e callbacks são fenceados.

Identidade de montagem acompanha o actor SDK, além de UID/escopo. Alterar
metadados do perfil (como créditos) conserva o rascunho; substituir actor,
inclusive com mesmo UID, desmonta e revalida. Não usar identidade do objeto
UserProfile como prova de troca de conta.

## Purga explícita e limitada

discard registra intenção monotônica no ticket e usa fechamento/liberação
existentes. Só com jobs fechados e prova de revoked inicia purga local.
Nenhuma leitura da chave/decrypt e nenhuma remoção de corpos/recibos nativos.

Cada passo remove até 50 records frames/controls do prefixo exato UID/writeId.
Locks curtos de preparação/journal e transação dos três stores conferem stamp,
identidade e prova. Primeiro lote remove o header junto com frames/contador/
marker, fenceando escritores privados antigos. Criação de journal consulta
ticket e recusa qualquer intenção de descarte, impedindo renascimento.

Tombstone metadata é permanente, com estados requested/purging/complete e
contador monotônico. Retry em outro handle continua pelo próprio prefixo;
abort reverte head/frames/contador juntos. Marker completo é conferido contra
ausência real de header e frames antes de reportar descarte verificado.
Namespace inesperado ou identidade contraditória é preservado e recusado.

Não apagar dado de outra operação/conta, referência ativa, original ou lore
aplicado. Escritor que ainda aguardava chave/RPC falha depois no guard/CAS e
não recria conteúdo. JavaScript não promete apagar fisicamente strings da RAM;
a purga trata armazenamento persistente e libera referências do controller.

## Estados e autorização

Produtor e encerramento têm controles independentes no host. Cancel/descarte
ficam acessíveis durante key/RPC pendente. Reply tardio do produtor não troca
o resultado do encerramento; adoção vencedora é mostrada e preservada.
Descarte exige confirmação própria e não é disparado ao fechar/desmontar.

Serviços mantêm Auth/HTTP/IDB. Componentes usam kit/temas, foco, estados
loading/vazio/erro/sucesso e router de dados do aplicativo. Nenhuma dependência
ou configuração nova. Registro de preparação continua schema 1, com campo
discard opcional normalizado; banco conserva versão 2.

## Evidência e ativação

Veja a [entrega](../entregas/2026-10-24-writer-v2-interface-e-descarte-do-lore.md).
Testes dirigidos e três jornadas Chromium usam React/kit/router/IDB reais e
serviços backend sobre double. Facades de sessão substituem Auth/SDK no
browser; não são prova de produção. Temas e viewport móvel inspecionados.

Componentes exportados, ainda sem entrada no compêndio legado. Sua ativação
depende do passo 6 do plano 81: writers Admin/Rules/drenagem coordenados.
Exclusão da chave com livro, demais consumidores/backup/ativação/rollout,
P1/F2-09/V2, fases 3–5 e condições humanas/comerciais permanecem abertos.
Validate integral no fechamento de P1; sem CI/push/deploy.
