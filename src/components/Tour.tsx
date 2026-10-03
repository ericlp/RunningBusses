import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import type { Key } from '../i18n/sv';

export interface TourStep {
  /** CSS selector of the element to spotlight; omitted for a centred card. */
  target?: string;
  mode?: 'browse' | 'plan';
  filters?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  {},
  { target: '.leaflet-container', mode: 'browse' },
  { target: '.sheet', mode: 'browse' },
  { target: '.segmented', mode: 'browse' },
  { target: '.filter-panel', mode: 'browse', filters: true },
  { target: '.sheet', mode: 'plan' },
  { target: '.sheet', mode: 'plan' },
  { target: '.sheet', mode: 'plan' },
  { target: '.tools .tool:last-child', mode: 'browse' },
  {},
];

interface Props {
  onStep: (s: TourStep) => void;
  onClose: () => void;
}

export function Tour({ onStep, onClose }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  useEffect(() => {
    onStep(step);
    // the target may only exist after the mode or panel has switched
    const measure = () => {
      const el = step.target ? (document.querySelector(step.target) as HTMLElement | null) : null;
      setRect(el && el.offsetParent !== null ? el.getBoundingClientRect() : null);
    };
    const timer = window.setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useLayoutEffect(() => next.current?.focus(), [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, TOUR_STEPS.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pad = 6;
  const cardAtTop = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;
  const cardStyle = rect ? (cardAtTop ? { top: 70 } : { bottom: 12 }) : { top: '50%', transform: 'translateY(-50%)' };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('tour.aria')}>
      {rect ? (
        <div className="tour-hole" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-card" style={cardStyle}>
        <p className="muted">{t('tour.step', { n: i + 1, total: TOUR_STEPS.length })}</p>
        <h2>{t(`tour.s${i}.title` as Key)}</h2>
        <p>{t(`tour.s${i}.body` as Key)}</p>
        <div className="actions">
          <button className="chip" onClick={onClose}>
            {last ? t('tour.close') : t('tour.skip')}
          </button>
          <span className="spacer" />
          {i > 0 && (
            <button className="chip" onClick={() => setI(i - 1)}>
              {t('tour.back')}
            </button>
          )}
          {last ? (
            <button ref={next} className="primary compact" onClick={onClose}>
              {t('tour.done')}
            </button>
          ) : (
            <button ref={next} className="primary compact" onClick={() => setI(i + 1)}>
              {t('tour.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
