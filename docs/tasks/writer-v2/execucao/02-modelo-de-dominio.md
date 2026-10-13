# W2-F1-02 — Contratos de domínio e compatibilidade

**Data:** 2026-10-13. **Base:** `5f1cd63`, após integrar `master d98c1ed`.
**Estado:** contrato definido para implementação; sem migração ou funcionalidade entregue.
**Plano:** confirmar modelos, comparar vínculos, especificar entidades/operações,
medir corpus, revisar cenários e registrar ADR proposta. Fechamento normativo em W2-F1-06.

## Base e decisões técnicas

[Book](../../../../src/features/books/model/book.ts) e
[Chapter](../../../../src/features/books/model/chapter.ts) mantêm sua identidade e coleção.
[Universe](../../../../src/features/universes/model/universe.ts) já possui versões de lore/privacidade.
[LoreScope](../../../../src/features/lore/model/loreEntity.ts) continua compatível com `book/universe`.
O grafo `writer-v2` foi reindexado após o merge; contratos e serviços foram lidos nessa base.

- D-02: originais autorais podem acompanhar lore vivo; campanha usa base congelada e
  substituições locais por entidade inteira. Atualização exige comparação e aceite do mestre.
- Promoção de cânone é proposta ao dono do universo; não é efeito do encerramento de sessão.
- D-01: coleções paginadas, documentos/artefatos separados e limites em bytes UTF-8.
  Sem quota comercial arbitrária de livros, cenas, sessões ou versões.
- Reuso do editor será demonstrado por contrato público de documento; não disfarçar
  aventuras como livros nem importar componentes internos entre features.

## Identidade, versões e operações

Todo novo recurso privado tem `id`, `ownerId`, `schemaVersion: 1`, `revision` inteiro
positivo, `createdAt` e `updatedAt` em milissegundos UTC atribuídos pelo servidor.
Filhos repetem proprietário/escopo somente quando útil à consulta; servidor deriva e
valida esses valores no pai. Cliente não transfere autoria por payload.
Coleções novas não trocam o `authorId` dos livros/universos legados por `ownerId`.

IDs são opacos, estáveis e independentes de título, ordem, nome público e conta Stripe.
Referência de lore inclui `kind`, `scopeId`, `entityId`; preservar também a identidade
legada `universe:<universeId>:<entityId>` em menções e relações importadas.
Nome igual não resolve uma referência quebrada automaticamente.

Envelope de mutação: `operationId`, alvo tipado, `expectedRevision` e alteração validada.
Servidor autoriza alvo/parentesco, compara versão e grava mudança/revisão/recibo juntos.
Retry do mesmo operationId/payload devolve resultado; outro payload com mesmo ID é negado.
Conflito devolve código estável `revision-conflict` e versão atual, sem sobrescrever.
Não incluir texto privado no erro para quem perdeu autorização.

Hash SHA-256 do conteúdo auxilia captura/âncoras/artefatos; não substitui revisão do recurso.
`updatedAt` ordena retomada, não substitui controle de concorrência.
Registro legado sem revisão é versão 0 na primeira leitura autorizada; primeiro write
V2 compara versão 0 e cria revisão 1 em transação. Clientes antigos não podem continuar
gravando sem esse protocolo quando o recurso exigir histórico: rollout coordenado,
regra de dados e teste de cliente antigo fazem parte de W2-F2-05/W2-F5-05.

## Entidades e armazenamento propostos

Os caminhos abaixo são contratos futuros, não coleções criadas nesta tarefa.
Campos comuns acima são herdados; listas de tamanho variável são documentos filhos.

| Entidade/caminho                                                       | Proprietário, campos específicos e origem                                                                                                              | Vida útil e exclusão                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `books/{bookId}` e filhos existentes                                   | `authorId` legado; atos, capítulos, persona e universo opcional intactos; revisão aditiva                                                              | Mantém exclusão vigente; edições adquiridas têm ciclo separado                                           |
| `books/{bookId}/scenes/{sceneId}`                                      | Dono do livro; `chapterId` opcional, título, ordem, objetivo, conflito, ponto de vista, estágio; origem autoral                                        | Capítulo removido deixa cena desvinculada e identificável; excluir livro limpa cenas                     |
| Arcos/eventos de livro ou aventura                                     | Dono do original; título, descrição, ordem/data narrativa opcional; vínculos em filhos                                                                 | Remoção de alvo marca vínculo indisponível; não apaga texto relacionado                                  |
| `adventures/{adventureId}`                                             | Criador; título, sinopse, idioma, `universeId` opcional, estágio `draft/ready/archived`; origem autoral/importação privada identificada                | Excluir original não retira silenciosamente notas particulares de campanhas                              |
| `adventures/{id}/parts`, `/scenes`, `/clues`                           | Dono da aventura; parte/ordem, prosa sanitizada, objetivo, pistas e caminhos escritos; IDs de referência tipados                                       | Exclusão de parte não perde cenas: confirmar mover ou manter sem parte; sem grafo avançado na V1         |
| `adventures/{id}/materials/{materialId}`                               | Dono; título, descrição, audiência pretendida `gm/players/public`, artifactId; arquivos privados separados                                             | Audiência pretendida não é grant; exclusão revoga seleções futuras e agenda limpeza por referências      |
| `campaigns/{campaignId}`                                               | Mestre; título, descrição privada, estado `planning/active/completed/archived`, universo opcional próprio e procedência `independent/original/edition` | Sem autoridade do criador da aventura sobre a mesa; exclusão revoga jogadores antes de limpeza           |
| `campaigns/{id}/baseEntities/{id}`                                     | Mestre; base copiada autorizada, chave de origem, revisão/hash capturados, grant/licença de procedência                                                | Origem apagada fica identificada; política de direitos governa cópia e acesso, não nome da entidade      |
| `campaigns/{id}/variants/{id}`                                         | Mestre; `baseEntityId`, conteúdo local inteiro, revisão e privacidade da base usada; marcação de entidade retirada localmente                          | Variante prevalece só nessa campanha; descarte restaura base autorizada, não lore vivo                   |
| `campaigns/{id}/sessions/{sessionId}`                                  | Mestre; título, ordem, estado `planned/running/completed`, data opcional, resumo privado                                                               | Encerrar não publica diário nem modifica cânone; exclusão preserva confirmação e revoga projeções        |
| Filhos da sessão: cenas, missões, notas, acontecimentos, consequências | Mestre; referências e conteúdo escolhido, datas, estado e origem; listas separadas                                                                     | Consequência pode sobreviver como registro da campanha após remoção da sessão, se mestre confirmar       |
| Proposta de cânone                                                     | Proponente mestre; destino universo/entidade, versão esperada, alteração escolhida; estados `pending/accepted/rejected/withdrawn`                      | Apenas dono do universo aceita; guardar recibo mínimo, sem copiar diário inteiro                         |
| `editions/{editionId}` e documentos capturados                         | Criador; tipo/origem, versões/hashes, título, manifesto de direitos, idioma, artefatos por audiência, data de captura                                  | Conteúdo selado imutável; retirada comercial, bloqueio de direitos e privacidade têm controles separados |
| Controle da edição/preparação                                          | Criador/servidor; revisão do controle, estado `preparing/ready/active/withdrawn/blocked`, progresso e versões de consentimento                         | Não ativar edição parcial; retirada para novas vendas não apaga a edição comprada                        |
| Artefato                                                               | Dono/edição/campanha, audiência, caminho interno, tamanho, mediaType, hash, origem/licença                                                             | Caminho/token nunca é grant; exclusão idempotente só após verificar referências e política de retenção   |

Participações, convites e projeções são fechados na W2-F1-03; ofertas/pedidos/direitos
na W2-F1-04. Não misturar créditos de IA, acesso à obra e valores de venda.
SchemaVersion controla formato; revision controla edição; privacyVersion/accessVersion
controlam revogação. Seus contadores não são intercambiáveis.

## Vínculo vivo, edição e variante

| Estratégia                     | Benefício                                         | Risco                                                         | Escolha                                   |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| Lore vivo do universo          | Autor mantém consistência entre originais         | Mesa recebe mudança sem controle se depender dele diretamente | Apenas originais autorais autorizados     |
| Snapshot de edição/base        | Proveniência e conteúdo da compra/sessão estáveis | Precisa de decisão explícita para atualizar                   | Base de campanhas e edições distribuíveis |
| Sobreposição por campo         | Atualizações automáticas mais granulares          | Conflitos/mesclagem e consentimento muito complexos           | Fora da V1                                |
| Substituição local da entidade | Comportamento previsível e isolado                | Comparação de entidade inteira ao atualizar base              | Variante da campanha na V1                |

Restaurar base ao descartar variante exige autorização e versão de privacidade vigentes.
Base revogada aparece como origem indisponível, sem reexibir conteúdo; notas autorais
particulares permanecem separadas. Comparação/adaptação aplica o mesmo controle.
Variantes derivadas conservam procedência e versão de privacidade; não se tornam
conteúdo independente por renomear ou editar. Quando há conteúdo derivado revogado,
o recurso derivado deixa de ser entregue; notas próprias em recursos separados são preservadas.
Permissões de documentos base/variantes são fechadas em W2-F1-03, inclusive leitura direta.

Atualizar base gera comparação por identidade: adicionadas, alteradas, retiradas e
variantes em conflito. Mestre escolhe manter base, adotar nova ou adaptar variante.
Nova edição nunca substitui compulsoriamente a aquisição anterior. Uma compra não
concede acesso ao universo privado original nem direito comercial de publicar a cópia.

Desvincular universo de original conserva manuscrito/lore local, remove vínculo vivo e
invalida projeções que dependiam do consentimento anterior. Campanha conserva procedência
da base permitida; não promove variantes para um novo universo por troca de vínculo.
Ao trocar universo, seleção/compare explícitos impedem resolução de entidades só por nome.
Revogação de privacidade governa leituras/artefatos futuros, inclusive snapshots antigos;
não prometer apagar PDFs já baixados nem apagar automaticamente autoria particular da mesa.

## Simulação de contrato: uma origem, duas mesas e um livro

| Passo                       | Universo U / original A / livro B                           | Campanha C1                                         | Campanha C2                       | Resultado de contrato                        |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Base                        | Guardiã G revisão 3; A captura edição E1; B usa lore vivo U | Base G3 de E1                                       | Base G3 de E1                     | Três identidades de escopo separadas         |
| Sessão C1                   | Nenhuma gravação em U/A/B                                   | Variante G local: guardiã ausente; sessão concluída | Base G3 intacta                   | Encerramento não promove cânone              |
| Autor muda U                | G revisão 4; B acompanha origem autorizada; E1 intacta      | Variante/base capturadas intactas                   | Base G3 intacta                   | Atualização de origem não altera mesas       |
| Edição E2                   | Nova captura publicada; E1 ainda adquirida                  | Mestre mantém E1 e variante                         | Mestre aceita comparação/adota E2 | Atualização opcional por campanha            |
| Proposta C1                 | Dono recebe apenas alteração escolhida, expectedRevision 4  | Proposta pendente; diário privado                   | Não recebe proposta/diário        | Autoria da aventura não abre acesso à mesa   |
| Cânone muda antes do aceite | G chega a revisão 5                                         | Proposta em conflito, sem aplicação                 | Base própria intacta              | Dono compara antes de aceitar                |
| Origem removida             | Referência original indisponível; edição segue política     | Base autorizada e notas locais identificadas        | Base autorizada identificada      | Não apagar nem renomear notas por inferência |
| Consentimento revogado      | Versão de privacidade aumenta                               | Leituras/projeções futuras respeitam revogação      | Mesma restrição de origem         | Snapshot não contorna privacidade            |

Simulação é análise de contrato, não teste de campanha existente. Dados de exemplo são originais.

## Corpus e limites medidos

Inspeção privada com `pypdf.extract_text` em 2026-10-13, somente números/hash.
Nenhum texto/imagem protegido foi copiado ao repositório. Sem avaliação visual,
importação no Writer ou benchmark de performance neste ensaio.

| Arquivo real                    | Bytes de arquivo | Páginas / com texto | Texto UTF-8 total | Maior página de texto |
| ------------------------------- | ---------------- | ------------------- | ----------------- | --------------------- |
| A Minha Perdida de Phandelver   | 21.126.626       | 64 / 63             | 280.725           | 7.127 bytes           |
| Harry Potter e a Pedra Filosofa | 1.459.149        | 327 / 324           | 477.385           | 2.097 bytes           |

Identificação: aventura SHA-256 `6faaa6e225a10f645264b42581b4f0ece255aff7eb0512d12f1e3257af986443`;
livro `7a9f62442d2f406d9eda6b5fe9d0b3f9c30642fc21ad3bf283d79e691663fbbb`.
Esses textos extraídos não incluem overhead HTML/JSON, imagens nem perda de layout;
não concluem que uma obra completa cabe em um único documento.

Ensaio Node: 100.000 pontos de código geraram 100.000 bytes ASCII, 200.000 com `á`
e 400.000 com emoji; envelope JSON mínimo somou 14 bytes. Limitar caracteres somente é insuficiente.

| Restrição                     | Contrato de implementação                                                                                                   | Evidência/ensaio necessário                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Prosa nova                    | Até 800.000 bytes UTF-8 por documento de prosa, envelope completo até 900.000 bytes na serialização validada; nunca truncar | Base do aceite IA existente; testar rich text/envelope e serialização Firestore em F2-05/06 |
| Dados legados maiores         | Leitura compatível e exportação/backup; edição V2 acima do limite oferece divisão explícita ou preserva sem escrever        | Não rejeitar o acervo antigo por migração automática                                        |
| Material binário              | Storage separado, hash/tamanho/mediaType e autorização; nenhum binário/base64 no documento                                  | PDF real 21 MB; limites de upload por mediaType medidos em F2-09/F4-03                      |
| Cenas, lore, sessões, versões | Documentos individuais e consulta por escopo; sem array crescente no pai                                                    | Teste de paginação/ordem/exclusão na feature responsável                                    |
| Página de novas listas        | Padrão 25; limite servidor 50; cursor por chave de ordenação + ID, escopo e filtro; nunca offset                            | Parâmetro técnico inicial, sujeito a ensaio; biblioteca atual já pagina 25                  |
| Relações/aliases              | Preservar teto existente de 50 relações/20 aliases em lore global; vínculos de cenas em filhos                              | Sem quota comercial por contagem de obras                                                   |
| Histórico                     | Snapshot separado, leitura paginada; não compactar/excluir versões automaticamente                                          | Retenção/custo operacional D-09 e F1-06 ainda necessários                                   |

JSON UTF-8 é um orçamento de aplicação, não a contagem exata do formato Firestore.
Testar gravação real/emulador e campos/indexação antes de fechar o gate funcional.
Não aplicar novo teto global de upload inferior ao corpus de 21 MB sem tratar importação privada.

## Concorrência, recuperação e exclusão

Autosave atual usa fila por instância e não exige expectedRevision. Histórico futuro
deve capturar antes/depois na mesma transação da gravação. Aceite IA mantém hash,
texto, contagem, crédito e recibo atômicos, acrescentando revisão/histórico nessa transação.
Preferências de modelo/raciocínio e chaves permanecem fora de edições/backup compartilhável.
Cliente offline guarda a base observada; nunca reaplica texto local sobre revisão nova
sem comparação. Dados inválidos permanecem recuperáveis no adaptador autorizado.

Exclusão V2: marcar deleting/bloquear mutações → incrementar versões de acesso/privacidade
pertinentes → revogar projeções e entregas futuras → limpar filhos/arquivos por páginas
com cursor/recibo → finalizar tombstone. Retry continua, sem recriar origem removida.
Mestre exclui somente sua campanha. Dono do universo não recebe poder de apagar diários
alheios por desvincular origem. Retirada comercial não equivale à exclusão do original.
Retenção comercial e exceções por direitos/privacidade permanecem em W2-F1-04.

Migração aditiva por recurso, autenticada, versionada e idempotente: relatório por ID,
checksum/backup antes, dry-run, leitura legada e ensaio de restauração. Conservar atos,
ordem, conteúdo, personas, lore e IDs. Não migrar durante GET nem apagar campos desconhecidos.
Antes de produção, ensaiar rollback/recuperação com cliente antigo e interrupted jobs.

## Proposta de ADR

**Título:** Domínios explícitos, edições imutáveis e variantes locais.
**Status:** proposta de implementação; consolidação em W2-F1-06.
**Decisão:** preservar books; acrescentar adventures/campaigns/publications por responsabilidade;
usar snapshots autorizados e variante de entidade inteira; CAS/revisões, paginação e exclusão retomável.
**Alternativas rejeitadas:** projeto genérico para tudo, campanhas sobre lore vivo e merge por campo na V1.
**Consequências:** mais documentos/artefatos e comparação explícita, em troca de isolamento e compatibilidade.
**Pendências:** retenção comercial, limites de binários medidos, autorização detalhada e confirmação de pilotos.

Contratos, simulação e medições podem orientar a próxima tarefa de permissões.
Eles não comprovam os critérios funcionais de campanhas, migração ou concorrência;
esses testes ficam nos incrementos F2/F3/F4 pertinentes e no gate integrado F5.
