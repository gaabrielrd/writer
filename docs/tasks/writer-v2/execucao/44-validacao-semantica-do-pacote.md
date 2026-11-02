# F2-09 P1 M11 — Validação semântica do pacote novo

Contrato em 2026-10-22 sobre 83531b8. P1/F2-09 continuam abertos.
Aplicar plan-feature/implement-feature/generate-tests/review-changes e documentar
evidência. Autorização sequencial vigente; commits locais, sem CI/push.

## Objetivo e requisitos

Validar o conteúdo completo writer-book-archive v1, além do envelope M10:
DTOs fechados, itens/partes únicos, hashes de texto/capa, identidades dos
envelopes, contagens e vínculos internos. Dados não executam HTML, URLs ou IA.
Relatório content-only não concede autoria, acesso, compra ou ativação.

Guardar no máximo um item JSON de 8 MiB e uma parte de texto/capa de 64 KiB,
além de contadores fixos. Não limitar silenciosamente tamanho total ou quantidade
de recursos/histórico. Índice temporário externo contém identidades e hashes,
nunca prosa/nome/título; produto usa OPFS com nomes HMAC e valores AES-GCM.
Chaves efêmeras apenas em RAM; erros/cancelamento encerram e removem diretório
próprio. Crash pode deixar ciphertext ilegível, sem chave persistida; coleta de
órfãos/retomada de revisão pertence ao host posterior.

## Schema

Rejeitar campos desconhecidos, JSON duplicado/não canônico, tipos/versões/IDs/
hashes/datas/ordens/ranks inválidos e conteúdo UTF-8 inválido. Preservar textos
exatos, BOM, vazio e ausência de metadados legados; não fabricar datas.
Reusar validadores puros de persona, origem e capa sem aplicar normalização
destrutiva ao conteúdo aceito.

Livro/atos/capítulos seguem projeção M3b. Recursos M5/M6 seguem seus envelopes
fechados e endereço SHA-256 de [kind,parentId,id]. Singleton/pai/tipo corretos;
toda cena tem corpo com hash/bytes iguais à metadata. Fonte de conversão tem
hash do texto original (ausência de content equivale ao vazio já usado na captura).
Lore global nunca entra como corpo local por referência.

Personas por vínculo usam SHA-256 de [scope,ownerId]. Conferir vínculo esperado
do livro/capítulo/fonte, perfis consistentes para mesmo ID e índices owners/
bindings inclusive donos sem persona. Draft é contribuição separada: capítulo
pode estar ausente, seu perfil pode diferir do vínculo salvo, mas deve corresponder
ao complemento declarado. Histórico aceita recursos removidos e confere partes,
bytes e hash exatos; não recriar o recurso atual para validar sua versão.

Seções têm índices e marcadores únicos; não aceitar registros depois do índice
da mesma seção. Capa confere manifesto, assinatura PNG e SHA-256 completo.
Origem/cover da raiz devem corresponder aos descritores das seções.

Filhos estruturais exigem pai atual: corpo/plano/referência de cena e marco
de arco. Outros vínculos locais ausentes (ato/agrupador de cena, lore, links)
produzem avisos contáveis sem descartar dados ou inventar recursos.
Referências externas permanecem identidade neutra e não disparam leitura remota.
Ativação/remapeamento definirá materialização final e revalidará autorização.

## Solução e sequência

1. Contrato DTO puro em Functions, reutilizável pelo servidor futuro, sem I/O.
2. Verificador de fluxo puro com portas de hash incremental/índice temporário:
   combinar JSON limitado, conferir texto/binário sem coletores, exigir EOF/selo
   e validar relações pelo índice após todas as seções.
3. Adaptador OPFS protegido em book-portability e serviço público de inspeção;
   IDs aleatórios por operação e cleanup somente do diretório criado.
4. Testes Node adversariais/duplicatas/hash/órfãos/contagens/legado ausente;
   teste Chromium do arquivo M10 com serviços/emuladores reais e índice OPFS.
5. Checks dirigidos, revisão, docs/ADR/entrega/AGENTS, commit local.
6. Próximo incremento: leitor JSON v1–v6 e avisos de ausência convergindo com
   esse schema, antes da UI/servidor de restauração.

## Não escopo e riscos

Não implementar ainda conversão v1–v6, UI/seletor externo, reserva de IDs,
materialização/remapeamento, ativação, recuperação de revisão ou P2/P3.
Sem novas dependências. Não tratar índice do cliente como prova do servidor.
Persistência temporária pode falhar por quota/permissão: falhar explicitamente,
sem fallback que acumule o projeto ou envie conteúdo a produção.
Separar warnings reais de metadados ausentes e vínculos neutros de dados inválidos.
Validate completo no fechamento P1, sem reduzir cobertura ou alterar hooks.

## Resultado local em 2026-10-22

Implementados schema, verificador puro, inspeção pública e índice protegido OPFS.
35 Node com regressões, lote cliente 119/119 e guardas finais 7/7 + índice 6/6.
Dois probes nativos positivos, de 11 e 12 cenários com sobreposição; último usa
arquivo de 170 registros e confirma limpeza/isolamento/cancelamento.
Veja [evidência M11](../../../entregas/2026-10-22-writer-v2-validacao-do-conteudo-do-backup.md)
e [ADR 0055](../../../decisions/0055-book-backup-content-validation.md).
Próximo passo: leitor JSON v1–v6. P1/F2-09 continuam abertos.
