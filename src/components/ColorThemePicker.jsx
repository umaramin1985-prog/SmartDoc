import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Palette, Check } from 'lucide-react';

export const ACCENT_COLORS = [
  { id: 'green', label: 'Current Green', hex: '#a4fb4f', desc: 'Default Electric Green' },
  { id: 'red', label: 'Red', hex: '#ef4444', desc: 'Crimson Red' },
  { id: 'orange', label: 'Orange', hex: '#f97316', desc: 'Vibrant Orange' },
  { id: 'purple', label: 'Purple', hex: '#a855f7', desc: 'Royal Purple' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6', desc: 'Electric Blue' },
];

export const ColorThemePicker = () => {
  const { accentColor = 'green', setAccentColor } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentColor = ACCENT_COLORS.find(c => c.id === accentColor) || ACCENT_COLORS[0];

  return (
    <div className="sd-color-picker-wrap" ref={containerRef}>
      <button
        id="btn-color-theme-picker"
        type="button"
        className={`sd-icon-btn sd-color-picker-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`App Color: ${currentColor.label} · Click to customize`}
        aria-label="Pick App Theme Color"
      >
        <span className="sd-color-swatch-dot" style={{ backgroundColor: currentColor.hex }} />
        <Palette size={16} />
      </button>

      {isOpen && (
        <div className="sd-color-picker-popover" role="dialog" aria-label="Color Palette">
          <div className="sd-color-picker-header">
            <span className="sd-color-picker-title">App Theme Color</span>
            <span className="sd-color-picker-sub">Pick your preferred accent</span>
          </div>

          <div className="sd-color-options-list">
            {ACCENT_COLORS.map((color) => {
              const isSelected = accentColor === color.id;
              return (
                <button
                  key={color.id}
                  id={`btn-color-choice-${color.id}`}
                  type="button"
                  className={`sd-color-option-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setAccentColor(color.id);
                    setIsOpen(false);
                  }}
                >
                  <span
                    className="sd-color-swatch-circle"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="sd-color-option-text">
                    <span className="sd-color-option-name">
                      {color.label}
                      {color.id === 'green' && <span className="sd-color-default-badge">Default</span>}
                    </span>
                    <span className="sd-color-option-desc">{color.desc}</span>
                  </div>
                  {isSelected && <Check size={15} className="sd-color-check-icon" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
