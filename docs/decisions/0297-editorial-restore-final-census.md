# ADR 0297 — contribuição editorial e censo físico integral

- Estado: implementação local interna; testes preparados sem execução.
- Data: 2026-11-04.
- Complementa as ADRs [0295](0295-editorial-restore-materialization.md) e
  [0296](0296-editorial-restore-editable-heads.md).

## Contexto

A cópia editorial acrescenta recursos após a auditoria da base. Inflar sua
contagem invalidaria a igualdade exata do certificado anterior. Uma preparação
concluída também não comprova ausência de alvos físicos órfãos ou de execuções
nativas que não deveriam existir na cópia nova.

## Decisão

Registrar contribuição editorial monotônica em campo explícito do preparo v15,
vinculado ao controle nativo. Manter a contagem exata da auditoria da base e
verificar seu recibo imutável no commit observado antes de iniciar a cópia.
Conferir novamente o recibo e sua anterioridade ao controle no censo.

Paginar journals e alvos físicos em unidades de até oito, reutilizando o layout
antigo sem alterá-lo. Acrescentar famílias editoriais e exigir vazias as coleções
operacionais não restauradas. Tratar o controle mutável fora da âncora congelada,
autenticando-o junto ao job em cada unidade.

Fechar contexto, contagens e selo por recibo nativo. Consumir a prova em verify(tx)
antes dos writes, com reautorização e identidade de job/controle/selo. Preservar
root ausente, métodos internos e ativação fechada até integrar todos os gates.

## Consequências

Censo concluído não autoriza publicação nem restaura execução antiga. Revisão,
ativação, clocks da raiz, leitores, recaptura e exclusão seguem próprios. A
varredura pressupõe os produtores fechados e SDK impedido de mudar o preparo;
não promete imutabilidade de conteúdo que outro protocolo permita alterar.
Ver [incremento 49](../tasks/producao-literaria/49-censo-final-da-restauracao-editorial.md).
