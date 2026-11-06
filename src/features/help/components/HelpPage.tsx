import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, BookOpen, Dices, Search, ScrollText } from 'lucide-react';
import { Alert, Button, EmptyState, Input, PageHeader, Toolbar } from '@/shared/ui';
import { findHelpArticles, helpArticles, helpTopics } from '../model/helpContent';
import styles from './HelpPage.module.css';

const startingPaths = [
  { id: 'primeiro-livro', label: 'Escrever um livro', Icon: BookOpen },
  { id: 'primeira-aventura', label: 'Preparar uma aventura', Icon: ScrollText },
  { id: 'primeira-campanha', label: 'Organizar uma campanha', Icon: Dices },
];

function articlePath(id: string): string {
  return `/help?article=${encodeURIComponent(id)}`;
}

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const articleId = params.get('article');
  const article = helpArticles.find((item) => item.id === articleId);
  const selectedTopic = params.get('topic');
  const topic = helpTopics.find((item) => item.id === (article?.topic ?? selectedTopic));
  const results = findHelpArticles(query, topic?.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (articleId) {
      pageRoot.current?.scrollIntoView?.({ block: 'start' });
      heading.current?.focus({ preventScroll: true });
    }
  }, [articleId]);

  function search(value: string) {
    const next = new URLSearchParams();
    if (value) next.set('q', value);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <div className={styles.page} ref={pageRoot}>
      <PageHeader
        title="Central de ajuda"
        description="Entenda os conceitos do Writer e encontre o próximo passo para o seu trabalho."
      />
      <Toolbar
        label="Busca na ajuda"
        search={
          <Input
            type="search"
            label="Buscar na ajuda"
            placeholder="Tente: cenas, persona, restaurar…"
            leftIcon={<Search className="icon icon-sm" aria-hidden="true" />}
            value={query}
            onChange={(event) => search(event.target.value)}
            hint="Busque por uma tarefa, um conceito ou uma dúvida em toda a ajuda."
          />
        }
        actions={
          (query || articleId || selectedTopic) && (
            <Button variant="ghost" onClick={() => setParams({})}>
              Ver início da ajuda
            </Button>
          )
        }
      />
      <div className={styles.layout}>
        <nav className={styles.topics} aria-label="Assuntos da ajuda">
          <h2>Explorar por assunto</h2>
          <Link to="/help" aria-current={!topic && !articleId ? 'page' : undefined}>
            Todos os assuntos
          </Link>
          {helpTopics.map((item) => (
            <Link
              key={item.id}
              to={`/help?topic=${item.id}`}
              aria-current={topic?.id === item.id ? 'page' : undefined}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className={styles.content}>
          {articleId ? (
            article ? (
              <article className={styles.article} aria-labelledby="help-article-title">
                <Link className={styles.back} to={`/help?topic=${article.topic}`}>
                  <ArrowLeft className="icon icon-sm" aria-hidden="true" />
                  {topic?.title}
                </Link>
                <h2 id="help-article-title" ref={heading} tabIndex={-1}>
                  {article.title}
                </h2>
                <p className={styles.summary}>{article.summary}</p>
                {article.sections.map((section) => (
                  <section key={section.title}>
                    <h3>{section.title}</h3>
                    {section.paragraphs?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.steps && (
                      <ol>
                        {section.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    )}
                    {section.bullets && (
                      <ul>
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
                {article.note && <Alert variant="info">{article.note}</Alert>}
                {article.destination && (
                  <Link className={styles.destination} to={article.destination.path}>
                    {article.destination.label}
                    <ArrowRight className="icon icon-sm" aria-hidden="true" />
                  </Link>
                )}
                <section className={styles.related} aria-label="Continue a leitura">
                  <h3>Continue a leitura</h3>
                  <ul>
                    {article.related.map((id) => {
                      const related = helpArticles.find((item) => item.id === id)!;
                      return (
                        <li key={id}>
                          <Link to={articlePath(id)}>{related.title}</Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </article>
            ) : (
              <EmptyState
                title="Este artigo não foi encontrado"
                description="O endereço pode ter mudado. Explore os assuntos ou busque pelo que precisa."
                action={
                  <Button variant="outline" onClick={() => setParams({})}>
                    Explorar a ajuda
                  </Button>
                }
              />
            )
          ) : (
            <>
              {!query && !topic && (
                <section className={styles.start} aria-labelledby="help-start-title">
                  <h2 id="help-start-title">O que você quer fazer?</h2>
                  <div className={styles.paths}>
                    {startingPaths.map(({ id, label, Icon }) => (
                      <Link key={id} to={articlePath(id)}>
                        <Icon className="icon" aria-hidden="true" />
                        {label}
                        <ArrowRight className="icon icon-sm" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                  <p>
                    Novo por aqui?{' '}
                    <Link to={articlePath('mapa-do-writer')}>
                      Entenda como Universo, Livro, Aventura e Campanha se conectam.
                    </Link>
                  </p>
                </section>
              )}
              <div className={styles.resultsHeading}>
                <h2>
                  {query.trim() ? 'Resultados da busca' : (topic?.title ?? 'Guias e conceitos')}
                </h2>
                <p role="status" aria-live="polite" aria-atomic="true">
                  {results.length}{' '}
                  {results.length === 1 ? 'artigo encontrado' : 'artigos encontrados'}
                </p>
              </div>
              {topic && <p className={styles.topicDescription}>{topic.description}</p>}
              {results.length === 0 ? (
                <EmptyState
                  title="Nenhum artigo encontrado"
                  description="Tente um termo mais curto, como lore, sessão ou backup. A busca também lê o conteúdo dos guias."
                  action={
                    <Button variant="outline" onClick={() => setParams({})}>
                      Limpar busca
                    </Button>
                  }
                />
              ) : (
                <ul className={styles.results}>
                  {results.map((item) => (
                    <li key={item.id}>
                      <Link to={articlePath(item.id)}>
                        <div>
                          <h3>{item.title}</h3>
                          <p>{item.summary}</p>
                          {!topic && (
                            <span>
                              {helpTopics.find((entry) => entry.id === item.topic)?.title}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="icon icon-sm" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
