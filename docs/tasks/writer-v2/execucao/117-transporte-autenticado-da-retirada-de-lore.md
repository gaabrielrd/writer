# P1 / M38c5s — Transporte autenticado da retirada de lore

## Objetivo e requisitos

Fechar a entrada de rede do serviço nativo de retirada antes de construir
executor recuperável e confirmação visual. Inspeção não retira a ficha;
startBookLoreRemoval efetua a retirada irreversível e só poderá ser acionado
pelo futuro host após confirmação explícita.

1. Endpoint bookLoreRemoval separado, Auth e App Check obrigatório pelo
   wrapper regional existente, no-store e sem segredos ou débito.
2. Allowlist congelada de sete métodos: quatro de inspeção e três de retirada.
   IDs lore-removal-source e lore-removal com hash hexadecimal de 64 caracteres.
   Rejeitar namespaces da análise, edição e criação e referências cruzadas.
3. Transportar somente contratos nativos; não aceitar UID, timestamp, cursor
   físico, campos de texto ou autoridade do chamador. O servidor reabre a
   inspeção original, confere sourceToken e gera tombstone/clock/recibos.
4. Cliente captura actor e host, verifica antes/depois de cada I/O, congela o
   input antes de enviar e nunca tenta novamente ou muda de origem sozinho.
   Consulta metadata da fonte pelo leitor autorizado, sem baixar prosa.
5. Testar namespace/envelope/Auth, trilha nativa inline/v1/v2, replay após
   resposta perdida, CAS e isolamento de conta. Validar sessão/metadata,
   regressões de edição/leitura e SDK real quando disponível.

## Arquivos e sequência

1. Este plano; contratos puros de métodos e transport service em functions.
2. Registrar headers/dispatch/export no wrapper index.mjs.
3. Expor metadata no ReadClient e sessão Auth interna de retirada em lore.
4. Testes backend/cliente direcionados, tipos/build/checks e revisão.
5. ADR 0132, arquitetura/testes/AGENTS/execução/evidência e commit local.

## Suposições, riscos e não escopo

O serviço interno e inventário de limpeza permanecem canônicos. GET histórico
comprova evento original; ausência de cabeça não comprova retirada própria.
Start retira imediatamente: não confundir preparação/inspeção com confirmação.
Namespace separado impede cancelamento acidental de controles de edição/análise.
A sessão é porta interna, sem retry, persistência ou botão de exclusão.

Executor/journal metadata, descoberta após recarga, confirmação visual e
integração no compêndio vêm depois. Não alterar Rules, cobrança, deps ou env.
Lifecycle/chaves, consumidores/backup/rollout e validate integral de P1 continuam
necessários. P1/F2-09/V2/fases 3–5/gates humanos/comerciais permanecem abertos.
Somente commits locais; testes dirigidos durante ajustes, sem CI/remoto/deploy.

## Aceite

Método/namespace inválido e autenticação ausente não acessam banco. Só o
serviço nativo decide retirada/privacidade/clock. Repetir wire original não
repete efeitos; outro usuário não obtém controle. Troca de actor/host invalida
resposta. Metadata não pede partes de conteúdo. Allowlists antigas conservam
18/22 métodos. Evidência distingue serviço/SDK local de produção não exercitada.

## Resultado local

Transporte separado e sessão Auth implementados: sete métodos/IDs próprios
e metadata sem prosa. 168 casos distintos positivos (27 novos), incluindo dois
SDK em emulador. Retake da sessão 13/13. Tipos/build/smoke/lint positivos;
formato/docs/arquitetura/diff no fechamento.

[ADR 0132](../../../decisions/0132-authenticated-lore-removal-transport.md) e
[evidência](../../../entregas/2026-10-24-writer-v2-transporte-da-retirada-de-lore.md).
Próximo: journal/executor recuperável da retirada antes de host/compêndio.
Demais portões e validate de P1 abertos; sem CI/envio remoto/deploy.
