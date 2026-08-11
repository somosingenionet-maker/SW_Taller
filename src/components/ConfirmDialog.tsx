import { AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const iconColors = {
    danger: 'bg-rose-100 text-rose-600',
    warning: 'bg-amber-100 text-amber-600',
    info: 'bg-blue-100 text-blue-600'
  };

  const btnColors = {
    danger: 'bg-rose-600 hover:bg-rose-700',
    warning: 'bg-amber-500 hover:bg-amber-600',
    info: 'bg-blue-600 hover:bg-blue-700'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${iconColors[variant]}`}>
                  {variant === 'info'
                    ? <Info className="w-5 h-5" />
                    : <AlertTriangle className="w-5 h-5" />
                  }
                </div>
                <h3 className="font-extrabold text-slate-800 text-sm">{title}</h3>
              </div>
              <button
                onClick={onCancel}
                className="p-1 hover:bg-slate-100 rounded-md transition text-slate-400 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
            </div>

            <div className="px-6 pb-5 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm text-slate-600 font-medium"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-sm font-bold text-white transition ${btnColors[variant]}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
