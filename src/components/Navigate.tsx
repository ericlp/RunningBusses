import { useState } from 'react';
import { useAppearance } from '../appearance';
import { directionsUrl, VASTTRAFIK_PLANNER_URL, type Destination } from '../domain/navigate';
import { t } from '../i18n';

/** "Navigate to start": Google Maps walking directions, or the Västtrafik planner with the stop name copied. */
export function NavigateChip({ dest }: { dest: Destination }) {
  const { navProvider } = useAppearance();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const stop = dest.name.trim();
  const google = (label: string) => (
    <a className="chip" href={directionsUrl(dest)} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
  const vasttrafik = (label: string) => (
    <a
      className="chip"
      href={VASTTRAFIK_PLANNER_URL}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        setCopied(false);
        navigator.clipboard?.writeText(stop).then(() => setCopied(true), () => undefined);
      }}
    >
      {label}
    </a>
  );
  // without a stop name there is nothing to hand to Västtrafik
  const provider = !stop && navProvider !== 'google' ? 'google' : navProvider;
  return (
    <>
      {provider === 'google' && google(t('courses.navigate'))}
      {provider === 'vasttrafik' && vasttrafik(t('courses.navigate'))}
      {provider === 'ask' && (
        <>
          <button className="chip" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t('courses.navigate')}
          </button>
          {open && google(t('nav.google'))}
          {open && stop && vasttrafik(t('nav.vasttrafik', { name: stop }))}
        </>
      )}
      {copied && <span className="muted" role="status">{t('nav.copied', { name: stop })}</span>}
    </>
  );
}
