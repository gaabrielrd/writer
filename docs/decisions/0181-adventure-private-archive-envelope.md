# ADR 0181 — envelope privado independente para aventuras

Data: 2026-10-26. Estado: aceito para implementação local.
[Plano 159](../tasks/writer-v2/execucao/159-formato-privado-de-aventuras.md).

## Contexto

Leitores P2 conferem autoria/origem por unidade; isso não define um arquivo
completo nem autoriza reusar a assinatura de livro. O framer existente é puro,
limitado e usado também no navegador; duplicá-lo criaria dois algoritmos de
integridade para manter.

## Decisão

portableBackupContainer contém somente framing/integridade e uma fábrica interna
com assinatura constante e classe de erro por domínio. Livro conserva APIs,
declarações e bytes WRITER-BOOK LF, versão 1; seu vetor Python permanece idêntico.
Aventura usa WRITER-ADVN LF, versão 1, e AdventureBackupFormatError. Cada leitura
fresca verifica assinatura antes de ler frames; os decoders recusam o outro domínio.

Limites existentes são mantidos: metadata 16 KiB, payload de frame 256 KiB,
quantidade uint32. Pacote autoral limita registros a 64 KiB. SHA-256 encadeado,
selo/EOF, cópia de buffers antes de awaits, cancelamento e layout indexado são
compartilhados; não há I/O, credencial, armazenamento ou autorização na fábrica.

adventureBackupPackage é um contrato de domínio separado: format
writer-adventure-archive, projectKind adventure, adventureId e oito seções
obrigatórias ordenadas: structure/resources/lore/personas/universe/history/drafts/
images. Kinds são fechados por seção; controles JSON canônicos, counts/bytes e
footer precisam coincidir, seguidos por selo binário e EOF exato.

O resultado é explicitamente validation=envelope-only. Payloads opacos não
certificam DTOs, unicidade, relações, completude das views, manifestos de histórico/
assets ou acesso. Assembler e validador de domínio seguintes devem fazer isso
antes de considerar um backup autoral/restaurável.

Cursor/index são checkpoints de um host confiável, não assinatura ou grant.
Não aceitar cursor contido no arquivo ou fornecido pelo usuário, nem transferir
checkpoint entre domínios; a validação fresca começa na assinatura. O arquivo
também não autentica origem comercial ou concede acesso a lore externo.

## Consequências e validação

Uma abstração pura atende os dois consumidores reais; validadores e políticas de
domínio permanecem separados. Contrato binário novo fica versionado, sem alterar
restauração/compatibilidade de livros. Vetores independentes, rejeição cruzada,
corrupção/truncamento, ordinais 9/10, cancelamento e cadeias intercaladas foram
testados, junto aos consumidores atuais de livro.

Não cria endpoint/Rule/UI, arquivo autoral completo ou restauração de aventura.
Validate integral foi fechado em 158 e não é atribuído a este código posterior;
este recorte tem testes dirigidos e build, com novo fechamento integral no
próximo grande bloco. Somente commits locais.
