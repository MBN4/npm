import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface DownwardOption { value: string; label: string; disabled?: boolean }

interface DownwardSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: DownwardOption[];
  placeholder?: string;
  disabled?: boolean;
}

/** A scrollable menu below its field, including inside scrolling modals. */
export const DownwardSelect: React.FC<DownwardSelectProps> = ({ value, onChange, options, placeholder = 'Select...', disabled }) => {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateRect = useCallback(() => setRect(triggerRef.current?.getBoundingClientRect() || null), []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onPointerDown = (event: MouseEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open, updateRect]);

  const selected = options.find(option => option.value === value);
  const maxHeight = rect ? Math.max(100, window.innerHeight - rect.bottom - 12) : 240;

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="select downward-select-trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => {
        if (!open && triggerRef.current && window.innerHeight - triggerRef.current.getBoundingClientRect().bottom < 160) {
          triggerRef.current.scrollIntoView({ block: 'start' });
        }
        updateRect();
        setOpen(current => !current);
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label || placeholder}</span>
      <ChevronDown size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
    </button>
    {open && rect && createPortal(
      <div ref={menuRef} role="listbox" className="downward-select-menu" style={{ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight }}>
        {options.map((option, index) => <button
          key={`${option.value}-${index}`}
          type="button"
          role="option"
          aria-selected={option.value === value}
          disabled={option.disabled}
          className="downward-select-option"
          onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}
        >
          <span>{option.label}</span>
          {option.value === value && <Check size={14} aria-hidden="true" />}
        </button>)}
      </div>, document.body
    )}
  </>;
};
