# Reestruturação — [nome do projeto]

> Remover esta instrução e todos os textos entre colchetes ao preencher. O plano final não pode conter destinos indefinidos.

**Status:** Aguardando aprovação
**Última atualização:** [AAAA-MM-DD]
**Branch:** [ex.: chore/reestruturacao]

## 1. Diagnóstico

### O que o projeto faz

[Descrever o comportamento atual em uma ou duas frases, conforme verificado no código.]

### Stack e execução

- **Linguagem e framework:** [decisão verificada]
- **Gerenciador de pacotes e runtime:** [versões encontradas]
- **Como instalar / rodar / testar / empacotar:** [comandos reais]

### Estrutura atual

```
[árvore de pastas resumida como está hoje]
```

### Principais problemas

1. [Problema objetivo e onde ele aparece.]

### Linha de base

| Verificação | Comando   | Resultado hoje                    |
| ----------- | --------- | --------------------------------- |
| [Nome]      | [Comando] | [Passa / Falha com qual mensagem] |

### Dúvidas a confirmar com o usuário

- [Pergunta que o código não responde, ou “Nenhuma”.]

## 2. Mapa de capacidades para features

| Capacidade atual | Feature de destino | Interface pública (`index.ts`) |
| ---------------- | ------------------ | ------------------------------ |
| [Nome]           | `features/[nome]`  | [O que será exportado]         |

## 3. Destino dos arquivos

| Arquivo atual | Destino                      | Motivo                   |
| ------------- | ---------------------------- | ------------------------ |
| [Caminho]     | [Caminho final ou “remover”] | [Justificativa objetiva] |

Nenhum arquivo do projeto pode ficar fora desta tabela.

## 4. Fronteiras a isolar

| Fronteira            | Onde está hoje | Destino                |
| -------------------- | -------------- | ---------------------- |
| [HTTP / dados / env] | [Caminho]      | [Serviço ou adaptador] |

## 5. Incrementos

| #   | Incremento | Entrega observável | Como verificar | Reversão            |
| --- | ---------- | ------------------ | -------------- | ------------------- |
| 1   | [Nome]     | [Resultado]        | [Comando]      | [Como voltar atrás] |

- [ ] 1. [Incremento]
- [ ] 2. [Incremento]

## 6. Documentação a produzir

- [ ] `docs/prd.md` — [o que será reconstruído a partir do código]
- [ ] `docs/architecture.md`
- [ ] `docs/development-process.md`
- [ ] `docs/testing.md`
- [ ] [Outros documentos aplicáveis]
- [ ] ADRs: [temas que exigem decisão registrada]

## 7. Rede de segurança

| Comportamento crítico | Coberto hoje | Teste de caracterização necessário |
| --------------------- | ------------ | ---------------------------------- |
| [Nome]                | [Sim/Não]    | [Descrição do teste]               |

## 8. Riscos

| Risco  | Impacto  | Mitigação |
| ------ | -------- | --------- |
| [Nome] | [Efeito] | [Ação]    |

## 9. Não escopo

- [Feature nova, mudança de framework, redesenho, correção de bug ou otimização explicitamente excluída, com o encaminhamento proposto.]

## 10. Critérios de aceite

- **CA-01:** O comportamento observável ao final é idêntico ao da linha de base.
- **CA-02:** Todo arquivo está no destino definido na seção 3.
- **CA-03:** Nenhuma feature importa arquivos internos de outra feature.
- **CA-04:** [Critério adicional observável.]

## 11. Decisões e motivos

| Decisão | Escolha            | Motivo  | Alternativa descartada |
| ------- | ------------------ | ------- | ---------------------- |
| [Tema]  | [Escolha aprovada] | [Razão] | [Alternativa e motivo] |
