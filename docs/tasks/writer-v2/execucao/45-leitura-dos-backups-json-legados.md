# F2-09 P1 M12 — Leitura dos backups JSON v1–v6

Contrato em 2026-10-22 sobre be29d5d. Grafo consultado; exportManuscript,
chapterCompositionService e narrativeBackupService atuais conferidos em fonte.
P1/F2-09 abertos. Avanço sequencial já autorizado, sem CI/push/subagentes.

## Objetivo e critérios

Ler os seis formatos writer-book-backup emitidos pelo exportador atual e produzir
revisão privada fiel, preservando prosa/estrutura/cenas/fontes/narrativa/lore próprio/
personas disponíveis. Não fabricar histórico, metadados ausentes, progresso ou
bytes de capa. Não salvar/publicar livro nem promover lore global inline.

O JSON antigo não é o framing M2. Aceitar whitespace/ordem de propriedades/BOM UTF-8,
mas rejeitar duplicatas, JSON/UTF-8 inválidos, versão futura, tipos/escopos/campos
incompatíveis e partes/provas inválidas. Escapar HTML/URLs é responsabilidade da
interface futura; leitor só produz dados inertes e não faz fetch.

Não carregar o arquivo/projeto inteiro na RAM. Scanner de ranges até 64 KiB
valida gramática e registra spans de itens em índice temporário protegido M11.
Até 8 MiB por item próprio materializado; corpo global ignorado não é copiado nem
materializado. Objetos têm até 64 campos/chaves de até 256 bytes e profundidade 24:
orçamentos estruturais acima dos DTOs conhecidos, sem limitar arrays/projeto.
Números/strings globais ignorados são percorridos sem construir valores.
Fingerprint SHA-256 do arquivo inteiro inclui whitespace/BOM.

## Inventário real

- v1: book, chapters, lore próprios, sem histórico e sem bytes de imagem.
- v2: universo com id/name/description/lore inline; conservar só candidato de ID.
- v3: personas usadas e complementos; não recuperar biblioteca ou credenciais.
- v4: atos; campos opcionais das capacidades anteriores podem continuar ausentes.
- v5: scenes schemaVersion 1 com groups/scenes/sources e revisão do projeto.
  rank exportado é o slot ativo; não há ambos os ranks. Texto de capítulo por cenas
  é composição exportada, distinta da fonte de conversão preservada.
- v6: narrative schemaVersion 1 com arcs/milestones/events/referências e revisões;
  cenas são opcionais em livro com narrativa.

Versão é a maior capacidade presente. Exigir campos básicos e formatos das
capacidades declaradas, sem aceitar recurso introduzido em versão posterior.
Capa por URL é somente aviso; não preservar URL/token como vínculo autorizado.
Histórico e progresso ausentes são avisos de ausência, não um histórico completo
vazio ou meta inventada. O exportador pode ter incorporado draft legado no texto
do capítulo, inclusive vazio/removido; arquivo não prova separação salvo/draft.

## Modelo de revisão e procedência

Identificar explicitamente sourceFormat/version/fingerprint, capacidades e
ausências. Origem de universo legada não tem encarnação histórica: review conserva
candidato por ID, nunca inventa created nativo ou acesso. O servidor futuro deve
reautorizar o ID mostrado conforme a decisão de produto, avisando que não há
prova da edição histórica. Dados globais inline ficam excluídos.

Spans/índice são locais e cifrados; conteúdo próprio é lido sob demanda por item,
sem tabela de prosa no índice. Normalização/validação deve reutilizar o schema
M11 onde representável, mantendo a procedência/avisos legados ao lado; não emitir
novo backup que finja captura completa sem preservar essas ausências.
Ordenação derivada do rank ativo pode reconstruir buffers, claramente distinta
da preservação de um slot inativo que nunca esteve no JSON.

## Sequência e arquivos

1. bookLegacyJSON puro: scanner de gramática/duplicatas/UTF-8/EOF/fingerprint,
   spans e leitura limitada de um item. Testes adversariais e limites por range.
2. Catálogo de spans, contrato v1–v6 e normalização por tipo; vínculos/duplicatas/
   hashes, capacidades e avisos, com índice protegido e schema M11.
3. Serviço de revisão pública em book-portability; lifecycle/cancel/cleanup próprio,
   sem memória ilimitada, fallback externo ou URLs requisitadas.
4. Testes dos seis JSON realmente produzidos pelo exportador, incluindo v5/v6,
   ausências, universo/capa tokenizados, vazio/removido, ordem e referências.
5. Chromium/OPFS com arquivo real de exportação legado, Unicode e cancelamento;
   checks dirigidos, revisão, ADR/docs/entrega/AGENTS e commit local.

## Limites e riscos

Sem restauração/ativação, recuperação de revisão confirmada, interface final,
P2/P3 ou nova dependência. File/Blob do host deve representar bytes imutáveis;
relatório local/fingerprint não concede autorização ao servidor.
Não exigir corpo global para restaurar dados próprios nem usar nomes globais
como fallback. Não converter ausência de prova histórica de universo em prova
de revogação atual. Validate completo no fechamento P1, sem reduzir cobertura.

## Compatibilidade histórica verificada

Foram lidas também as versões reais do exportador nos commits locais 401b200
(v1), 7eb3568 (v2), c2f3c4e (v4), 38ef449/7003ed4 (personas/atos), f4449a5
(cenas) e 3b79591 (narrativa). Não usar só fixtures modernas como prova histórica.

O validador de arquivo novo continua estrito. A via legada tem procedência própria
e pode conservar vínculo de persona sem perfil ou override antigo indisponível
com aviso, sem fabricar perfil/atributo ou ligá-lo à biblioteca atual por coincidência
de ID. Materialização futura remapeará esses vínculos para identidade neutra.
Fontes v5 não exportam data da conversão; preservar ausência. Composição textual
do capítulo por cenas permanece artefato próprio do arquivo, sem substituir cenas
ou a fonte original por fallback. Nenhum selo M2 é inventado para um JSON legado.

## Resultado local em 2026-10-22

Implementados scanner/catálogo/validação, procedência e API pública de inspeção
legada. Compartilhados hash/lifecycle do índice sem afrouxar o formato novo.
27 Node, 46 cliente e nove cenários Chromium/File/OPFS positivos.
Veja [evidência M12](../../../entregas/2026-10-22-writer-v2-leitura-dos-backups-legados.md)
e [ADR 0056](../../../decisions/0056-legacy-book-backup-review.md).
UI e cópia privada no servidor continuam pendentes; P1/F2-09 abertos.
