import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SearchableOption { value: string; label: string; sublabel?: string; disabled?: boolean }

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

/** Like DownwardSelect, but with a filter box in the menu for long catalogs (e.g. medicine pickers). */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Type to search...',
  emptyText = 'No matches found',
  disabled
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const updateRect = useCallback(() => setRect(triggerRef.current?.getBoundingClientRect() || null), []);

  useEffect(() => {
    if (!open) return;
    updateRect();
    setQuery('');
    const focusTimer = setTimeout(() => searchRef.current?.focus(), 0);
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
      clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open, updateRect]);

  const selected = options.find(option => option.value === value);
  const maxHeight = rect ? Math.max(160, window.innerHeight - rect.bottom - 12) : 320;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(option =>
      option.label.toLowerCase().includes(q) || (option.sublabel || '').toLowerCase().includes(q)
    );
  }, [options, query]);

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
      <div ref={menuRef} className="searchable-select-menu" style={{ top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight }}>
        <div className="searchable-select-search">
          <Search size={14} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
        <div role="listbox" className="searchable-select-options">
          {filtered.length === 0 && (
            <div className="searchable-select-empty">{emptyText}</div>
          )}
          {filtered.map((option, index) => <button
            key={`${option.value}-${index}`}
            type="button"
            role="option"
            aria-selected={option.value === value}
            disabled={option.disabled}
            className="downward-select-option searchable-select-option"
            onClick={() => { onChange(option.value); setOpen(false); triggerRef.current?.focus(); }}
          >
            <span className="searchable-select-option-text">
              <span className="searchable-select-option-label">{option.label}</span>
              {option.sublabel && <span className="searchable-select-option-sublabel">{option.sublabel}</span>}
            </span>
            {option.value === value && <Check size={14} aria-hidden="true" style={{ flexShrink: 0 }} />}
          </button>)}
        </div>
      </div>, document.body
    )}
  </>;
};
