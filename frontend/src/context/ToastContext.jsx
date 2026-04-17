import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_STYLE = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-300',
    cardClass: 'border-emerald-400/40 bg-emerald-500/90',
  },
  error: {
    icon: XCircle,
    iconClass: 'text-rose-300',
    cardClass: 'border-rose-400/40 bg-rose-500/90',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-300',
    cardClass: 'border-amber-400/40 bg-amber-500/90',
  },
  info: {
    icon: Info,
    iconClass: 'text-sky-300',
    cardClass: 'border-sky-400/40 bg-sky-500/90',
  },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 2800) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast = {
      id,
      message: String(message || ''),
      type: TOAST_STYLE[type] ? type : 'info',
    };
    setToasts((prev) => [...prev, toast].slice(-4));
    if (duration > 0) {
      window.setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const value = useMemo(() => ({ showToast, removeToast }), [showToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-3">
        <div className="w-full max-w-md space-y-2">
          {toasts.map((toast) => {
            const style = TOAST_STYLE[toast.type] || TOAST_STYLE.info;
            const Icon = style.icon;
            return (
              <div
                key={toast.id}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-white shadow-xl backdrop-blur-md ${style.cardClass}`}
              >
                <div className="flex items-start gap-3">
                  <Icon size={18} className={`mt-0.5 shrink-0 ${style.iconClass}`} />
                  <p className="text-sm font-medium leading-5">{toast.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
