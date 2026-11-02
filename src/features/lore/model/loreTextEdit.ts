/** Preserve untouched CR/CRLF fragments when the textarea reports normalized LF. */
export function editLoreText(previous: string, next: string) {
  const display = previous.replace(/\r\n?/g, '\n');
  if (display === next) return previous;
  let start = 0,
    end = 0;
  while (start < display.length && start < next.length && display[start] === next[start]) start++;
  while (
    end < display.length - start &&
    end < next.length - start &&
    display[display.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  function offset(index: number) {
    let raw = 0,
      shown = 0;
    while (shown < index) {
      if (previous[raw] === '\r' && previous[raw + 1] === '\n') raw += 2;
      else raw++;
      shown++;
    }
    return raw;
  }
  return (
    previous.slice(0, offset(start)) +
    next.slice(start, next.length - end) +
    previous.slice(offset(display.length - end))
  );
}
