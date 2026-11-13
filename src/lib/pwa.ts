import { useEffect, useState } from 'react';

// App instalable (PWA): registro del service worker, aviso de «Instalar» y manifiesto propio del
// enlace del mecánico. Todo esto es una comodidad: si el navegador no lo soporta, la aplicación
// funciona igual.

/** Registra el service worker (solo en producción: en desarrollo estorba al recargar en caliente). */
export function registrarServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

type EventoInstalacion = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** ¿La página ya se está viendo como app instalada? */
export function esAppInstalada(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

/** iPhone o iPad con Safari: no avisa de «Instalar»; hay que explicar «Compartir → Añadir a pantalla de inicio». */
export function esIOS(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/**
 * Instalar la app: en Chrome/Edge/Android el navegador avisa cuando se puede (botón «Instalar»); en
 * iOS no hay aviso, solo se enseña una pista. Nada de esto sale si ya está instalada.
 */
export function useInstalar() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [instalada, setInstalada] = useState(esAppInstalada());

  useEffect(() => {
    const alAvisar = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalacion); };
    const alInstalar = () => { setInstalada(true); setEvento(null); };
    window.addEventListener('beforeinstallprompt', alAvisar);
    window.addEventListener('appinstalled', alInstalar);
    return () => { window.removeEventListener('beforeinstallprompt', alAvisar); window.removeEventListener('appinstalled', alInstalar); };
  }, []);

  return {
    puedeInstalar: !!evento && !instalada,
    pistaIOS: !instalada && esIOS(navigator.userAgent, navigator.maxTouchPoints),
    instalar: async () => {
      if (!evento) return;
      await evento.prompt();
      await evento.userChoice.catch(() => undefined);
      setEvento(null);
    },
  };
}

/** Color hexadecimal de 6 cifras o el de reserva (el color de marca viene de la base de datos). */
export function colorSeguro(color: string | undefined | null, reserva = '#2563eb'): string {
  return /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? (color as string) : reserva;
}

/**
 * Manifiesto del enlace de UN mecánico. El de la aplicación abre siempre «/»; este abre su propia
 * página: quien la instala en el móvil toca el icono y entra directo a sus coches. El enlace ya es
 * personal (lleva su clave), así que guardarlo en el icono no expone nada que no tuviera.
 */
export function manifiestoMecanico(urlActual: string, nombreTaller: string, color: string) {
  const origen = new URL(urlActual).origin;
  return {
    name: nombreTaller ? `Mis vehículos · ${nombreTaller}` : 'Mis vehículos',
    short_name: 'Mis coches',
    lang: 'es',
    start_url: urlActual,
    scope: `${origen}/mecanico/`,
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: colorSeguro(color),
    icons: [
      { src: `${origen}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${origen}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${origen}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/** Sustituye el manifiesto de la página por el del mecánico. Devuelve cómo dejarlo como estaba. */
export function usarManifiestoMecanico(urlActual: string, nombreTaller: string, color: string): () => void {
  const enlace = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const tema = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const hrefAntes = enlace?.getAttribute('href') ?? null;
  const temaAntes = tema?.getAttribute('content') ?? null;
  const manifiesto = manifiestoMecanico(urlActual, nombreTaller, color);
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifiesto)], { type: 'application/manifest+json' }));
  if (enlace) enlace.setAttribute('href', url);
  if (tema) tema.setAttribute('content', manifiesto.theme_color);
  return () => {
    URL.revokeObjectURL(url);
    if (enlace && hrefAntes !== null) enlace.setAttribute('href', hrefAntes);
    if (tema && temaAntes !== null) tema.setAttribute('content', temaAntes);
  };
}
