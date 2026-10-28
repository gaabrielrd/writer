# P2 — retirada segura de imagens restauradas no Storage

Base: 6ceacdc. Corrida reproduzida localmente: stage retido antes do create,
outro pedido prepara/aceita, biblioteca remove imagem desvinculada, stage atrasado
recria bytes privados. Correção necessária antes de reutilizar Storage nas aventuras.

## Requisitos e sequência

1. Estender bookRestoreCoverStorage.mjs com retire(context, sourceProof,
   publishedProof opcional), preservando stage/verify/fence/accept e seus contratos.
   Aceitar somente geração original preparada ou sua transição ativa comprovada.
2. Trocar payload por marcador retired vazio, accepted false, sem tokens e
   private/no-store, por CAS exato de geração/metageração. Caminho ausente recebe
   marcador com create-only; replay/confirmação perdida preservam o mesmo marcador.
   Registro de prepared/replaced provas no marcador permite limpeza retomável.
3. Bucket versionado: excluir somente geração substituída comprovada, com ambas
   precondições. Uma aceitação atrasada pode avançar apenas a metageração nativa
   conhecida de prepared para active; reconhecer essa transição exata, sem adotar
   mutação/objeto estrangeiro. Marcador nunca deve ser apagado.
4. Extrair em restoredImageRemoval.mjs a leitura fechada das provas já existentes
   na biblioteca de livros. Em imageLibrary.remove, imagens restauradas usam
   assets.retireRestoreImage; outras imagens mantêm assets.remove. Claim deleting
   antecede I/O, finalize deleted em transação conferindo nascimento/registro da
   biblioteca original. Erro mantém deleting e permite repetir; recurso recriado
   não é sobrescrito. Ausência do adaptador não permite fallback destrutivo.
5. Ligar retireRestoreImage no assets de index.mjs, usando o adaptador existente.
   Atualizar fixtures dependentes e preservar backup/finalização de mídia.
6. Testes Node e SDK GCS real via HTTP local: corrida reproduzida agora bloqueada,
   prepared/active/ausente, late PATCH, pedidos concorrentes/ACK perdido, gerações
   maiores que Number.MAX_SAFE_INTEGER, bucket versionado, metadados/objetos
   estrangeiros e renascimento da biblioteca. Regressões de capas/mídia.
7. ADR/docs/evidência/checks/revisão e commit somente local com hooks normais.
   Suíte integral no fechamento do bloco de mídia, conforme orientação do operador.

## Suposições, limites e aceite

Não criar API pública, dependência, novo direito de acesso ou alterar Rules.
Usar provas do servidor, nunca path/context/generation enviados pelo cliente.
Origem de livros atual é v1; a biblioteca das aventuras ainda depende de ativação
futura e terá seu contrato explícito. O protocolo Storage não exige bookId.
Não recuperar vínculo do usuário nem modificar texto ou outras imagens.

- [x] Marcador persistente impede upload atrasado e remove bytes/credenciais.
- [x] Replay e falhas externas/Firestore retomam sem apagar marcador ou documento alheio.
- [x] Tipos de imagem anteriores e finalização/backup preservados.
- [x] Casos dirigidos, wire SDK e Firestore positivos; documentação/checks e
      commit local registrado no histórico deste incremento.

A retirada não conclui Storage das aventuras ou P2. Permanecem materialização
com intenção durável/Sharp/fence, biblioteca/usos/ativação, agregados/audit,
recuperação cifrada/UI/roundtrip, P3/D/F2-09 e fases/gates seguintes. Macro 8/35.
