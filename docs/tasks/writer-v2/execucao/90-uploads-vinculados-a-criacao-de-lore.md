# P1 / M38c3l L2 — Uploads vinculados à criação de lore

## Resultado e fronteira

Preparar campos/páginas sem ficha ativa usando a reserva nativa de L1, com
inventário e cancelamento completos antes do primeiro byte. Reutilizar o
protocolo de campo existente; não criar uma cabeça fictícia ou inspeção falsa.
L3 ainda deve compor/auditar/ativar a ficha, sem exposição de endpoint/UI em L2.

## Contratos e sequência

1. Criar intenção nativa de cancelamento e journal privado limitado antes de
   permitir upload. A intenção fecha novos starts/appends/seals; cancel prévio
   e cancel vazio de L1 permanecem compatíveis.
2. Contrato opcional creation no upload contém creationId/startHash/jobToken.
   sourceToken precisa coincidir com o token da reserva, e a abertura nativa
   confere UID/livro/loreId/nascimento atuais, cabeça/tombstone ausentes e
   ausência de cancelamento. Snapshot do cliente não concede grant.
3. Start do campo cria job/lease/estado SHA e binding/prova no inventário
   uploads da criação na mesma transação. Binding fixa contexto/hash de
   manifesto/alvo; seu nascimento coincide com o do job. Suporte compatível
   a uploads existentes; criação usa inventoryVersion 2.
4. Cada start/append/seal/abertura selada reautoriza reserva/livro originais.
   Outras fichas podem mudar sem invalidar a reserva; dono/deleting, controle
   recriado, cabeça prematura ou intenção de cancelamento impedem novas unidades.
5. Cancel com filhos registra primeiro intenção/prova/estado nativos. Advance
   cancela/limpa um filho por unidade, com o mesmo tx/recibo/checkpoint.
   Até 16 partes, header por último; após revogação só permite limpar bytes
   staged próprios comprovados, preservando recriados/escopo divergente.
6. Auditar bindings/jobs/leases e ausência de payloads/gerações/descritores
   inesperados antes do evento terminal. Manter controles/leases/recibos.
   Filhos reservados/adotados exigem extensão de L3; não interpretar phase
   alegado como autorização de apagar conteúdo.
7. Integrar cancelamento com filhos à etapa creations da exclusão do livro.
   Se a fase fields já encerrou um filho, confirmar a prova e ausência dos
   seus bytes; não apagar ou contar duas vezes.
8. Testes Node/SDK: texto literal/BOM, campos e páginas extensos, 141 partes,
   fonte sem cabeça, cancel antes/durante/depois de selo, revogação/deleting/
   ausência de raiz, concorrência/replay/CAS, rollback conjunto, contexto/
   binding/filho/parte/header recriados, órfãos/leases desconhecidas, outros
   criadores/projetos preservados. Metadata não guarda prosa.
9. Revisar, documentar ADR/AGENTS/evidência e commit local com hooks. Rodar
   somente regressões afetadas; validate integral fica no fim de P1.

## Arquivos e riscos

Contratos/store/serviço de criação, novos módulos de intenção/journal/bindings/
fonte/cleanup e integração do upload existente. Guardas SDK atuais cobrem filhos
privados; sem novo callable, dependência ou UI.

Não importar serviços de upload no store puro da criação, evitando ciclos.
Aberturas/bindings são capacidades internas vinculadas à transação; confirmar
histórico não reautoriza prosa. Nenhum cleanup pode ler bytes/proof para apagar.

L3 deve reconhecer criação adotada, reservar os uploads para a geração, compor
sem base e ativar cabeça/geração/leases/clock/datas/recibo atomicamente.
Criação completa, demais escritores/consumidores/backup/cliente e ativação de
P1 permanecem pendentes. Sem CI/push/deploy ou livro real.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-uploads-vinculados-a-criacao-de-lore.md)
e [ADR 0105](../../../decisions/0105-native-creation-field-uploads.md):
294 Node e quatro SDK distintos positivos em rodadas dirigidas.
Lint corrigido, arquitetura e sintaxe dos 217 módulos passaram.

L2 implementado internamente: uploads sem cabeça, bindings, intenção de cancel,
cleanup/auditoria e coordenação com o livro. L3 deve ampliar cleanup de
tentativas/reserved e compor/auditar/ativar a geração antes de endpoint/UI.
Validate integral no fim de P1; P1/F2-09/Writer V2 permanecem abertos.
Somente commits locais, sem CI remota ou deploy.
