# Writer V2 — transporte explícito da restauração

## Resultado

A composição local de Functions passa a declarar 31 comandos de restauração,
incluindo preparação, revisão, ativação, mídia e limpeza. Uma lista imutável e
fronteira pura recusam nomes internos, métodos herdados e redirecionamento pelo
payload. A seleção anterior por propriedade arbitrária foi removida.

Auth, App Check e configuração de recursos permanecem no callable existente.
Os comandos recebem private no-store e Vary Authorization ao entrar no handler.
A chave continua no HTTP separado, sem expor leitores privados ou helpers.

## Arquivos e aceites

Alterados index.mjs, contratos/lista e headers de upload; criado
bookRestoreCallable.mjs. Dois testes novos e 15 arquivos de teste anteriores
cobrem a mudança: asserções antigas de ausência dos comandos públicos agora
verificam sua presença, mantendo todas as provas de conteúdo/autorização.
Asserções que mantêm ports internos privados não foram alteradas.

[Plano 136](../tasks/writer-v2/execucao/136-transporte-da-restauracao.md) e
[ADR 0157](../decisions/0157-explicit-book-restore-callables.md).

## Testes dirigidos — resultado real

100 casos Node distintos positivos em seleções, sem suíte global:

- 36 casos de fronteira: lista imutável/exata, 31 encaminhamentos e headers,
  métodos internos/desconhecidos/herdados, conta inválida, erro preservado e
  serviço real de consulta/mídia/limpeza preservando o livro.
- 45 casos do host: exports fechados e HTTP de recuperação separado,
  configuração/Auth dos 31 comandos, dez verificações HTTP de App Check e
  três combinações de Auth/App Check/entrada fechada.
- 19 regressões dirigidas: materialização dos recursos afetados, headers e
  os quatro contratos HTTP anteriores de recuperação.

Primeiro lote: 77/78 positivos, 4606.682 ms. O caso de serviço real esperava
progress.state, mas getBookRestore retorna a view diretamente; corrigida somente
essa asserção. As verificações HTTP foram reforçadas para usar identidade
sintética válida e distinguir falha de App Check de Auth ausente.
Nova seleção: 15/15 positivos, zero skipped, 1760.959 ms; inclui três casos
novos e uma repetição do inventário dos exports. Não aumenta a contagem por
repetições. Regressões afetadas: 19/19, zero skipped, 4411.0648 ms.

## Alcance da prova HTTP

Servidor loopback, wrapper Functions real e verificadores de Auth/App Check
substituídos somente dentro do teste e restaurados ao final. App Check inválido
passa pelo verificador real de decodificação; tokens sintéticos válidos servem
para isolar a ordem dos gates. Sem flag de bypass em runtime.

Com identidade válida no teste, App Check ausente/inválido é recusado antes do
serviço. Com App Check válido no teste, Auth ausente/inválido é recusado; ambos
válidos alcançam entrada fechada e devolvem erro seguro sem conteúdo privado.
Não comprova Auth/App Check/Callable de produção ou implantação das funções.
Não houve nova transação ou mudança de Rules que exigisse repetir o emulador.

## Checks, revisão e limites

Formato, lint dirigido, sintaxe, arquitetura, documentação e diff verificados
no fechamento. Revisão conferiu lista/export, ausência de ports internos,
configuração, entrada literal e erros; sem dependência ou armazenamento novo.

Driver, journal cifrado, revisão/retomada/tela do cliente e roundtrip integral
ainda faltam. Inventários/writers/exclusão/legados/rollout/validate de P1,
fases 3–5 e gates humanos/comerciais continuam. Novas gerações indexadas mantêm
o padrão false. Vitest/browser/build/validate global não repetidos; suíte global
no fechamento de P1. Só commit local, sem CI, push, PR, merge, deploy ou subagentes.
Log de regressão externo m44-host-regression, sem artefato grande no Git.
