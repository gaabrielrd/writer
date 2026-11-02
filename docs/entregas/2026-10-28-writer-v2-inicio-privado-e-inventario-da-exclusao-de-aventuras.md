# Início privado e inventário da exclusão de aventuras

- **Data**: 2026-10-28.
- **Branch/base**: codex/writer-v2, 24411d3.
- **Plano aberto**: [199](../tasks/writer-v2/execucao/199-exclusao-completa-de-aventuras.md).
- **Decisão**: [ADR 0222](../decisions/0222-adventure-deletion-start-and-inventory.md).

## Implementação local

Serviço interno próprio com início, resolução de resposta incerta, consulta e
catálogo de metadados. Fonte atual/nascimento/revisão são conferidos antes de
gravar, atomicamente, reserva permanente, job, recibo e revogação da raiz,
com desvínculo tipado do universo. Repetição exata não duplica efeitos.
Fence de início desconhecido impede chegada tardia e não cancela confirmado.

Provas nativas vinculam job/reserva/recibo e marcador. Raiz/metadados copiados
ou recriados recusam retomada antiga. Raiz ausente mantém a intenção e reserva.
Recibos usam máscaras por folha; catálogo de até 50 jobs conserva provas e
cursor por conta. Índice privado declarado, sem implantação.

Inventário v1: 19 coleções diretas e quatro grupos de filhos, com caminhos
exatos e metadados. Consulta limitada de filhos não depende de pai existente.
Remoção é feita pelas referências selecionadas em transações sintéticas de
teste; este incremento não inclui o processador de limpeza do produto.
Vazio final é uma consulta separada em cada família.

## Resultados dirigidos

- **28/28 Node**, 351,513 ms: 17 de início/recibos/rollback/CAS/catálogo e
  11 de inventário físico. Janela máxima de 50 jobs passou no orçamento
  transacional; 51 jobs paginam sem perda ou duplicação.
- **8/8 SDK/Rules reais**, 10155,7682 ms: commit nativo e mundo, concorrência,
  fence desconhecido, sourceToken antigo, cópia de todos os metadados,
  órfãos sem raiz, descendente inesperado e isolamento SDK/conta.
- O caso SDK de órfãos removeu 54 corpos próprios em páginas 25/25/4/0,
  sem hidratar texto, preservou o vizinho e detectou marco reaparecido depois
  da primeira certificação vazia.
- Prova SDK preliminar: quatro corpos, três consultas de duas unidades,
  raiz/pais ausentes e cinco caminhos alheios excluídos.
- Uma asserção Node inicial mediu também as leituras da criação da fixture
  pelo Estúdio; foi delimitada a medição ao novo protocolo e catálogo.
  Falha não foi contada como passe.
- Lint e Prettier dos arquivos alterados, arquitetura/docs/skills, diff e
  sintaxe de **398 módulos Functions** passaram.
- Revisão do escopo: 17 arquivos LF, sem .env, binários, marcadores de segredo
  ou arquivo acima de 2 MiB. Oito hashes de código/configuração conferidos
  antes/depois dos hooks; registro somente local.

Java/Firestore 1.22.0, Admin/SDK/Rules reais, projetos demo e loopback;
Auth de teste é sintético. Emulador e processos de QA próprios foram encerrados.
Nenhuma conta, credencial, corpo de manuscrito ou projeto real foi alterado.

## Estado e limites

Preparação interna, sem método novo em index.mjs, callable, botão ou cliente.
O job fica em quiescence; avanço, quiescência operacional completa, retirada de
Storage/usos, fontes/controles externos, atividade, verificação terminal,
UI/retomada e fechamento do bloco ainda faltam. **A tarefa 199 não está concluída.**

O inventário cobre as famílias autorizadas atuais. Recusa caminhos inesperados
encontrados; não representa uma varredura irrestrita de namespaces arbitrários
inseridos por administrador. Produção/índices/configuração não foram conferidos.
A fonte e os testes não substituem autorização atual para consumir conteúdo.

Sem alteração de interface ou de entrypoint de runtime, não se repetiram a
suíte frontend, o build ou o QA visual. O validate integral permanece no
fechamento do bloco 198–exclusão, conforme orientação do operador. P2/P3/D/
F2-09, gates humanos/comerciais e macro 8/35 seguem abertos.

Somente commit local; sem subagentes, CI, push/PR, merge ou deploy.
