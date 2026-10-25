# ADR 0150 — Publicação de livros com lore nativo

- Status: marcos A e B implementados e validados localmente; P1 ainda aberto.
- Data: 2026-10-25.
- Plano: [130](../tasks/writer-v2/execucao/130-publicacao-com-lore-nativo.md).

## Contexto

Publicação cliente lia cabeças como fichas, omitindo campos segmentados e a
precedência privada local/global. Rules conhecem apenas o consentimento na
cabeça; não interpretam JSON em payloads. Campanhas aceitam universo/aventura
por contratos próprios, não fichas de livros.

## Decisão do marco A

Captura C1 integral no cliente preserva dados/tokens originais e coleção inteira.
CaptureCollection mantém listToken e fontes imutáveis; verifyCollection confere
IDs/tokens, headers autorizados e novamente a lista, sem baixar corpos.
Sessão fixa objeto Auth e UID original independentemente da mutabilidade do objeto.
Não usar LoreEntity visual/defaults como fonte de publicação.

GetBookPublicationSource oferece descriptor fechado e hash de metadata nativa:
nascimento/updateTime do livro/universo, clock local, status/data/privacidade/
cenas e marcador público do universo. Hash/listToken não concedem autorização.
A prova é fixada antes de ler globais; revalidada antes/depois de staging.
Colisão de IDs públicos entre escopos rejeita antes de escrever.

StageBookPublicationLore reautoriza origem e token C1, resolve consentimento
lógico e projeta somente nome/aliases/categoria/resumo. Preserva os limites
públicos anteriores (200/20x200/140) e exige aliases como subsequência ordenada
do original. Sem truncamento. Campo ausente não recebe default que dê consentimento.
Nome segue o trim público legado; a fonte não é normalizada.

FinalizeBookPublication reconstrói a prova na transação, confere header staged
e ativa ponteiro/status atomicamente. Replay pode confirmar o ponteiro original
ainda válido sem escrever; conflito não reabre retirada nem troca a autoria.
Revisões e itens existentes fornecem identidade do evento; não há novo journal/
coleção privada. Staging órfão continua invisível e usa o cleanup existente.

Rules negam cópia local direta e ativação SDK quando hasLoreResources é true,
preservando capítulos/atos/globais staged, unpublish e cleanup autorizados.
Header nativo exige hashes de prova. Ponteiro já marcado nativo não pode ser
sobrescrito pelo caminho legado. Flag permanente/drain continuam gates de P1.

Header guarda sourceLoreToken de coleção e sourcePublicationToken; ponteiro
guarda somente o segundo hash. São metadata opaca, não tokens de leitura de uma
ficha, segredo ou grant. Detalhes/notas/relações e readToken de fichas nunca são
gravados na projeção pública. Autor público continua explicitamente informado.

## Escala do marco B e consequências

Cliente ainda transfere o lore integral autorizado, inclusive campos privados;
não afirmar leitura seletiva nessa fronteira. Custo linear e sem cache persistente.

O cliente novo prepara um certificado pelo inspetor existente. Intent/contexto
ganham publicationHash opcional; contratos anteriores permanecem válidos.
Cada avanço recebe candidato fechado (nome aparado, aliases originais completos,
categoria/resumo), limitado pelas regras públicas, e compara caracteres
decodificados com posições/contagens. Whitespace nas extremidades do nome pode
ocupar muitas partes, sem ser retido. Não há normalização do original.

Overrides públicos v2 são validados por uma parte de 64 KiB por transação, com
parser e SHA completos. Depois, a base é inspecionada integralmente, comparando
somente campos efetivos não substituídos. Consentimento conserva sua unidade
própria. Checkpoint guarda apenas sintaxe, contadores e estados SHA; candidato
e campos privados não são persistidos nele. Ready emite o certificado nativo
existente, cujo contextHash inclui publicationHash.

Stage exige origem nativa ainda autorizada, candidato exato e certificado ready
original. Só o novo propósito verificado permite copiar os quatro valores sem
reler chunks; certificado apenas de metadata não concede essa capacidade, nem
concede leitura atual de corpos. Subsequência ordenada de aliases continua
conferida sobre os aliases originais completos.

Recibos/CAS/fence/cleanup continuam no namespace da inspeção: nenhum journal/
coleção/documento filho adicional. Novo cursor publication é cancelado e limpo
pela exclusão já existente do livro. ID determinístico por UID/origem/candidato
permite retomar após resposta perdida; Auth original é conferido a cada await.
Não há persistência de prosa da publicação no navegador.

O caminho RPC antigo sem certificado mantém seu orçamento de
32 MiB/512 partes/900000 bytes lógicos por chamada. O cliente novo sempre
prepara e usa o certificado, sem fallback. Fontes v1 e overrides v2 acima desse
orçamento foram validados; sem transação ou resposta ilimitada.

[Evidência A](../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-a.md):
36 Node, 135 Vitest e 19 SDK positivos.
[Evidência B](../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-b.md):
139 Node distintos, 98 Vitest e cinco SDK positivos; tipos/build/smoke/checks.
O escopo técnico do plano 130 está implementado e validado localmente.
Demais consumidores/inventários/backup/restauração/drain/rollout/validate de P1,
fases 3–5 e gates humanos/comerciais continuam necessários. Sem CI/remoto/deploy;
Functions/Rules e cliente precisam de entrega coordenada futura.
