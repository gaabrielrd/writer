# ADR 0048 — Histórico completo por fluxo e hash incremental

- **Estado:** adotado localmente em 2026-10-21, sem deploy.
- **Contexto:** [M4](../tasks/writer-v2/execucao/37-historico-por-fluxo.md),
  [catálogo M1](0044-history-backup-snapshot.md), [framing M2](0045-book-backup-framing.md)
  e [estrutura M3b](0047-book-structure-read-proof.md).

## Decisão

Preservar o coletor M1 e acrescentar streamWorkHistoryBackup na interface pública
de manuscript-history. O novo caminho retém uma página de 50 resumos, quatro
partes de corpo de até 64 KiB e o estado incremental do hash. Não mantém coleção
de versões, corpos, IDs ou cursores já consumidos. Cabeçalhos/corpos são
provisórios até o fim do fluxo e a reautorização final.

listWorkVersions aceita order id opcional, com ID ascendente e escopo de cursor
próprio. Ausente conserva data/ID descendentes e os cursores existentes. O
consumidor verifica ordem UTF-8 estrita em todo o catálogo; assim detecta
duplicação/recuo, inclusive ID repetido com data diferente, sem um Set crescente.
Seleção e gates de acesso/sourceToken/historyRevision M1 permanecem iguais.

Revalidar manifesto, sequência, tamanhos e SHA-256 de cada versão. O gerador
retorna prova privada com target/source e totais; verifyWorkHistoryBackupStream
a confere novamente após as outras capacidades e antes do selo M2. Abort,
sessão trocada, origem alterada, hash inválido ou retorno antecipado impedem
prova/selo. Versões sem recurso atual continuam incluídas; não recriar seus alvos.

## Dependência e Unicode

SubtleCrypto.digest não aceita fluxo e exige a entrada inteira, conforme
[documentação Mozilla](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).
Adotar @noble/hashes **2.4.0** com lock/integridade, import seletivo sha2.js e API
incremental documentada no [repositório oficial](https://github.com/paulmillr/noble-hashes#implementations).
Pacote MIT, sem dependências de runtime e engine >=20.19.0, compatível com Node

> =22 do projeto; uma dependência direta adicionada, sem alterar Functions.
> Conferir vetores fixos e Node crypto; destruir o estado do hasher no finally.
> Não trocar hashes persistidos nem implementar criptografia própria.

Validar roundtrip UTF-8 sem normalizar texto ou identidades. TextDecoder usa
fatal e ignoreBOM: U+FEFF nos dados é conteúdo literal, inclusive no início da
parte/ID. A mesma correção foi aplicada à identidade da estrutura M3b. O framing
continua exigindo metadata JSON canônica; não relaxar sua validação.

O transporte padrão do fluxo é importado somente quando chamado pelo entrypoint
isolado. A interface antiga do histórico já importa as mesmas callables no app
principal: isso não promete separação de chunk. O build registra esse import
dinâmico ineficaz, sem erro de execução.

## Registros e composição

bookHistoryBackupRecords recebe o gerador tipado, sem import runtime de outra
feature, e emite work-version, work-version-text e índice final work-history.
Projeta somente campos fechados de VersionSummary; tokens/UID/recibos não entram
no arquivo. O índice inclui contagem, bytes e partes, inclusive catálogo vazio.
O adaptador confere seus totais/partes e fecha o produtor ao ser interrompido.

A ponte é restrita a livros e não torna aventuras portáveis. O orquestrador
completo ainda precisa reunir as demais capacidades, verificar todas as provas e
fechar o arquivo em sink persistente. Limite do serviço não prova memória do
consumidor; o [registro de entrega](../entregas/2026-10-21-writer-v2-historico-por-fluxo.md)
distingue a fixture nativa pequena do produto completo.

## Auditoria e operação

npm audit --omit=dev retorna três avisos moderados na cadeia existente
mammoth/argparse/sprintf-js, nenhum alto/crítico. A comparação com package/lockfile
do HEAD anterior retorna exatamente os mesmos achados; @noble/hashes não consta.
Não houve atualização/downgrade do importador neste marco. A auditoria não está
verde; os avisos existentes ficam registrados para tratamento próprio.

Nenhuma escrita, chave, crédito ou retenção mudou. Rollout M1/Rules/writers deve
estar coordenado antes de habilitar backup produtivo. Desenvolvimento permanece
em commits locais, sem CI, push, PR, merge ou deploy.
