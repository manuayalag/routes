import { useState, useCallback } from 'react';

export function usePlayer() {
  const [visible, setVisible] = useState(false);
  const [playerStep, setPlayerStep] = useState(0);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const goTo = useCallback((i: number) => setPlayerStep(i), []);
  const next = useCallback(() => setPlayerStep(s => s + 1), []);
  const prev = useCallback(() => setPlayerStep(s => Math.max(0, s - 1)), []);

  return { visible, playerStep, open, close, goTo, next, prev };
}
