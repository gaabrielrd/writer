# P1 / M38c5h — Controles e cancelamento de lore sem chave

## Objetivo e fronteira

Persistir os controles de todos os jobs da edição, em metadata sem prosa,
e fechar a operação após recarga/revogação da chave/origem. Preservar draft,
checkpoint, pedido produtor incerto e chave; reconhecer adoção própria que
venceu o cancelamento. Um RPC por avanço, sem enviar ao abrir.

Próxima composição continua sendo write-ahead/acks automáticos de produção,
reserva/sessão/host e rollout. Não anunciar edição visual recuperável aqui.

## Requisitos e sequência

1. Capturar mapa fechado por identidade/intenção, páginas até 50, IDs/hashes
   determinísticos e digest. Gravar cada página/lookup e contador atomicamente
   em IDB/CAS/oncomplete; ready só após mapa completo. Retry aceita apenas o
   mesmo mapa. Não persistir manifestos de texto, prosa, chave ou credenciais.
2. Usar records metadata separados logicamente de ciphertext no store existente;
   lookup de upload por ID e leitura por índice limitados, sem varrer todo o
   catálogo em cada avanço. Não mudar versão do banco ou relaxar crypto.
3. Registrar hash da edição antes do seu start RPC, imutável e ligado ao mapa.
   Preservar legado sem inventar controles. Mapa parcial não pode iniciar cleanup.
   Quando houver mapa, verificar produção contra controles prontos antes do envio.
4. Máquina de cleanup metadata com cursor e pedido exato persistido antes de
   RPC, independente de produtor/crypto pendentes e de signal abortado.
   Guard de conta/contexto permanece obrigatório em todo I/O.
5. Consultar edição registrada antes de limpar filhos; adoção própria para
   imediatamente. Ausência permite fence; conflito do cancel consulta metadata,
   preserva cancel original para retry e nunca repete produção para cancelar.
6. Fechar pai, uploads e inspeção. Conferir DTOs/IDs/hashes/tokens/contagens,
   blockedReason fechado e adoção própria. Persistir progresso e confirmação
   de antigos pedidos cleanup/diagnostic juntos. Respostas perdidas repetem
   wire/CAS exatos, inclusive após recarga; um avanço faz no máximo um RPC.
7. Reconciliar pedidos metadata legados conhecidos sem sobrescrever pendência,
   inclusive fora do cursor atual; deixar produtor incerto preservado até
   fechamento nativo. Nenhuma revogação ou coleta automática de draft/checkpoint.
8. Expor avanço pela sessão Auth com UID capturado/guard; testes com serviços
   reais sobre double e IDB/Chromium reais, perda de resposta em cada classe,
   revogação, concorrência, corrupção/conta/aba e rollback.
9. Revisão/ADR/docs/evidência e commit local; checks afetados, validate no fim
   de P1. Sem CI/push/deploy.

## Arquivos, riscos e critérios de aceite

Contratos/mapa/worker de controles, journal/header/store/sessão/barrel, testes
e docs. Sem backend, Rules, dependências ou interface. Reutilizar whitelist,
parsers de progresso e contrato dos jobs nativos.

Mapa deve preceder novos RPCs no host futuro. API interna legada sem mapa
continua sem promessa de recuperação integral; não a habilitar na interface.
Registrar edição depois de cleanup iniciado é recusado para impedir job tardio
desconhecido. Get/cancel/cleanup são somente metadata, nunca grant de leitura.

Aceite: conta original recupera controles sem chamar getKey/decrypt, fecha
todos os jobs conhecidos ou confirma adoção própria, com retry/CAS e um RPC
por passo. Dados próprios/recibos/clock/crédito preservados. Mapa parcial,
origem/ID incoerentes e respostas inválidas não causam produção ou descarte.
Ciclo de vida da chave/host/write-ahead/P1/F2-09/V2 e fases seguintes seguem
abertos até evidência própria.

## Resultado do incremento

Contratos, mapa paginado/lookups e worker de cleanup metadata implementados,
com integração no journal/sessão e guarda dos vínculos antes de produção.
Reconhece pai conhecido/start incerto legado, trata ausência com fence e
reconcilia pedidos sem chave/prosa, com um RPC por avanço e ACK atômico.
Draft/produtor incerto/recibos permanecem; adoção própria encerra sem limpeza.

114 Vitest distintos e dois cenários Chromium positivos em rodadas; checks
dirigidos. Veja [ADR 0121](../../../decisions/0121-keyless-cleanup-of-manual-lore-edits.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-controles-e-cancelamento-de-lore-sem-chave.md).
Próximo: write-ahead/acks automáticos, reserva/sessão/host e ciclo de vida
integrado. Legado sem mapa não vira recuperável. P1/F2-09/V2 seguem abertos;
validate no fechamento de P1. Só commit local, sem CI/push/deploy.
