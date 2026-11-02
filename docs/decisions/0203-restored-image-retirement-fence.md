# ADR 0203 — retirada de imagem restaurada conserva marcador no Storage

Data: 2026-10-28. Estado: implementado e validado localmente; integração de mídia
nas aventuras ainda pendente.

## Contexto

O upload create-only com fence de cancelamento já bloqueava a recriação antes
da ativação. Porém, uma requisição podia ficar retida após HEAD ausente enquanto
outra preparava/aceitava o arquivo. A exclusão normal da biblioteca liberava o
caminho e o upload atrasado recriava bytes privados. A reprodução local usou o
adaptador e o serviço reais com doubles de Firestore/Storage; não houve acesso
a produção nem publicação de URL para os bytes recriados.

## Decisão

Estender o adaptador existente com retire(context, sourceProof, publishedProof
opcional). O contexto é neutro, sem bookId. Não alterar contratos antigos de
stage/verify/fence/accept. Retirada usa a geração preparada comprovada e permite
somente sua transição ativa com a metageração seguinte e metadados canônicos.

Substituir o PNG por objeto vazio permanente retired, accepted false, sem token,
application/octet-stream e private/no-store. CAS usa geração e metageração exatas
como strings decimais. Caminho ausente recebe create-only. O marcador registra
provas prepared/replaced e não é apagado; nenhum leitor antigo o aceita como PNG
preparado/ativo ou como fence de cancelamento.

Depois da substituição, remover a geração anterior comprovada em bucket
versionado, com ambas as precondições. Um PATCH de aceitação retido pode alcançar
a versão antiga: reconhecer somente a transição conhecida para active. Se mudar
entre inspeção e DELETE, o CAS falha e o próximo pedido retoma a limpeza, sem
apagar estado incerto. Reconfirmar o marcador após limpar a geração anterior.

Na biblioteca, ler contexto/provas exclusivamente do registro do servidor.
Contrato atual de livros usa restoreOrigin v1 e restoreStorage v1, com prova
publicada opcional. Presença de metadata de restauração inválida impede fallback
para exclusão bruta. Origem futura de aventuras exigirá contrato próprio;
não passar aventura como livro.

Claim deleting deve preceder I/O e exigir useCount zero e consulta limitada de
uses vazia. Repetições usam o mesmo claim. Depois de confirmar o marcador,
finalizar deleted em transação, conferindo nascimento nativo e conteúdo original.
Registro recriado ou alterado durante I/O é preservado. Concorrentes podem
confirmar o mesmo deleted original; falha externa ou rollback deixa deleting
retomável. Repetir remove sobre deleted restaurado reconfirma o marcador.

assets.retireRestoreImage liga o adaptador ao serviço em index.mjs. Imagens
sem procedência de restauração continuam usando assets.remove. Adaptador ausente
não autoriza exclusão bruta nem claim de imagem restaurada. Não alterar Rules,
permissões, dependências, job/recibos de ativação ou histórico de mídia.

## Consequências

Marcadores vazios ficam permanentes e continuam privados. É o custo de impedir
uma requisição antiga já liberada de recriar o payload; outro HEAD ou verificação
prévia de Firestore não fecha essa corrida. O marcador não concede autoridade de
projeto, biblioteca ou origem. Dados estrangeiros/mutações imprevistas recusam
retirada e permanecem preservados, inclusive versões antigas em conflito.

O fluxo atual não migra retroativamente um órfão de geração desconhecida criado
antes da correção. Não inferir pertencimento por nome, bytes ou metadata copiável.
As provas existentes são mantidas; não inventar uma geração original substituta.

A restauração de imagens de aventuras continua pendente de materialização com
intenção durável/Sharp, cleanup com fence, biblioteca/usos e ativação auditada.
