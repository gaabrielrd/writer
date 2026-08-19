import { FileQuestionMark, TriangleAlert } from 'lucide-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import styles from './RouteErrorFallback.module.css';

/**
 * Tela para enderecos que nao correspondem a nenhuma rota.
 * Usada tanto pela rota curinga quanto pelo `errorElement` diante de um 404.
 */
export function NotFound() {
  return (
    <section className={styles.container} role="alert">
      <h2 className={styles.title}>
        <FileQuestionMark className="icon" aria-hidden="true" />
        Pagina nao encontrada
      </h2>
      <p>O endereco acessado nao existe neste aplicativo.</p>
      <Link to="/">Voltar para o inicio</Link>
    </section>
  );
}

/**
 * Tela mostrada quando uma rota falha ao carregar ou ao renderizar.
 * Registrada como `errorElement` para que nenhum erro de rota resulte
 * em tela branca.
 */
export function RouteErrorFallback() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFound />;
  }

  const detail = error instanceof Error ? error.message : '';

  return (
    <section className={styles.container} role="alert">
      <h2 className={styles.title}>
        <TriangleAlert className="icon" aria-hidden="true" />
        Nao foi possivel carregar esta pagina
      </h2>
      <p>Tente novamente. Se o problema continuar, avise quem mantem o projeto.</p>
      {detail ? <pre className={styles.detail}>{detail}</pre> : null}
      <Link to="/">Voltar para o inicio</Link>
    </section>
  );
}
