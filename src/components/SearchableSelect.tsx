import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Plus } from 'lucide-react';

/** Una opción del desplegable. `sublabel` se muestra en gris bajo el label principal. */
export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  /** Si se pasa, añade una fila fija "+ {createLabel} '{término buscado}'" al final del desplegable. */
  onCreateNew?: (searchTerm: string) => void;
  createLabel?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar...',
  emptyMessage = 'Sin resultados',
  required,
  onCreateNew,
  createLabel = 'Crear',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = query.trim()
    ? options.filter(o =>
        `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const handleCreateNew = () => {
    if (!onCreateNew) return;
    onCreateNew(query.trim());
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Hidden native input for form required validation */}
      {required && (
        <input
          tabIndex={-1}
          required
          value={value}
          onChange={() => {}}
          className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
        />
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white flex items-center justify-between gap-2 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:border-slate-300 transition text-left"
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? (
            <span className="flex flex-col leading-tight">
              <span className="font-medium">{selected.label}</span>
              {selected.sublabel && <span className="text-[11px] text-slate-400">{selected.sublabel}</span>}
            </span>
          ) : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="text-slate-300 hover:text-slate-500 transition cursor-pointer"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="flex-1 text-sm outline-none bg-transparent placeholder-slate-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-300 hover:text-slate-500 transition">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && !(onCreateNew && query.trim()) ? (
              <li className="px-3 py-3 text-xs text-slate-400 text-center">{emptyMessage}</li>
            ) : filtered.map(opt => (
              <li
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 transition flex flex-col leading-tight ${opt.value === value ? 'bg-blue-50/60 font-semibold' : ''}`}
              >
                <span className="text-sm text-slate-800">{opt.label}</span>
                {opt.sublabel && <span className="text-[11px] text-slate-400">{opt.sublabel}</span>}
              </li>
            ))}
            {onCreateNew && query.trim() && (
              <li
                onClick={handleCreateNew}
                className="px-3 py-2 cursor-pointer hover:bg-blue-50 transition flex items-center gap-1.5 text-blue-700 border-t border-slate-100"
              >
                <Plus size={13} className="shrink-0" />
                <span className="text-sm font-medium truncate">{createLabel} "{query.trim()}"</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
