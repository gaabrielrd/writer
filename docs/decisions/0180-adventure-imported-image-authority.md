# ADR 0180 — imagem de cena criada antes da ativação

Status: aceita; corrige condição de idade do head na ADR 0178.
Data: 2026-10-26.

## Problema e decisão

Importador nativo prepara cenas/corpos/partes antes de criar a raiz na ativação.
Leitor 155 comparava nascimento do head com raiz e bloqueava importação legítima,
inclusive vínculo sem imagem. Dois testes pelo produtor real reproduziram a falha.

Remover somente comparação de nascimento head/cena dona >= raiz. Preservar
identidade nativa válida, owner/schema/flags, caminho privado e backlink.
A autorização dos bytes continua exigindo uso tipado exato com nascimento
posterior ou igual à raiz atual, biblioteca ativa e geração/metadata verificadas.

Imagem só pode ser vinculada pelo writer normal depois da raiz existir; esse
uso posterior é a prova atual do grant. Não abrir job/recibo/chave de importação
para justificar asset. Cena anterior é válida, uso antigo de raiz recriada não.
Vínculo null não autoriza bytes e permanece estado explícito sem lookup Storage.

Histórico não é materializado pelo importador antes da ativação. Versão manual
posterior nasce depois da raiz; guard da ADR 0176 permanece e foi testado.

## Limites

Não muda importador, writer, RootSource, chave/criptografia, formatos, Rules,
runtime, namespaces ou dependências. Só reader e integração de testes.
Esta decisão substitui a exigência de idade do head da ADR 0178; a idade do
uso e todas as outras provas permanecem.

[Plano 157](../tasks/writer-v2/execucao/157-imagens-de-aventuras-importadas.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-imagens-de-aventuras-importadas.md).
