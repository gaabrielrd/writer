# ADR 0095 — Leitura das gerações achatadas de lore

- Estado: aceita para os leitores; produtor e adoção continuam pendentes.
- Data: 2026-10-23.
- Contexto: P1 M38c3c, passo 3a do [plano 81](../tasks/writer-v2/execucao/81-escrita-do-lore-completo.md).

## Problema

A base v1 reúne os campos não relacionais num único JSON. Editar um campo não
pode exigir reenviar os demais nem criar uma cadeia de overlays crescente.
Os uploads privados da ADR 0094 já produzem campos selados, mas ainda não são
adotados. Leitores precisam entender a nova geração antes de qualquer produtor.

## Decisão

Storage v2 tem schemaVersion, generationId, base, fields, dates, relations e
sealBirth. base é um ponteiro v1 ou null. fields contém somente os sete campos
não relacionais conhecidos, com ponteiro selado ou null para remoção explícita.
Ausência no mapa conserva a base. name/category não admitem remoção e devem
estar explicitamente presentes quando não há base. Não há ponteiros para outras
gerações ou overlays encadeados.

Cada ponteiro novo contém manifesto, expectedBirth e partSealBirth obrigatório.
A barreira das partes precede ou coincide com o header; o header precede ou
coincide com o selo da geração. Em cada unidade o reader exige imutabilidade,
identidade nativa, escopo UID/livro/ficha e prova Merkle. Um header novo não
legitima uma parte recriada depois da barreira original.

dates é autoritativo para createdAt opcional e updatedAt obrigatório. A presença
e os valores devem coincidir com o stub; o selo não pode estar depois da
atualização nativa da cabeça. A base antiga não fornece as datas finais por
inferência. Isso permite conservar uma ausência lógica quando necessária.
A futura adoção resolverá essas datas e privacidade no servidor.

relations conserva presença, quantidade e páginas de 64, com generationId e
sealBirth próprios. Assim, renomear uma ficha pode conservar as páginas
anteriores sem copiá-las ou fazer seu nascimento depender da nova raiz.
Segmentos v1 permanecem estritos; segmentos v2 exigem o novo ponteiro com
partSealBirth. Uma raiz v1 não admite um segmento v2.

O transporte retorna cabeçalho schemaVersion 2 somente para storage v2:
base opcional, mapa de manifestos/remoções, datas e contagens de relações.
Nenhum ID de corpo, Merkle, nascimento, ponteiro ou geração física é exposto.
A seção field recebe explicitamente o nome; base/relations antigos conservam
seu formato. Respostas de partes continuam schemaVersion 1 com field apenas
nessa seção.

Cada chamada reautoriza dono, livro, estado e token da ficha/clock. Com base
presente, uma parte de campo usa cinco leituras nativas; sem base, quatro.
Relações usam seis com base. Cada unidade lê exatamente um chunk de até 64 KiB.
Headers dos outros campos não são abertos nessa unidade.

O cliente valida cada seção por base64 canônico, tamanho, SHA integral,
UTF-8 estrito e JSON canônico. Confere o domínio da base antes dos overlays
e de cada valor novo, aplica remoções/datas e monta todas as relações.
Valida a ficha completa e reconfirma o cabeçalho/token antes de retornar.
Até quatro partes concorrentes são drenadas inclusive em erro. Não há teto
total de 8 MiB/128 partes nem cache persistente novo.

## Limites e consequências

Este incremento habilita leitores em código local, sem criar uma geração ativa
no produto. Fixtures que gravam cabeças v2 são harnesses de leitura explícitos:
não entregam adoção, CAS, alteração de lease, clock, privacidade ou GC.
A integração usa também um upload real selado, mas sua lease permanece sealed.

Antes de habilitar produtores, implementar leitura limitada da metadata lógica
da origem, adoção certificada, revogação/clock atômicos, reserva de criação,
exclusão/coleta e inventário do livro; atualizar todos os consumidores e drenar
versões antigas. Um recibo ou evento sealed não é autorização/disponibilidade
física atual. Não houve migração, ativação ou implantação.

## Evidência

A [entrega M38c3c](../entregas/2026-10-23-writer-v2-leitura-das-geracoes-de-lore.md)
registra 72 Node, 85 Vitest e três SDK distintos positivos, com leitores v1,
base/campo grandes, relações antigas/novas, corrupção e recriações nativas.
