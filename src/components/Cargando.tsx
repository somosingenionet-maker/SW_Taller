/** Pantalla de espera mientras llega el trozo de la aplicación que se acaba de pedir. */
export default function Cargando({ pantallaCompleta = false }: { pantallaCompleta?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${pantallaCompleta ? 'min-h-screen bg-slate-50' : 'py-24'}`} role="status" aria-label="Cargando">
      <div className="animate-spin w-8 h-8 border-[3px] border-slate-300 border-t-blue-600 rounded-full" />
    </div>
  );
}
