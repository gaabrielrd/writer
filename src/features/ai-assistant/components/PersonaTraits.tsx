import {
  Eye,
  Scissors,
  Heart,
  Smile,
  Crown,
  Flame,
  CloudFog,
  Gauge,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { PersonaTrait } from '../model/persona';
import styles from './Personas.module.css';

const icons: Record<string, LucideIcon> = {
  sensory: Eye,
  concision: Scissors,
  introspection: Heart,
  humor: Smile,
  solemnity: Crown,
  tension: Flame,
  ambiguity: CloudFog,
  pace: Gauge,
};
export function PersonaTraitIcon({ id }: { id: string }) {
  const Icon = icons[id] ?? SlidersHorizontal;
  return <Icon className="icon" aria-hidden="true" />;
}
export function PersonaTraits({ traits }: { traits: PersonaTrait[] }) {
  return (
    <div className={styles.traitGrid}>
      {traits.map((trait) => (
        <article key={trait.id} className={styles.visualTrait}>
          <div className={styles.traitHeading}>
            <span className={styles.traitSymbol}>
              <PersonaTraitIcon id={trait.id} />
            </span>
            <h3>{trait.name}</h3>
            <strong className={styles.traitValue}>
              {trait.value}
              <small>/100</small>
            </strong>
          </div>
          <p>{trait.description}</p>
          <progress max={100} value={trait.value} aria-label={trait.name} />
          <div className={styles.traitScale}>
            <span>{trait.low}</span>
            <span>{trait.high}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
