import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Sparkles, FlaskConical } from 'lucide-react';

export interface UnitCategory {
  category: string;
  units: string[];
}

export const STRENGTH_UNIT_CATEGORIES: UnitCategory[] = [
  {
    category: "Mass / Weight",
    units: ["mg", "mcg (µg)", "g", "kg", "ng", "pg"]
  },
  {
    category: "Concentrations & Liquids",
    units: ["mg/5 mL", "mcg/5 mL", "mg/mL", "mcg/mL", "g/mL", "%", "% w/v", "% w/w", "% v/v"]
  },
  {
    category: "Volume",
    units: ["mL", "L", "µL"]
  },
  {
    category: "Biological & Activity",
    units: ["IU", "IU/mL", "IU/day", "U", "U/mL", "mIU", "CFU"]
  },
  {
    category: "Electrolytes & Molar",
    units: ["mEq", "mEq/mL", "mEq/L", "mmol", "mmol/mL", "mmol/L", "mol", "M (mol/L)"]
  },
  {
    category: "Weight & BSA Based",
    units: ["mg/kg", "mcg/kg", "mg/kg/day", "mcg/kg/day", "mg/m²", "mL/kg"]
  },
  {
    category: "Infusion & Flow Rates",
    units: ["mL/hr", "mg/hr", "mcg/hr", "mcg/min", "mcg/kg/min", "U/hr"]
  },
  {
    category: "Packaging & Dosing Units",
    units: [
      "tablet (tab)", "capsule (cap)", "drops (gtt)", "drops/mL (gtt/mL)",
      "sachet", "ampoule", "vial", "puff", "spray", "dose", "patch",
      "suppository", "lozenge", "applicatorful", "teaspoon (tsp)", "tablespoon (tbsp)"
    ]
  }
];

export const POPULAR_QUICK_UNITS = ["mg", "mcg (µg)", "mg/5 mL", "mL", "IU", "%"];

interface StrengthInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export const StrengthInput: React.FC<StrengthInputProps> = ({
  value,
  onChange,
  placeholder = "e.g. 500mg, 10mg/5ml..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Apply chosen unit to existing numeric strength or set unit
  const handleSelectUnit = (unit: string) => {
    const cleanUnit = unit.split(' ')[0]; // Extract base symbol (e.g. "mcg" from "mcg (µg)")
    const trimmedVal = value.trim();

    if (!trimmedVal) {
      onChange(`1 ${cleanUnit}`);
    } else {
      // Check if value ends with a number
      const matchNum = trimmedVal.match(/^([\d.,/]+)\s*.*$/);
      if (matchNum) {
        onChange(`${matchNum[1]} ${cleanUnit}`);
      } else {
        onChange(`${trimmedVal} ${cleanUnit}`);
      }
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const q = searchQuery.trim().toLowerCase();

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Input Group with Text Entry & Unit Dropdown Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <input
          type="text"
          className="input"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minHeight: '38px', borderRadius: 'var(--radius-md)' }}
        />

        {/* Unit Selector Trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="btn btn-secondary"
          style={{
            minHeight: '38px',
            padding: '0.45rem 0.65rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            whiteSpace: 'nowrap',
            backgroundColor: isOpen ? 'rgba(2, 132, 199, 0.15)' : 'var(--bg-card)',
            borderColor: isOpen ? 'var(--primary)' : 'var(--border)',
            color: 'var(--primary)'
          }}
          title="Choose unit from master medical list"
        >
          <FlaskConical size={13} />
          <span>Unit</span>
          <ChevronDown size={12} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* Quick Unit Tags Bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
        {POPULAR_QUICK_UNITS.map(u => (
          <button
            key={u}
            type="button"
            onClick={() => handleSelectUnit(u)}
            className="badge badge-secondary"
            style={{
              cursor: 'pointer',
              border: '1px solid var(--border)',
              fontSize: '0.65rem',
              padding: '0.1rem 0.35rem',
              backgroundColor: value.includes(u.split(' ')[0]) ? 'rgba(2, 132, 199, 0.15)' : 'var(--bg-card)',
              color: value.includes(u.split(' ')[0]) ? 'var(--primary)' : 'var(--text-muted)'
            }}
          >
            +{u}
          </button>
        ))}
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          left: 0,
          zIndex: 9999,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 30px -5px rgba(0,0,0,0.5), 0 8px 12px -6px rgba(0,0,0,0.3)',
          maxHeight: '320px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Search Header */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.65rem', color: 'var(--text-muted)' }} />
              <input
                ref={searchInputRef}
                type="text"
                className="input"
                placeholder="Search units (e.g. mg, mcg, IU, mL, %)..."
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
          </div>

          {/* Categorized List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {STRENGTH_UNIT_CATEGORIES.map((catGroup, gIdx) => {
              const matchingUnits = catGroup.units.filter(u => u.toLowerCase().includes(q));
              if (q && matchingUnits.length === 0) return null;

              return (
                <div key={gIdx} style={{ marginBottom: '0.35rem' }}>
                  <div style={{ padding: '0.3rem 0.75rem', fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Sparkles size={10} />
                    <span>{catGroup.category}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.25rem', padding: '0 0.5rem' }}>
                    {(q ? matchingUnits : catGroup.units).map(unit => {
                      const baseSymbol = unit.split(' ')[0];
                      const isSelected = value.includes(baseSymbol);

                      return (
                        <div
                          key={unit}
                          onClick={() => handleSelectUnit(unit)}
                          style={{
                            padding: '0.35rem 0.5rem',
                            fontSize: '0.74rem',
                            fontWeight: isSelected ? 700 : 500,
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.18)' : 'var(--bg-card)',
                            color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                            border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = isSelected ? 'rgba(2, 132, 199, 0.18)' : 'var(--bg-card)'}
                        >
                          <span>{unit}</span>
                          {isSelected && <Check size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {q && STRENGTH_UNIT_CATEGORIES.every(c => c.units.filter(u => u.toLowerCase().includes(q)).length === 0) && (
              <div style={{ padding: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  No standard unit matching "{searchQuery}"
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectUnit(searchQuery)}
                  style={{
                    border: 'none',
                    backgroundColor: 'var(--primary)',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer'
                  }}
                >
                  Use custom unit: "{searchQuery}"
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
