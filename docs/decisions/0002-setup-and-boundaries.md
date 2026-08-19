# 0002 - Setup verificável e fronteiras executáveis

- **Status**: Aceito
- **Data**: 2026-07-26

## Contexto

O template documentava limites entre features, mas não os verificava localmente. O setup também podia remover demonstrações sem atualizar a composição, produzindo imports quebrados.

## Decisão

- Manter `notes` como a única demonstração canônica.
- Fazer `--remove-example` remover somente a demonstração canônica `notes`,
  preservar features desconhecidas e gerar um shell válido.
- Separar nome exibido, identificador npm e organização.
- Testar o setup em diretórios temporários.
- Executar `check:architecture` dentro de `npm run validate`.
- Verificar pela AST que `fetch` e `localStorage` permanecem nas pastas de
  fronteira e que `import.meta.env` permanece no módulo de configuração.
- Validar dados persistidos e propagar falhas de armazenamento para a interface.

## Consequências

O projeto gerado passa a ter um contrato verificável e erros locais mais claros.
Reexecutar o setup não apaga features criadas pelo usuário, e uma falha posterior
à remoção da demonstração restaura o estado anterior. A validação ganha uma etapa
curta, implementada com APIs nativas, sem nova dependência de runtime.
