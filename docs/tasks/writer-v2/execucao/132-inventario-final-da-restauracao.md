# P1 — inventário final da restauração antes da ativação

## Objetivo e sequência

Prosseguir P1 após [lore preparado](131-backup-logico-indexado-do-lore.md).
A preparação atual termina em resources-finalize/schema12, após personas,
capa e índices de fontes. Ainda falta congelar escritores, conferir inventário
completo e criar a raiz por transação final. Implementar primeiro a auditoria
nativa limitada descrita aqui; ativação/revisão/host seguem imediatamente como
entregas próprias do mesmo objetivo, sem declarar P1 concluído.

## Contrato antes do código

advanceBookRestoreAudit é serviço interno, não callable novo. Inicia somente
em job content-verified, cleanup14, schema12/resources-finalize, sourceIndexes
complete, Counts done, capa preparada, lote de personas preparando íntegro e
drenagem de payload done quando presente. Work-control continua countReady false
com contagem igual à preparação; entity-index-control deve estar completo.
Conta, reserva, marcador e raiz ausente são reconferidos pelo loader original.

O primeiro avanço muda para schema13/resources-audit, com progresso limitado
audit. Essa fase impede escritores anteriores e o indexador de fontes de
continuar; somente auditoria ou cancelamento podem mudar a preparação.
Preservar todos os contratos de completude anteriores também no schema13.

Duas passagens:

1. Journals de materializationArtifacts por páginas de oito. Conferir identidade
   kind/id/endereço, alvo e recibos/nascimentos originais por metadata; alvo ou
   journal ausente/recriado falha. Contar exatamente artifactCount-retiredArtifacts.
   Não ler prosa nem acumular catálogo ou lista de provas.
2. Namespaces físicos preparados, por páginas de oito; filhos paginados sob seus
   pais originais. Usar o mesmo resolvedor de caminhos/journals para conferir
   cada documento. Incluir estrutura/ledger, lore/payloads, cenas/narrativa/
   índices, histórico, definições/rascunho/capa sob job e somente personas da
   biblioteca filtradas por restoreOrigin.bookId. Dados de outras obras/perfis
   sem essa origem não são enumerados nem alterados. Recusar qualquer stageKind
   restante ou documento sem journal. Contagem física deve igualar a dos journals.

Namespaces e caminhos vêm dos mapas nativos existentes. Pais e a âncora anterior
são autenticados antes de retomar. Cursor audit guarda fase/família/parent/
parentAfter/after, contagens e uma âncora nativa limitada, sem prosa. O layout
schema1 é explícito; nova família exige evolução de contrato antes de produção.

A prova se apoia no congelamento dos escritores do job e nas Rules que já negam
SDK sem raiz. Não promete snapshot global contra alterações administrativas
arbitrárias durante pausas. Uma auditoria passada não concede acesso nem substitui
reautorização de universo/Storage ou a transação de ativação.

Somente após páginas vazias finais e contagens exatas: activation-ready/audit
done. Revalidar lote de personas, work-control e fonte congelada ao concluir.
Ainda não criar raiz, tornar countReady true, ativar lote, instalar imagem
pública ou modificar universo. Ativação final deve validar revisão, autorizações
atuais, provas materiais e o mesmo job/checkpoint, criando tudo atomicamente.

## Compatibilidade e cancelamento

Preparações schema1–12 continuam aceitas; schema13 mantém os campos e invariantes
de schema12 e acrescenta audit. Não migrar automaticamente jobs de payload sem
prova de drenagem. Saldo criado/retirado/limpo permanece monotônico e exato.
Auditoria não cria ou remove artefatos. Cancelamento/cleanup14 funcionam durante
cada fase e após ready; recibos antigos confirmam sem recriar dados.
Guarda de cache/transporte e UI serão integradas pelo host, sem exposição ad hoc.

## Arquivos e validação

Contratos/famílias/auditoria novos; factory Upload, job/progress/replay e mapa
de ações. Testes Node e SDK dirigidos: livro completo com recursos e corpos
grandes, fonte indexada, legado, lote/capa, leituras/queries limitadas, tokens,
retomada/replay/retry, fase/conta/CAS, documentos órfãos/recriados, namespaces
aninhados, perfis estrangeiros preservados, cancelamento/saldo e raiz ausente.
Não rodar suíte global até fechar P1; não CI/push/PR/deploy/subagentes.

## Aceites

- [x] Congelamento e cursor nativo retomável com writes/recibo/job atômicos.
- [x] Passagens journal/física completas, limitadas e com contagem exata.
- [x] Provas originais e âncora; órfãos/ABA/estrangeiros não adotados.
- [x] Metadados somente, sem cópia de prosa/catálogo e sem mutar artefatos.
- [x] Cleanup14/saldo e replay históricos preservados em schema13.
- [x] Node/SDK/checks/documentação/revisão/commit local registrados.
- [ ] Próxima entrega: revisão e ativação atômica do livro; depois host/roundtrip
      integral/inventários gerais/legados/rollout/validate de P1 e fases 3–5/gates.
