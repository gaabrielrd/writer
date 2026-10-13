# Integração dos modais na master

Data: 2026-10-13.

## Escopo

Integração local sobre `a2df540`, preservando o planejamento Writer V2 e a
correção de hierarquia do importador PDF. Apenas os três commits desta tarefa
foram reaplicados; alterações pendentes no checkout principal ficaram intactas.

| Commit original | Commit integrado | Entrega                                               |
| --------------- | ---------------- | ----------------------------------------------------- |
| `d0f24a1`       | `b8320f9`        | Modal de criação de livro mais largo e prévia lateral |
| `6334a76`       | `44da7c4`        | Remoção dos rótulos visíveis acima da prévia          |
| `3d2506d`       | `32413a9`        | Modal de persona com composição e atributos visuais   |

## Validação

- `npm ci` e `npm ci --prefix functions` no checkout isolado.
- `npm run validate`: passou, código de saída 0.
- Vitest: 108 arquivos, 763 testes aprovados; cobertura dentro dos limites.
- Verificações de scripts e servidor, arquitetura, documentação, styleguide,
  formatação, lint, TypeScript, build e smoke test aprovadas.
- Diff revisado: código dos modais idêntico ao dos commits originais; planejamento
  e importador preservados; `git diff --check` sem problemas.
- Validação visual permanece a registrada nas entregas dos modais; não houve
  mudança de interface nesta integração.

A primeira tentativa usou junctions para dependências e falhou porque o Vite
bloqueou o worker PDF fora do checkout. A instalação local resolveu o problema,
sem alteração de código. O build mantém os avisos existentes de tamanho de
chunks e importação dinâmica de DOCX.

Sem push ou deploy.
