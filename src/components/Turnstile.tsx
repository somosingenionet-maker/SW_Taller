import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opciones: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void; 'error-callback'?: () => void; language?: string }) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

export const CLAVE_TURNSTILE = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function cargarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((ok, fallo) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const el = existente ?? Object.assign(document.createElement('script'), { src: SCRIPT, async: true, defer: true });
    el.addEventListener('load', () => ok(), { once: true });
    el.addEventListener('error', () => fallo(new Error('No se pudo cargar la verificación.')), { once: true });
    if (!existente) document.head.appendChild(el);
  });
}

/** Captcha invisible de Cloudflare. Llama a `onToken` con el token cuando se supera y con '' si caduca o falla. */
export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const alToken = useRef(onToken);
  alToken.current = onToken;

  useEffect(() => {
    if (!CLAVE_TURNSTILE) return;
    let id: string | undefined;
    let vivo = true;
    cargarScript().then(() => {
      if (!vivo || !caja.current || !window.turnstile) return;
      id = window.turnstile.render(caja.current, {
        sitekey: CLAVE_TURNSTILE, language: 'es',
        callback: (t) => alToken.current(t), 'expired-callback': () => alToken.current(''), 'error-callback': () => alToken.current(''),
      });
    }).catch(() => alToken.current(''));
    return () => { vivo = false; if (id && window.turnstile) window.turnstile.remove(id); };
  }, []);

  return <div ref={caja} data-testid="turnstile" />;
}
