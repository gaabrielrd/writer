# ADR 0114 — Diff literal e transporte cliente do lore

- Data: 2026-10-24.
- Estado: aceito internamente, sem habilitar o host de escrita.
- Plano: [99 / M38c5a](../tasks/writer-v2/execucao/99-diff-e-transporte-dos-campos-de-lore.md).
- Antecedentes: [ADR 0092](0092-complete-lore-client.md) e
  [plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md).

## Contexto

A ficha usada pelo formulário antigo preenche defaults e normaliza valores.
Salvar esse modelo pode apagar a diferença entre campo ausente e vazio,
alterar espaços/Unicode e reenviar relações ou textos grandes intocados.
Upload preparado exige a identidade exata da leitura observada e bytes
idênticos aos certificados pelo servidor.

## Decisão

O leitor C1 oferece capture, que devolve livro/ID/readToken e dados lógicos
da montagem integral reconfirmada, congelados em memória. Get/list mantêm
o formato e a mutabilidade anterior de seus resultados. A captura é CAS
observado, sem grant ou persistência; o servidor reautoriza toda operação.

planBookLoreEdit recebe operações explícitas de substituir/remover campo
sobre a captura bruta. Não deriva dirty fields de uma ficha normalizada.
Compara presença e valores literais, preservando ordem, duplicatas, campos
opcionais e datas. Nome/categoria não são removíveis; estruturas desconhecidas,
accessors, funções, arrays esparsos e Unicode inválido são recusados.

No-op não gera upload. O plano contém apenas identidade/CAS, campos alterados,
remoções e uploads necessários. Relações usam páginas de 64; mudança de
contagem/presença é declarada, páginas intocadas ficam para cópia servidor.
A forma da última página participa da comparação, sem enviar páginas retiradas.

O codec congela o valor antes do primeiro await. Escapa strings em fatias
limitadas e agrega UTF-8 em partes de 64 KiB; não cria JSON/UTF-8 do campo
inteiro. Preserva BOM, CRLF, escapes e composição Unicode. Usa noble já
instalado, sem APIs Node/Buffer no runtime do navegador.

Duas passagens lineares produzem SHA/Merkle e depois partes com provas. IDs
de operação e corpo seguem os domínios/hash canônicos do servidor. Memória
auxiliar mantém uma parte e hashes da árvore, além do valor congelado.
Não se introduz teto total de 8 MiB ou 128 partes. Retomar percorre o prefixo
uma vez; não reserializa o campo inteiro para cada parte.

Abort e guard são conferidos por unidade. A preparação e o salto do prefixo
cedem ao event loop, permitindo cancelamento; consumo das partes tem pressão
natural do iterador. Manifestos e provas não substituem autorização nativa.

## Consequências e portões

Capture, plano e codec são infraestrutura interna pública da feature, sem
novo endpoint ou interface visual. O CRUD SDK antigo não recebe bypass.
Host com acompanhamento explícito de campos tocados, orquestração de RPCs,
IDs/recibos/retries, política de recuperação e persistência protegida continuam
necessários antes de oferecer escrita completa ao usuário.

Demais escritores/consumidores de lore, backup lógico/indexado, ativação/
rollout e certificação de P1/F2-09/Writer V2 permanecem abertos. Nenhuma
implantação ou alteração comercial ocorreu.
