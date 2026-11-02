# Auditoria administrativa de recuperação de lore

Ferramenta do [plano 127](tasks/writer-v2/execucao/127-auditoria-das-chaves-historicas-de-lore.md)
e [ADR 0146](decisions/0146-historical-lore-recovery-key-audit.md).
Serve para revisar recuperações de um UID e revogar capacidades de livros
já apagados. A execução real é uma operação administrativa própria;
implementar ou testar a ferramenta não executa a auditoria em produção.

## Pré-requisitos

Use Node 22+, dependências de functions instaladas e credenciais administrativas
autorizadas para o projeto indicado. No emulador, FIRESTORE_EMULATOR_HOST deve
ser loopback 127.0.0.1:porta e o projeto deve ser demo. O projeto e UID são
sempre explícitos; nenhum projeto padrão é escolhido pela ferramenta.

Relatórios contêm IDs e hashes privados. Guarde-os fora do Git e limite o
acesso ao operador responsável. A ferramenta não exporta chaves, prosa ou
ciphertext.

## Gerar uma página

A partir da raiz do checkout, em PowerShell 7:

```powershell
node functions/scripts/audit-book-lore-recovery.mjs --project meu-projeto --uid UID_DO_AUTOR --limit 25 > "$env:TEMP\writer-lore-review.json"
```

O modo padrão só lê. O JSON contém projectId, uid, items e next. Quando next
não for null, passe esse ID como --after para a página seguinte, mantendo
o mesmo projeto/UID. Salve cada página em arquivo próprio. Limite de 1 a 50
controles por página, sem teto total.

| Estado          | Significado                                                                           |
| --------------- | ------------------------------------------------------------------------------------- |
| eligible        | Livro ausente, marcador e artefatos originais conferidos; contém control para revisão |
| book-present    | Há um livro com esse ID; nenhuma revogação automática                                 |
| already-revoked | Fechamento original conferido, sem resíduo de chave/índice                            |
| needs-review    | Provas ausentes/divergentes, marcador incompatível ou resíduo inesperado; preservar   |

Inspecione os itens e o escopo antes de aplicar. Um relatório não garante que
todo o projeto esteja livre de chaves órfãs. Inserções ou mudanças durante
paginação exigem nova conferência.

## Aplicar o relatório revisado

```powershell
node functions/scripts/audit-book-lore-recovery.mjs --project meu-projeto --uid UID_DO_AUTOR --apply "$env:TEMP\writer-lore-review.json"
```

Somente itens eligible são tentados. O arquivo precisa ter schemaVersion 1,
mesmo projeto/UID, no máximo 50 itens e 1 MiB de metadata. Flags e campos são
fechados; não há force ou autorização por path fornecido no relatório.
A revisão é validada antes de abrir o SDK.

Cada item é reconferido numa transação. Se o livro reaparecer, o marcador
mudar ou um artefato for recriado, a aplicação falha e preserva o resíduo.
Terminal/prova e remoção de chave/índice originais são atômicos.

Saída results informa revoked, already-revoked ou failed. Código de saída 1
interrompe no primeiro erro e conserva os resultados confirmados anteriores.
Não repita operações por estimativa: revise o motivo; quando apropriado,
o mesmo arquivo pode ser reapresentado e confirmará fechamentos anteriores.
Não tratar um erro de infraestrutura como confirmação de dado inválido.

Controles, recibos, marcadores e corpos remanescentes não são apagados.
Casos sem marcador/controle suficiente exigem reconciliação individual.
A ferramenta não certifica limpeza integral, não restaura livros e não
remove arquivos ou texto já autorizados no dispositivo.
