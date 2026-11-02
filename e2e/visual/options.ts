export interface VisualOptions {
  visualTheme: 'light' | 'dark' | 'sepia';
  authenticated: boolean;
  libraryState: 'populated' | 'empty' | 'error';
  controlledClock: boolean;
}
