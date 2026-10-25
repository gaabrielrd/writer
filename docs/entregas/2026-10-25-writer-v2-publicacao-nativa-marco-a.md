# Writer V2 — publicação nativa, marco A

- Data: 2026-10-25.
- Marco: P1 / M38c11 A.
- Plano: [130](../tasks/writer-v2/execucao/130-publicacao-com-lore-nativo.md), ainda aberto.
- Decisão: [ADR 0150](../decisions/0150-native-book-publication.md).

## Resultado e alcance

Fluxo principal publica lore lógico inline/v1/v2/criação com captura C1 original,
precedência privada local/global e seleção pública explícita. Staging é invisível
até ativação; nomes ausentes da cabeça não viram compêndio vazio. Estado órfão
em falha não substitui o ponteiro público anterior.

Servidor copia somente nome/aliases/categoria/resumo sob consentimento lógico
e origem atuais, inclusive com flag ausente da cabeça. Final confere identidade/
updateTime/clock/privacidade/cenas do livro e universo/marcador público, header
e Auth antes de ativar ponteiro/status juntos. Replay não reabre retirada,
altera byline nem reescreve um evento já aplicado.

Rules negam cópia local/ativação por atalhos SDK nativos; preservam staging de
capítulos/atos/globais, unpublish e cleanup. Autor público vem da entrada
explícita, sem perfil/email. Detalhes/notas/relações e readToken de fichas não
vão para documentos públicos. Dois hashes de metadata no header/ponteiro não
concedem permissão de leitura.

Captura inicial cliente é integral e autorizada, sem persistência; não é seletiva.
Revalidação posterior confere metadata, sem novo download de corpos. Sessão fixa
objeto Auth e UID original, inclusive se o objeto for mutado em lugar.

## Critérios verificados

- [x] Inline/v1/v2/criação nativa e fonte >8 MiB/128 partes.
- [x] Nome/resumo/aliases lógicos, presença e consentimento sem inferir stub.
- [x] Privado local sombreia fallback global; colisão de identidade falha cedo.
- [x] Campo público inválido e aliases introduzidos/reordenados rejeitados.
- [x] Staging invisível, projeção fechada, nenhuma exposição de campos privados.
- [x] Origem/livro/universo/marcador recriados ou revogados invalidam prova.
- [x] Clock/data/cenas/privacidade, conta/UID e respostas tardias conferidos.
- [x] Revalidação C1 metadata, sem novo download de corpos.
- [x] Resposta final perdida e retry explícito reconhecem evento sem reaplicar.
- [x] Rollback de última escrita preserva ponteiro e livro; concorrência confirma uma ativação.
- [x] SDK bypass negado, retirada revoga URLs diretas e replay não a desfaz.
- [ ] Marco B: fontes acima do orçamento de uma chamada exigem preparação em unidades.
- [ ] Publicação para todas as fontes válidas, restante de P1/V2 e gates.

## Arquivos

BookLoreReadClient adiciona captura/verificação de coleção, mantendo captureList.
BookLoreReadService fixa UID independente do objeto; exports públicos permitem
composição entre features. Novo BookLorePublicationClient liga Auth/C1/RPCs;
publicationService detecta recursos/payloads, preserva projeção/capítulos/atos,
verifica antes/depois de staging e finaliza no servidor. PublicBookService
continua mapeando somente os campos de exibição.

BookLorePublication oferece getBookPublicationSource, stageBookPublicationLore
e finalizeBookPublication, registrados no router Functions com cache privado.
Rules acrescentam hashes fechados e barreiras nativas. Testes Node/SDK/cliente/
integração e documentação cobrem os contratos. Sem nova coleção/dependência.

## Evidência real

**36/36 Node** de bookLorePublication: quatro representações, campos/consentimento/
aliases inválidos, v2 seletivo, v1 >8 MiB/128 partes, corrupção após prefixo,
proof/header/tokens adulterados, clock/cenas/datas, identidade e privacidade
nativas do universo/marcador, replay e autorização. Nenhuma falha/skipped.

**135/135 Vitest**, cinco arquivos de publicação/leitor público/C1/sessão.
Incluem 27 casos novos: captura/verificação C1, fluxo nativo, sombra privada,
Auth/UID, conflitos e onze percursos integrados pelo publisher real, transporte
C1 e serviços de produção em memória. Quatro modos, mundo privado/local,
coleção vazia, metadata malformada, resposta perdida e conflito após staging.

Bridge integrado usa Firestore em memória com stamps nativos simulados e
Firebase/Auth/RPC em fixtures. Sanitizador/composição são fixtures nesse bridge;
testes próprios da publicação/leitor cobrem suas regressões. Não é teste visual,
SDK de produção, chamada paga ou deploy.

**19/19 SDK**, Firestore 1.22.0 verificado, projetos demo/loopback: seis novos e
13 regressões da publicação. Admin real prova fonte grande, acesso anônimo só
após ativação, campos fechados, head sem flag com consentimento lógico,
bypass negado, origem de universo recriada, prova pública revogada, rollback
de última escrita e duas confirmações concorrentes do mesmo evento.
Rules negadas esperadas aparecem no log; runner terminou positivo, sem skipped.

Typecheck/build/smoke positivos, 2980 módulos. Build mantém avisos de chunks
grandes/imports dinâmicos coexistentes, sem erro. Lint dos arquivos alterados,
sintaxe do serviço/index, formato/docs/arquitetura/diff conferidos no fechamento.

Logs externos writer-v2-portability-qa/m38c11-node-final.tap,
m38c11-vitest-final.log, m38c11-sdk.tap, m38c11-sdk.mjs,
m38c11-sdk-emulator.log e m38c11-build.log. Primeiro typecheck apontou
estreitamento de unknown/undefined; corrigido com função never reconhecida.
Lint corrigiu assertion/array any e mock async sem await. Nenhuma regra suprimida.

## Pendência obrigatória e continuidade

Cópia atual tem limite por chamada de 32 MiB/512 partes/900000 bytes lógicos.
Não trunca/apaga a fonte, mas pode impedir publicar uma base v1 maior. Marco B
deve consumir a inspeção incremental e certificado/ranges já existentes para
separar preparo e cópia pública. Este marco A **não conclui o plano 130** nem
demonstra publicação de toda fonte válida. Não retirar essa pendência no rollout.

Captura de campanhas já usa exclusivamente universo/aventura com contratos
próprios; inspeção confirmou que não é consumidor do lore de livros. Não
alterada ou expandida. Demais leitores ainda devem ser inventariados.

Validate/cobertura global ficam no fechamento de P1. Sem browser/tela nova,
CI/push/PR/merge/deploy. Functions/Rules novas não estão em produção; servidor
Vite sozinho não entrega esse backend remoto. Master/servidor preservados.
Inventário dos namespaces/escritores/exclusão, backup/restauração/drain/rollout/
validate de P1/F2-09, fases 3–5 e gates humanos/comerciais continuam necessários.
