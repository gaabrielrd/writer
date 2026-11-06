# ADR 0291 — configuração histórica de ciclos sem autorização reutilizável

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

Workflows e sequências misturam instrução própria, configuração, contagens e grants
operacionais. Seus leitores/drivers podem reconciliar ou avançar trabalho. IDs de
filhos sem nascimento congelado não provam uma encarnação histórica original.

## Decisão

Projetar workflow-job/sequence-job em checkpoint desabilitado e documento privado.
Conferir schema, ator, livro e nascimento próprio antes de selecionar instrução e
limites; repetir a separação nos registros associados. Não chamar controladores
mutáveis ou selecionar títulos em cache, corpos ou resultados derivados.

Preservar limites/fases como texto histórico, snapshot público e contagens com seu
escopo correto. Usar os bindings nativos congelados para relações recíprocas de
sequências/workflows concluídos. Recriações deixam o ID original indisponível.
Ponteiros de filhos sem nascimento ficam explicitamente desconhecidos, sem adotar
uma origem atual por coincidência de ID.

## Consequências

30 famílias internas, até dois artefatos/1 MiB por bundle e partes 64 KiB. Nenhuma
autorização de geração, aplicação, débito ou publicação pela restauração. Dezesseis
casos preparados, nenhum executado. Produtor, restauração v2 e encerramento integral
continuam pendentes. Ver o
[incremento 43](../tasks/producao-literaria/43-checkpoints-de-workflows-e-sequencias.md).
