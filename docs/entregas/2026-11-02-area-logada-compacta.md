# Área logada compacta com navegação lateral

- Data: 2026-11-02.
- Branch: codex/writer-v2; base 8d1a724.
- Plano de origem: plano aprovado na conversa.
- Estado: implementação local; validação integral pendente.
- Orientação atual do operador: não executar testes nesta sessão sem solicitação.

## Implementação local

A área logada passa a ocupar a viewport, com lateral de 240 px recolhível e
gaveta no celular. Mantém os providers existentes, temas e fontes do manuscrito.
A densidade usa tokens locais, margens menores e superfícies opacas.
Home, login e leitor público continuam usando o cabeçalho público.

A navegação separa Criar (Estúdio, Universos e Imagens), Explorar (Publicações,
Catálogo e Biblioteca) e Configurar (IA). A marca Writer e o contexto da página
ficam à esquerda e centralizados apenas verticalmente. Com a lateral aberta, o botão de abertura não aparece
na barra principal. O botão de recolhimento permanece na lateral.

O rodapé agrupa perfil, saldo e tema em um card, sem separador externo.
Claro, Escuro e Sépia aparecem como botões segmentados com o ativo destacado.
O saldo e o seletor compartilham superfície, borda, raio e altura.
A seleção reutiliza o serviço de preferências existente, sem acesso direto
ao armazenamento pelo novo componente.

## Arquivos e documentação

A composição está em src/app/components/AuthenticatedWorkspace, com os espaços
em workspaceNavigation e StudioNavigation. ThemeSegmentedControl é exportado
pela interface pública de shared/theme. CreditsBadge aceita className opcional
para a composição privada, conservando a apresentação pública padrão.

O styleguide, a arquitetura e a documentação de testes foram atualizados.
Os cenários existentes foram adaptados aos links diretos, à gaveta e ao novo
contêiner de rolagem. As últimas mudanças não foram executadas em testes.

## Validação e limites reais

Antes da suspensão, os testes direcionados de app passaram (32 testes) e a
checagem de tipos passou. Rodadas Chromium conferiram os três temas e dispositivos,
encontrando seletores antigos e o deslocamento herdado do modal na gaveta.
Esses resultados pertencem às revisões anteriores, não validam os refinamentos
finais de seções, centralização, card ou seletor segmentado.

A primeira execução integral chegou aos testes de cobertura e registrou timeouts
de 5 s em persistência de lore; foi interrompida para reduzir concorrência.
O segundo validate, com VITEST_MAX_WORKERS=2 suportado pelo Vitest instalado,
foi interrompido a pedido do operador, junto com os processos de testes em curso.

Não há validate integral verde para este incremento. Não foram alterados limites,
timeouts ou cobertura para obter sucesso. Novas execuções ficam condicionadas a
solicitação do operador. Não houve push, merge ou deploy.

## Fora do escopo

Backend, permissões, cobrança, publicação, comércio e conclusão das fases do
Writer V2. O servidor de desenvolvimento existente continua sendo o ponto de
acesso local. A conferência dos refinamentos finais fica pendente.

## Ajuste de alinhamento e contraste

A marca e o contexto do cabeçalho foram alinhados à esquerda, conservando o
alinhamento vertical. Créditos e seletor de tema usam fundo transparente e
bordas mais discretas; o tema ativo usa destaque suave, sem sombra.
Nenhum teste foi executado após a orientação de suspensão.
