# Criação de projetos e assistente contextual

Base: origin/master `a89fc385701d07b62d45883270ffc963c53a5c92`, em worktree própria.
Plano aprovado na conversa em 2026-11-02; execução sem push, merge ou implantação.

## Objetivo e critérios

- Novo projeto começa pela escolha IA/manual, seguida de Livro/Aventura/Campanha.
- Universo e persona opcionais estão disponíveis antes da primeira geração.
- Contexto e decisões acompanham a abertura do projeto e a primeira escrita.
- Interface revela uma etapa por vez; detalhes e capa são opcionais.
- Chat pode propor operações dos controles habilitados da página, com confirmação.
- Criação e débito são atômicos e idempotentes, sem recriação após exclusão.
- O operador confirmou 2 créditos pelo texto dos três tipos; capa gerada custa 5.

## Incrementos implementados

1. Contrato aditivo v2 de sessão, tipo/método, universo/persona e origem conferida.
2. Entrada em /studio/new, seis caminhos e retorno sem perder a ideia em RAM.
3. Seletores com criação de universo e gerenciamento de personas pelas APIs públicas.
4. Proposta inicial por tipo, revisão salva e criação transacional pelo servidor.
5. Retomada da concepção pelo ID e conversa preservada ao navegar no mesmo projeto.
6. Catálogo compartilhado pela conversa de concepção e pelo assistente de página,
   prévia, confirmação por ação e vínculo da sugestão ao pedido original.
7. Campos controlados, seleções, navegação, diálogos e controles da aplicação usam
   seus handlers existentes. Texto rico continua pelo chat nativo do editor.
8. Testes dirigidos, jornadas Chromium, documentação e revisão antes do commit.

## Contratos e limites

A nova proposta é deliberadamente pequena: título, gênero/estilo e premissa.
Não gera automaticamente um conjunto obrigatório de fichas, capítulos ou sessões.
O usuário pode prosseguir pelas ações disponíveis no projeto. O fluxo assistido
legado em /books/new/assisted conserva sua revisão de fichas.

O catálogo contém até 80 controles visíveis e habilitados por captura. A IA
recebe IDs opacos e vocabulário estático, não seletores, valores atuais de campos,
senhas, corpos de manuscrito ou nomes derivados capturados da interface.
Controles com nomes dinâmicos exigem escolha/contexto explícitos quando ambíguos.
Arquivos e interações do sistema operacional continuam exigindo seleção humana.

Ações são confirmadas individualmente. Abrir um diálogo não salva seu conteúdo;
um campo preenchido permanece rascunho até o aceite normal. Somente os handlers
originais podem confirmar escrita, débito, exclusão ou publicação. As fontes e
revisões são revalidadas por esses handlers. Não há execução arbitrária de código,
RPC genérica, fallback SDK ou salvamento direto do editor pelo assistente.

Conversa de concepção usa a retenção existente de sete dias. A conversa de ações
fica em RAM, isolada por usuário/projeto, e não promete recuperação durável.
Troca de página invalida ações e respostas pendentes; troca de projeto/conta
encerra a conversa. A concepção confirmada é relida pelo servidor autorizado.

## Validação

Ver o registro da entrega após os gates finais. Fixtures não comprovam qualidade
do provedor real, implantação nem disponibilidade em produção.

## Estado da implementação local

Implementação revisada em worktree própria, sem commit, push, merge ou deploy.
Testes dirigidos, suíte de Functions e build passaram. O gate `npm run validate`
permanece pendente por timeouts em testes existentes de lore/backup, sem alterações
nesses arquivos. Evidência e limitações no [relatório de validação parcial](../entregas/2026-11-02-criacao-de-projetos-e-assistente-contextual.md).
