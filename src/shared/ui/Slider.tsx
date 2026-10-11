import { useId } from 'react';
import styles from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  low: string;
  high: string;
  description?: string;
  disabled?: boolean;
}
export function Slider({
  label,
  value,
  onValueChange,
  low,
  high,
  description,
  disabled,
}: SliderProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <div className={styles.heading}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value}/100</output>
      </div>
      {description && <p id={`${id}-description`}>{description}</p>}
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange(Number(event.target.value))}
        aria-describedby={`${id}-scale${description ? ` ${id}-description` : ''}`}
        aria-valuetext={`${value} de 100; 0: ${low}; 100: ${high}`}
      />
      <div id={`${id}-scale`} className={styles.scale}>
        <span>0 · {low}</span>
        <span>100 · {high}</span>
      </div>
    </div>
  );
}
