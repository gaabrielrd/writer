# Paridade do espaço de escrita — execução incremental

- **Data**: 2026-10-12
- **Branch**: `codex/editor-paridade`
- **Plano de origem**: [fase em 12 tarefas](../tasks/paridade-editor-gerador-temas.md)

## Objetivo

Trazer o editor/chat do Writer aos padrões de espaço ajustável, tela cheia,
raciocínio e organização visual observados no Gerador de Temas, conservando os
temas, manuscrito e contratos privados de IA.

## Incremento de 2026-10-12 — tarefas 1 a 3

### Funcionalidades e aceite

- [x] Contrato aprovado registrado com requisitos, tarefas e riscos.
- [x] Preferência de largura privada por usuário/navegador, com formato versionado,
      migração, isolamento e defaults seguros; sem apagar dados inválidos.
- [x] Divisor neutro em `shared/ui`, com drag, setas, Shift, Home/End, limites e
      restauração; preserva foco/seleção/texto e salva apenas ao terminar o gesto.
- [x] Demonstração funcionando no styleguide nos três temas.

### Arquivos e testes

`editor/model/workspacePreferences.ts`, `editor/services/workspacePreferencesStorage.ts`
e `workspacePreferences.test.ts` cobrem persistência, migração, falhas e isolamento.
`shared/ui/ResizeHandle.tsx`, seu CSS/testes e exportação pública cobrem interação
acessível; `StyleguidePage.tsx` demonstra o controle. `editor-workspace.visual.ts`
valida o comportamento no navegador. O styleguide documenta o novo componente.

### Resultados observados

```text
Tarefa 1: npm run validate verde — 743 testes da aplicação
Tarefa 2: npm run validate verde — 756 testes da aplicação; 13 testes dirigidos
Tarefa 3: npm run validate verde — 764 testes da aplicação; 8 testes dirigidos
Test Files 108 passed (108)
Tests 764 passed (764)
All files: statements 92.62%, branches 86.04%, functions 91.13%, lines 94.71%
scripts: pass 69; fail 0
functions: pass 73; fail 0
Smoke test do bundle OK.
Navegador: 6 passed (19.2s)
```

O lint tinha dois falsos positivos para o separator focável. A exceção é local
ao widget e documenta o padrão WAI-ARIA; sem enfraquecer regras globais. A seleção
do teste de drag passou a limpar o cursor anterior antes de criar a seleção real.
Capturas do navegador foram inspecionadas. Logs por tarefa ficam no diretório
de artefatos `paridade-editor` desta conversa, fora do repositório.

### Pendências da fase

As tarefas 4–12 continuam em execução. O divisor ainda não foi integrado aos
painéis neste incremento; tela cheia e raciocínio ainda não foram implementados.
Sem push ou deploy deste incremento. O arquivo paralelo de entrega permanece
fora das alterações e conserva o hash previamente registrado.

## Verificação manual deste incremento

1. Abra `/styleguide` e localize “Painéis redimensionáveis”.
2. Arraste o divisor ou use setas, Shift e Home/End; dê duplo clique para restaurar.
3. Troque entre claro, escuro e sépia; confira foco e ausência de transbordamento.
