# F2-09 — Lore, importação, IA e portabilidade privada

**Estado em 2026-10-21:** descoberta concluída sobre `a9b588a`; L está concluído tecnicamente em `087bced`, com CI geral/regras verdes, após a correção S3 `e924890`. I concluiu tecnicamente em ffc01d9, com CI geral e regras verdes. Ver [entrega L](../../../entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md). Este documento organiza a tarefa [W2-F2-09](../fase-02-criar-e-preparar/09-lore-importacao-e-portabilidade.md)
em incrementos sequenciais. Não comprova entrega nem fecha o portão da fase 2.

## Objetivo e base verificada

Permitir escrever com lore coerente, importar uma aventura com revisão e levar os
dados privados para uma cópia restaurável, preservando os livros existentes.

A auditoria encontrou:

| Capacidade            | Implementado                                                  | Falta para F2-09                                                    |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Importação            | Parser PDF/DOCX/Markdown/TXT/HTML e revisão com divisão/união | Destino aventura, confirmação e recuperação de gravação parcial     |
| Lore                  | Escopos livro/universo e prioridade local por termo/alias     | Lore próprio de aventura e circuito completo nas campanhas          |
| Menções               | Editor rico nos capítulos, cenas e blocos                     | Carregamento local/global consistente nos novos projetos            |
| IA                    | Chat de capítulo e aplicação com débito atômico               | Contexto autorizado por origem e aplicação em cenas/blocos          |
| Backup                | JSON privado de livro v1–v6, somente exportação               | Leitor/restaurador e formatos dos novos projetos                    |
| Histórico e progresso | Serviços de versões, metas, checklist e retomada              | Inclusão explícita no contrato de portabilidade                     |
| Campanhas             | Base, variantes, adoção, sessões, referências e itens S3      | Exportação/restauração de próprios e derivados com regras distintas |

Não tratar `validateChatContext` como autorização de cada ficha: o chat atual
autoriza livro/capítulo e valida a forma do contexto recebido. Os novos editores
exibem indisponibilidade de IA explicitamente. Remover essa mensagem não é
uma implementação da integração.

`preferredLoreTerms` resolve locais antes de globais e antes do filtro público.
`buildLoreContext` e `relevantChatLore` não usam hoje esse mesmo contrato.
A captura de campanha admite somente referências de lore do universo vinculado;
a simples ampliação de `LoreScope` deixaria a campanha incompleta.

## Decisões, suposições e pendências

- Autores e mestres conservam o mesmo peso; o livro legado faz parte da regressão.
- Importação exige confirmação e cria conteúdo privado do criador.
- Não inferir audiência, missão ou pista pelo aspecto do documento importado.
- Restauração será uma **nova cópia privada**, com IDs próprios remapeados.
  Mesclar ou sobrescrever projetos existentes fica fora deste recorte.
- Procedência externa permanece distinta da identidade nova dos recursos próprios.
- Menções particulares prevalecem por termo/alias; não há fallback global que revele
  conteúdo quando a ficha vencedora estiver indisponível ao destinatário.
- Bases e variantes continuam dependentes da autorização da origem.
- Histórico é preservado no Writer até exclusão explícita, conforme decisão anterior.
  Em 2026-10-21, o operador confirmou que o backup guarda **o estado atual e todo
  o histórico**, incluindo versões manuais e cópias anteriores às restaurações.
- Não há participantes estruturados implementados nesta fase. Regras futuras de
  participantes e retenção financeira não autorizam inserir dados de terceiros
  no arquivo privado nem no contexto da IA.
- Imagens exigem bytes/hash/tipo de mídia e acesso autorizado. URLs atuais de capa
  podem conter tokens e não provam portabilidade do binário.

## Incrementos sequenciais

### L — Lore próprio da aventura

Contrato específico: [L — lore próprio de aventura](26-lore-proprio-de-aventura.md),
revisado e liberado após envio da correção S3 em `e924890`, com CI em paralelo.

Criar/listar/editar/excluir fichas particulares pelo servidor, integrar a interface
pública de lore e os editores de cena/bloco. Estender referências explícitas e sua
resolução, a captura B, disponibilidade da base, C2, comparação e adoção C3.

Antes do código, fechar o contrato de identidade de origem, compatibilidade de
bases antigas, revisões/relógio de autorização, limites, cursores e exclusão de
fichas. Preservar as chaves e a semântica das origens de universo já capturadas.
Não há workflow público de exclusão integral de aventura neste checkout; L não o
introduz. Remover ou marcar a raiz por Admin em QA comprova o gate de origem, não
a limpeza operacional integral dos filhos.

Aceite: nome/alias local vence o global; referência de outra aventura é recusada;
fichas referenciadas entram na captura e nas duas mesas; alteração/revogação
invalida projeções sem apagar notas próprias. Livros e bases antigas continuam
legíveis. Nenhum conteúdo é publicado ou compartilhado automaticamente.

### I — Importação revisada para aventura

O [plano I](27-importacao-revisada-de-aventura.md) detalha preparação privada,
reserva, ativação, retomada e limpeza. O operador aprovou guardar no dispositivo
uma cópia protegida da revisão confirmada, sem PDF. Recuperação após reload exige
autorização atual e seal durável antes do primeiro envio; não cobre revisão ainda
não confirmada nem sincronização entre dispositivos. A ABI foi revisada e a implementação
liberada; implementação/revisão/validate local concluídos. A
[entrega I](../../../entregas/2026-10-21-writer-v2-importacao-revisada-de-aventura.md)
registra testes, falhas preservadas e fechamento remoto verde de ffc01d9.

Expor os contratos reutilizáveis do parser/revisão sem importar internos de books.
A revisão deve mostrar o destino: cada seção confirmada forma uma parte com cena
e bloco principal privado, respeitando a ordem revista. Dividir/unir/renomear antes
da confirmação. Não criar livro intermediário.

Fechar escrita paginada/idempotente, retomada, cancelamento e limpeza no mesmo
incremento; projeto incompleto não aparece como aventura utilizável.

Aceite: cancelar não cria obra visível; retry não duplica partes/cenas; texto,
acentos e ordem sobrevivem à confirmação. Validar DOCX/PDF/Markdown e corpus real.

### A — Contexto autorizado e IA de cenas/blocos

[Plano A implementado e validado localmente](29-contexto-autorizado-e-ia-de-cenas.md),
com CI do novo head pendente; [evidência A](../../../entregas/2026-10-21-writer-v2-chat-autorizado-de-cenas.md).
Novos alvos compõem uma entrega completa; capítulos/históricos legados não são migrados.

Resolver no servidor somente IDs e campos que o autor pode ler, com a mesma
prioridade local/global usada pelas menções. Reautorizar antes da geração e da
aplicação; não confiar em prosa contextual enviada pelo cliente como prova de acesso.

Integrar chat/personas e aplicação ao alvo correto com CAS, manuscrito/débito/recibo
atômicos, preservando conversa gratuita e aplicação única do legado. Não habilitar
IA de campanha nem inserir dados de jogadores neste incremento.

Aceite: revogação, mudança do alvo, conta trocada e resposta tardia não aplicam texto
nem debitam incorretamente; colisões local/global produzem contexto consistente.

### P1 — Backup e restauração de livro

Ler as versões privadas v1–v6 e definir nova versão com os campos atuais e a decisão
de histórico. Preservar o comportamento do exportador que inclui o texto atual
ainda não salvo; não substituí-lo silenciosamente por captura somente do servidor.

Incluir atos, capítulos, cenas ativas/arquivo/sem capítulo, composição, referências,
arcos, cronologia, lore, personas e progresso. Recriar vínculos/revisões no servidor.
Versão futura desconhecida falha antes de gravar. Ausência em arquivo legado é
mostrada, sem inventar dados.

### P2 — Backup e restauração de aventura

Reutilizar somente a infraestrutura demonstrada em P1, com DTO próprio da aventura:
partes, cenas, arquivo, blocos principais/adicionais, audiências, ordem, ilustrações,
lore local, referências, planejamento, arcos, cronologia, progresso e histórico
conforme a decisão. Roundtrip em nova cópia privada.

### P3 — Backup e restauração de campanha

Incluir C1, sessões S1, vínculos S2, catálogo/estados S3, ordem dos itens e ordem dos
vínculos, base autorizada e variantes/legadas. Próprios podem ser recuperados
independentemente; derivados passam pela autorização vigente da origem.

Uma declaração de `origin` no arquivo não é prova. Fechar prova de procedência
produzida pelo servidor sobre manifesto/hash para preservar a edição congelada;
uma assinatura não substitui autorização atual. Recapturar a aventura atual
também não restaura a edição antiga.

Não converter material revogado em nota própria. Mostrar recursos indisponíveis
na revisão. Arquivo nunca concede ownership, compra, participação ou autorização.
Se os jobs adicionarem prosa/pins persistidos por campanha, evoluir o inventário C4
com compatibilidade explícita v1–v4 antes de habilitá-los.

### D — Fechamento integrado

Demonstrar conto e aventura no mesmo universo, duas campanhas independentes,
roundtrip, versões antigas e origem removida/revogada. Verificar os critérios da
tarefa e do portão de fase separadamente dos pilotos humanos ainda pendentes.

## Contrato transversal dos arquivos e operações

- DTOs fechados e versionados por tipo de projeto; nenhum dump cru do Firestore.
- Captura consistente, paginação limitada e autorização antes/depois de I/O.
- Prosa em chunks UTF-8 limitados; binários em Storage e arquivo apropriado,
  sem base64 ilimitado dentro de documentos Firestore.
- Não exportar chaves/BYOK, conversas/pedidos, recibos/fences, grants, tokens,
  caminhos privados de Storage ou journal/recuperação do navegador.
- Não confiar apenas no nome de campos ao verificar segredos: URLs podem carregá-los.
- Remapear recursos próprios; reconstruir contadores, revisões, hashes e pins.
- Prévia e validação antes de ativar; retry/retomada/cancelamento e limpeza fazem
  parte de cada fluxo, não de uma correção posterior.
- Nenhuma truncagem silenciosa. Limites não inviabilizam o corpus F1 já medido.
- Restauração não reutiliza identidade de campanha excluída nem contorna reserva C4.

## Validação e evidência por incremento

Rodar unidades de contratos/serviços e componentes afetados durante os ajustes.
No fechamento, `npm run validate`, regras SDK reais pertinentes e percursos nativos
de teclado/celular/temas conforme o recorte. Acompanhar CI em paralelo, sem esperar
para iniciar trabalho independente, e registrar seu resultado real.

Para portabilidade, cobrir quatro famílias SDK: autorização/exportação;
consistência/paginação; restauração/remapeamento/legado; falha/retry/limpeza.
Não confundir teste do serializador com roundtrip restaurado.

O teste atual `WRITER_IMPORT_PDF` contém expectativa específica de Phandelver:
não apontá-lo ao Harry Potter. O PDF sintético gerado no Chromium não comprova o
corpus real do usuário. Arquivos reais permanecem privados e fora do Git.

## Estimativa e riscos

A referência histórica F2-09 de 56/88/144 h não cobre o inventário atual. A descoberta
produziu parcelas provisórias O/C/P: backend 94/166/282 h; cliente 62/110/184 h;
QA integrado 24/40/68 h. Não consolidar isso em promessa de entrega: a parcela
cliente ainda não estima restauração de livros legados/histórico completo, a
inclusão integral do histórico foi confirmada depois dessas parcelas e os
contratos de cada incremento precisam fechar. Confiança baixa; não são horas realizadas ou saldo medido.

O detalhamento posterior de L reabriu sua referência em **60/102/168 h** totais
(backend 22/38/64, cliente 20/34/54 e QA integrado 18/30/50), sem dupla contagem
das unidades. Essa faixa reabre as antigas parcelas de lore/IA da descoberta;
não somá-la aos subtotais acima. IA continua em seu próprio incremento, a ser
reestimado. F2-09 ainda não tem total consolidado.

Riscos principais: compatibilidade de origens capturadas; projeções antigas após
revogação; fidelidade da edição congelada; mídia com URL não portátil; restauração
parcial; histórico grande; mistura entre contexto autorizado e snapshot do cliente.

## Não escopo

OCR, VTT, combate, compartilhar automaticamente, marketplace aberto, direitos
comerciais inferidos de PDF, arquivos de venda, mesclar/sobrescrever projetos,
restaurar credenciais, importar grants ou habilitar pagamento/deploy/merge.
