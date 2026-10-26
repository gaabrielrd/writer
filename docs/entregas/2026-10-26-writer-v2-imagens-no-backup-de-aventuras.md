# Writer V2 — imagens autorizadas no backup de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: a6b7398.
[Plano 155](../tasks/writer-v2/execucao/155-imagens-autorizadas-no-backup-de-aventuras.md),
[ADR 0178](../decisions/0178-adventure-backup-authorized-images.md).

## Escopo entregue

Novo adventureBackupImageRead lista vínculos físicos e captura manifesto/bytes
PNG autorizados por fonte, head/cena dona, biblioteca privada e uso tipado.
Identidades nativas impedem adoção de vínculo/uso de raiz recriada. Biblioteca
pode legitimamente existir antes do projeto.

Cada leitura revalida após I/O. Geração/metageração/accepted/MIME/tamanho são
fixados, hash integral por stream e ranges até 64 KiB; bytes revogados não
voltam como sucesso. DTO conserva só metadata autoral e manifesto, sem
path/URLs/tokens de download/uso/owner. Ausência é explícita, sem fallback.

adventureImageUseKey foi extraída como função pura usada pelo produtor e
reader, sem mudar endereço/hash ou semântica de escrita. Adapter Storage
existente é reutilizado, sem cast de manifesto de livro.
Sem novo writer semântico, namespace/Rule/endpoint/runtime/UI/dependência.

## Validação dirigida real

Três arquivos Node selecionados (imagem, produtor de blocos e adapter):

```text
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 971.1055
```

35 novos e 15 regressões. Produtores reais de cena/adicional, imagem da
biblioteca anterior à aventura, uso tipado compartilhado, arquivo/sem parte,
53 vínculos/null, metadata sem prosa e bytes exatos/hash, chave nativa congelada,
conta/target/path/uso/schema/flags, mudança/recriação/nascimento, revogação
durante metadata/hash/range, formatos/tamanhos/assinatura/SHA, metageração/
geração, intenção capturada, erro/retry e nenhuma escrita.
26 casos iniciais passaram em 371,7745 ms; seleção ampliada anterior também
50/50 em 411,7427 ms. Repetida após tornar a biblioteca anterior à raiz no
fixture. Não somar execuções como casos distintos.

SDK real Firestore Emulator 1.22.0 e Storage runtime 1.1.3, artefatos verificados,
loopback/projeto demo e adapter real:

```text
# tests 3
# pass 3
# fail 0
# skipped 0
# duration_ms 14161.2348
M67 targeted adventure SDK passed
```

PNG real gerado por sharp, setters nativos de imagem em cena/adicional e uso
compartilhado; hashes/ranges exatos, contador/metadata sem mutação em leituras,
Rules de Storage para dono/outro/anônimo, remoção normal bloqueada por uso,
object generation nova, accepted false/true com metageneration diferente e
revogação após range real antes da resposta. Retry com uso refeito não altera
updateTime durante a leitura.

SDK emitiu MaxListenersExceededWarning em PassThrough; não suprimido, limite de
listeners não alterado, sem falha dos três cenários. Runner QA usou Java direto
e orçamento limitado, Storage persistence privada fora Git. Firestore PID 501752
foi conferido encerrado; não restaram filhos do runner Storage 495264. Nenhum
processo alheio foi encerrado nesta seleção.

Lint dirigido passou. Sintaxe/docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit; validate integral no fechamento de P2, conforme
orientação do operador. Nenhuma prova de produção ou UI nova é alegada.

## Revisão e pendências

Vínculo só abre arquivo canônico da mesma conta e uso tipado; PNG/metadata são
reconferidos após I/O. Caption/alt malformados não sofrem reparo silencioso.
Não assume consistência global de todas as famílias ou asset deduplicado sem
provas. O reader não escreve bytes nem inclui a biblioteca inteira.
Sem bloqueador identificado neste recorte interno.

Selo/pacote/revisão/restauração/UI/roundtrip e validate P2 continuam pendentes;
P2/P3/D, F2-09 e demais fases/gates abertos. Somente commit local, sem CI/
push/PR/merge/deploy/subagentes.
