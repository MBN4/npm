import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, User, UserPlus, Phone } from 'lucide-react';

export interface Customer {
  id: number;
  name: string;
  mobile?: string;
  current_balance: number;
  credit_limit?: number;
}

interface CustomerSelectProps {
  customers: Customer[];
  selectedCustomerId: string;
  onSelectCustomer: (id: string) => void;
  onAddNewCustomer?: () => void;
  placeholder?: string;
}

export const CustomerSelect: React.FC<CustomerSelectProps> = ({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  onAddNewCustomer,
  placeholder = "Walk-in Customer (General)"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCustomer = customers.find(c => String(c.id) === selectedCustomerId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelectCustomer(id);
    setIsOpen(false);
    setSearchQuery('');
  };

  const filteredCustomers = customers.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.mobile && c.mobile.includes(q))
    );
  });

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="input"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: 'var(--bg-card)',
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--border)',
          boxShadow: isOpen ? '0 0 0 2px rgba(2, 132, 199, 0.2)' : 'none',
          padding: '0.45rem 0.75rem',
          minHeight: '38px',
          borderRadius: 'var(--radius-md)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', flex: 1 }}>
          <User size={14} style={{ color: selectedCustomer ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{
            fontSize: '0.82rem',
            fontWeight: selectedCustomer ? 700 : 500,
            color: selectedCustomer ? 'var(--text-main)' : 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {selectedCustomer
              ? `${selectedCustomer.name}${selectedCustomer.mobile ? ` (${selectedCustomer.mobile})` : ''}`
              : placeholder}
          </span>
          {selectedCustomer && Number(selectedCustomer.current_balance) > 0 && (
            <span className="badge badge-danger" style={{ fontSize: '0.62rem', flexShrink: 0, padding: '0.1rem 0.35rem' }}>
              Due: Rs. {selectedCustomer.current_balance}
            </span>
          )}
        </div>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', marginLeft: '0.5rem', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 9999,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5), 0 8px 12px -6px rgba(0,0,0,0.3)',
          maxHeight: '300px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search Bar & Add Button Header */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', display: 'flex', gap: '0.4rem' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="input"
                placeholder="Search name or mobile..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '2.1rem',
                  fontSize: '0.78rem',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)'
                }}
              />
            </div>
            {onAddNewCustomer && (
              <button
                type="button"
                onClick={() => { setIsOpen(false); onAddNewCustomer(); }}
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                title="Create new customer account"
              >
                <UserPlus size={12} />
                <span>+ New</span>
              </button>
            )}
          </div>

          {/* List Options */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {/* Walk-in Customer Option */}
            <div
              onClick={() => handleSelect('')}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: selectedCustomerId === '' ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                color: selectedCustomerId === '' ? 'var(--primary)' : 'var(--text-main)',
                fontWeight: selectedCustomerId === '' ? 700 : 500,
                borderBottom: '1px solid var(--border)'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedCustomerId === '' ? 'rgba(2, 132, 199, 0.15)' : 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <User size={13} style={{ color: 'var(--text-muted)' }} />
                <span>Walk-in Customer (General)</span>
              </div>
              {selectedCustomerId === '' && <Check size={14} style={{ color: 'var(--primary)' }} />}
            </div>

            {/* Filtered Registered Customers */}
            {filteredCustomers.map(c => {
              const isSelected = String(c.id) === selectedCustomerId;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelect(String(c.id))}
                  style={{
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                    color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: isSelected ? 700 : 500,
                    borderBottom: '1px solid rgba(255,255,255,0.03)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = isSelected ? 'rgba(2, 132, 199, 0.15)' : 'transparent'}
                >
                  <div>
                    <div style={{ fontWeight: isSelected ? 800 : 600 }}>{c.name}</div>
                    {c.mobile && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Phone size={10} />
                        <span>{c.mobile}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: Number(c.current_balance) > 0 ? 'var(--danger)' : 'var(--text-muted)'
                    }}>
                      Balance: Rs. {c.current_balance}
                    </span>
                    {isSelected && <Check size={14} style={{ color: 'var(--primary)' }} />}
                  </div>
                </div>
              );
            })}

            {filteredCustomers.length === 0 && searchQuery && (
              <div style={{ padding: '1rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                No registered customer found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
