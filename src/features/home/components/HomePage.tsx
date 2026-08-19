import { NoteList } from '@/features/notes';
import styles from './HomePage.module.css';

const NPM_SCRIPTS: ReadonlyArray<{ command: string; description: string }> = [
  { command: 'npm run dev', description: 'Inicia o servidor de desenvolvimento (Vite)' },
  { command: 'npm run build', description: 'Type-check e build de produção' },
  { command: 'npm run lint', description: 'Roda o ESLint' },
  { command: 'npm run format', description: 'Formata os arquivos com Prettier' },
  { command: 'npm run typecheck', description: 'Verifica os tipos com o TypeScript' },
  { command: 'npm run test', description: 'Roda os testes com Vitest' },
  { command: 'npm run validate', description: 'Roda toda a suíte de verificações' },
];

export function HomePage() {
  return (
    <>
      <section className={styles.section}>
        <h2>Exemplo: notas</h2>
        <NoteList />
      </section>

      <section className={styles.section}>
        <h2>Comandos npm disponíveis</h2>
        <ul className={styles.scripts}>
          {NPM_SCRIPTS.map(({ command, description }) => (
            <li key={command}>
              <code>{command}</code>
              <span>{description}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
