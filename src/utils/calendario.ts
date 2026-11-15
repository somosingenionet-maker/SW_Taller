/** Descarga un archivo de calendario (.ics). Al abrirlo, el móvil o el ordenador ofrece añadir la cita al calendario. */
export function descargarIcs(contenido: string, nombre = 'cita.ics'): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
