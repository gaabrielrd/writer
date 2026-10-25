# ADR 0150 — Publicação de livros com lore nativo

- Status: marco A implementado localmente; escala do marco B pendente.
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

## Limite aberto e consequências

Cliente ainda transfere o lore integral autorizado, inclusive campos privados;
não afirmar leitura seletiva nessa fronteira. Custo linear, sem cache persistente.
Servidor copia apenas campos públicos em RAM, mas v1 exige validar toda a base.
Orçamento atual é 32 MiB/512 partes/900000 bytes lógicos por chamada; fonte maior
pode falhar sem alteração, mas a publicação para todas as fontes válidas permanece
incompleta. Não contornar com transação sem limite.

Marco B deverá reutilizar SHA/ranges/certificado de bookLoreSourceInspection por
unidades, preservando origem/recibos/fence/cleanup e evitando prosa no checkpoint.
[Plano 130](../tasks/writer-v2/execucao/130-publicacao-com-lore-nativo.md) continua
aberto; este marco sozinho não encerra publicação nativa completa ou P1.

[Evidência](../entregas/2026-10-25-writer-v2-publicacao-nativa-marco-a.md):
36 Node, 135 Vitest e 19 SDK positivos; tipos/build/smoke/checks locais.
Nenhuma tela/dependência/mídia/crédito novo. Sem CI/envio remoto/deploy; novas
Functions e Rules ainda exigem entrega futura. Demais consumidores/inventário/
backup/restauração/drain/rollout/validate, fases 3–5 e gates continuam necessários.
