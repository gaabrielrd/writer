# ADR 0301 — aceite das pendências restauradas com CAS nativo

- Estado: implementação local; testes preparados sem execução.
- Data: 2026-11-04.

## Contexto

A leitura das pendências já identifica corrente original, alterada ou ausente.
O aceite precisa persistir a escolha sem sobrescrever trabalho manual ou
transformar referências históricas em autorização. Reconciliar por uma chamada
separada a saveLiteraryPlan criaria uma janela entre o plano e o aceite.

## Decisão

Extrair a preparação do escritor nativo de planos e compô-la no commit do aceite.
Manter corrente como escolha sem mudança de texto; reconciliar somente a lista
explícita de referências atuais, com autorização no servidor, preservando os
outros campos. Vincular CAS à origem, corrente, versão original, resolução e
clock editorial protegido. Não restaurar recursos ausentes ou políticas antigas.

Guardar resolução imutável por revisão original e recibos no namespace próprio.
Exigir vínculo nativo e nascimento comum; confirmar pedidos exatos historicamente,
sem repetir efeitos nem conceder acesso atual às fontes. Falta de um membro é
inconsistência. Clock avançado impede reaplicar wire antigo após perda de metadata.

Incluir ambos os namespaces na exclusão e exigir ausência antes de produzir uma
raiz restaurada. Explicitar SDK negado. Preservar o arquivo original e manter
reviewState separado da revisão atual do plano. Não registrar métodos públicos
até a composição da interface e da recuperação correspondentes.

## Consequências

O autor pode resolver pendências sem perder edições ou criar grants a partir do
backup. Escritor normal e reconciliação compartilham versão/índice/autorizações,
mas a extração precisa passar por regressão no próximo gate. Interface,
recaptura e abertura pública continuam pendentes. Testes Node/SDK preparados
sem execução; nenhuma implantação ou aceite integral do plano foi declarado.
