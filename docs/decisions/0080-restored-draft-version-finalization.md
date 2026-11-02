# ADR 0080 — Versão recuperada finalizada e metadata portátil

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M34c, depois da ADR 0079

## Problema

M34b preserva a contribuição do rascunho, mas não existe manifesto de versão
utilizável nem contagem. Seu perfil e metadados precisam sobreviver ao próximo
backup. A contagem não pode usar partes alteradas depois da leitura.

## Decisão

finalizeBookRestoreDraft é interno e exige draft-finalize. Reautoriza o item M21,
descriptor, perfil, capítulo e cada corpo pelo journal/recibo/nascimento nativos.
Cada leitura devolve uma conferência posterior por máscara; o commit reconfere
essas identidades e versões sem reler toda a prosa na transação final.
Observações da leitura inicial são isoladas por tentativa de transação.

Resultado version: ler partes em transações separadas, conferir sequência,
UTF-8/BOM/hash/bytes e usar countVisibleWords existente. A RAM é proporcional a
um rascunho, não ao livro ou a todas as versões; este não é um contador incremental
de HTML/Markdown. Não há limite total novo. Falha de leitura/contagem/prova não
grava manifesto/recibo nem altera a preparação.

Criar workVersions schema1 manual, rótulo fixo recuperado, contagem real e data
gerada pelo servidor. Os corpos M34b não são regravados. None/saved não criam
versão e não aplicam configurações antigas ao capítulo. O descriptor da
preparação permanece disponível para sua revisão.

## Metadata e próximo backup

work-version aceita draft opcional fechado: schemaVersion 1, capítulo original
e snapshot de persona ou null. Exigir recurso chapter/ID correspondente,
complemento/perfil/atributos consistentes e ausência de campos desconhecidos.
Projeção canônica conserva strings e datas; remapeamento também alcança IDs
internos. Snapshot de estilo histórico não é vínculo ativo nem grant e não
altera os totais de perfis usados atualmente.

VersionSummary/leitor/captura incluem essa metadata. A identidade de página a
considera; a captura clona/congela a estrutura antes de ceder controle.
Cabeçalho JSON usa frames de até 64 KiB, com o orçamento por item já vigente.
DTOs antigos sem draft conservam seu contrato. Leitores antigos com campos
fechados recusam a extensão, sem descartar metadata silenciosamente.

Listagem mantém limite de linhas e orçamento de 512 KiB por resposta, admitindo
um primeiro item maior que o orçamento para não bloquear uma identidade válida
(o documento continua sujeito ao limite nativo). Cursor segue o último item
entregue. Clientes aceitam página curta não vazia com cursor e continuam
recusando página vazia/cursor repetido/identidades fora de ordem/origem alterada.
A consulta continua limitada a até 50 linhas; nenhum corpo de texto é listado.

## Estado e consequências

Header/journal/progresso finalizado/recibo são atômicos sob inventário v11,
sem nova família. Fase cover mantém o cursor no item da capa, ainda não consumido.
Raiz ausente/countReady false; o manifesto privado não ativa o livro.

Teste de 20 MiB prova 320 partes/contagem; raiz sintética prova leitores e
metadata no DTO. Captura/remapeamento têm testes próprios; isso não equivale
ao roundtrip integral pelo host/UI nem à ativação de P1.

Faltam capa, integração de personas, campos grandes/consumidores, certificação/
ativação, host/UI/roundtrip e validate integral. Metadata além do envelope nativo
falha intacta; suporte integral permanece obrigatório antes da ativação.
P1/F2-09 e Writer V2 abertos. Sem API pública, Rule, dependência, crédito,
subagentes ou CI/push/PR/deploy novos.
