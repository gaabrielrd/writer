# Integrações e APIs

Como consumir dados externos com segurança neste template.

## Consumo de APIs

Todo acesso a uma API passa por `services/`, `adapters/` ou `repositories/`
dentro da feature. Infraestrutura neutra compartilhada pode usar as mesmas
pastas em `shared/`. Os componentes nunca fazem `fetch` diretamente. Isso
concentra a lógica de rede e o tratamento de erros em um só lugar.

`npm run check:architecture` rejeita `fetch` e `localStorage` fora dessas
fronteiras, além de rejeitar `import.meta.env` fora de
`shared/config/env.ts`. Arquivos de teste são excluídos dessas regras para que
possam preparar o ambiente e substituir APIs da plataforma.

Prefira o `fetch` nativo. Só adote uma biblioteca de requisições se houver necessidade real (e registre a decisão em um ADR).

## Variáveis de ambiente

- No Vite, apenas variáveis com prefixo `VITE_` são expostas ao código do cliente.
- Documente as variáveis necessárias em `.env.example`.
- Crie um `.env.local` para os valores do seu ambiente.
- **Nunca** faça commit de `.env` ou `.env.local`.

Exemplo em `.env.example`:

```
# VITE_API_BASE_URL=https://api.exemplo.com
```

## Segredos: proibido no front-end

Tudo que vai para o navegador entra no bundle e é **público**. Qualquer pessoa consegue ler. Por isso:

- Não coloque chaves de API secretas, senhas ou tokens no código nem em variáveis `VITE_`.
- Segredos só existem em servidores, que este template não inclui.
- Se uma integração exige um segredo, ela precisa de um backend intermediário — fora do escopo da versão 1.

## CORS

APIs externas precisam permitir a origem do seu app (cabeçalhos CORS). Se aparecer erro de CORS no navegador, o ajuste é do lado do servidor da API; não há como contornar apenas no front-end.

## Tratamento de erros

No serviço, verifique se a resposta foi bem-sucedida e traduza falhas em erros claros para a interface. Na tela, trate os estados explicitamente: **carregando**, **vazio**, **sucesso** e **erro**.

## Timeouts

Requisições podem travar. Use um timeout (por exemplo, com `AbortController`) para não deixar a interface esperando indefinidamente, e mostre uma mensagem de erro quando o tempo estourar.

## Dados fake em desenvolvimento e testes

Para desenvolver ou testar sem depender de uma API real, use um adaptador com dados fake que respeite a mesma interface do serviço. Assim a tela funciona igual, e os testes ficam rápidos e previsíveis.
