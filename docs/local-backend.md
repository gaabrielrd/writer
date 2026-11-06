# Backend local

O modo `emulators` conecta os SDKs de Auth, Firestore, Storage e Functions ao
projeto fictício `demo-writer`, exclusivamente em loopback. Não reutiliza contas,
dados ou credenciais de produção. App Check usa um token local sem assinatura,
aceito pelo emulador de callables; o build de produção recusa essa configuração.

Requer Node 24.12+, Java e Firebase CLI instalados, além das dependências da raiz
e de `functions`. Em dois terminais na raiz:

```powershell
npm run emulators
npm run dev:local
```

Abra o front em <http://127.0.0.1:5173> e o painel dos emuladores em
<http://127.0.0.1:4000>. Os serviços usam Auth 9099, Functions 5001,
Firestore 8080 e Storage 9199. As portas precisam estar livres.

Copie os parâmetros não secretos de `functions/.env.example` para
`functions/.env.local` para evitar perguntas na inicialização. Para trabalhar sem
provedor de IA, crie `functions/.secret.local` com
`BOOK_GENERATION_GEMINI_KEY=local-emulator-no-provider-key`. Esses dois arquivos
são ignorados pelo Git. Não há geração real de IA com esse valor.

Crie uma conta local pela interface ou pelo painel Auth. A sessão e os perfis
locais são separados do Firebase remoto. Sem importação/exportação explícita da
CLI, os dados do backend são temporários e desaparecem ao encerrar os emuladores.
O comando `npm run dev` mantém a configuração habitual.

As rotas HTTP de recuperação são encaminhadas às Functions locais. Os handlers
HTTP mantêm a verificação Admin de App Check: o token local das callables não
valida esses fluxos de recuperação. Jobs agendados não executam sem o emulador
Pub/Sub. Esse ambiente não comprova App Check, IA ou serviços de produção.
