import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Palette, Check, Sun, Moon } from 'lucide-react';

export const ACCENT_COLORS = [
  { id: 'blue', label: 'Royal Blue', hex: '#2563eb', desc: 'Default Enterprise Blue' },
  { id: 'green', label: 'Emerald', hex: '#059669', desc: 'Enterprise Emerald' },
  { id: 'purple', label: 'Indigo Violet', hex: '#7c3aed', desc: 'Executive Violet' },
  { id: 'orange', label: 'Amber Orange', hex: '#ea580c', desc: 'Warm Enterprise Orange' },
  { id: 'red', label: 'Crimson', hex: '#e11d48', desc: 'Executive Crimson' },
];

export const ColorThemePicker = () => {
  const { accentColor = 'blue', setAccentColor, theme = 'light', setTheme } = useApp();
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
        title={`App Theme (${theme === 'light' ? 'Light' : 'Dark'} · ${currentColor.label})`}
        aria-label="Pick App Theme Color"
      >
        <span className="sd-color-swatch-dot" style={{ backgroundColor: currentColor.hex }} />
        <Palette size={16} />
      </button>

      {isOpen && (
        <div className="sd-color-picker-popover" role="dialog" aria-label="Color Palette">
          <div className="sd-color-picker-header">
            <span className="sd-color-picker-title">Appearance &amp; Theme</span>
            <span className="sd-color-picker-sub">Mode &amp; accent color</span>
          </div>

          <div className="sd-theme-mode-segmented">
            <button
              type="button"
              className={`sd-theme-mode-seg-btn ${theme === 'light' ? 'is-active' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={13} />
              <span>Light</span>
            </button>
            <button
              type="button"
              className={`sd-theme-mode-seg-btn ${theme === 'dark' ? 'is-active' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={13} />
              <span>Dark</span>
            </button>
          </div>

          <div className="sd-color-options-list">
            {ACCENT_COLORS.map((color) => {
              const isSelected = accentColor === color.id;
              return (
                <button
                  key={color.id}
                  id={`btn-color-option-${color.id}`}
                  type="button"
                  className={`sd-color-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setAccentColor(color.id);
                    setIsOpen(false);
                  }}
                >
                  <span
                    className="sd-color-option-swatch"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="sd-color-option-info">
                    <span className="sd-color-option-name">
                      {color.label}
                      {color.id === 'blue' && <span className="sd-color-default-tag">Default</span>}
                    </span>
                    <span className="sd-color-option-desc">{color.desc}</span>
                  </div>
                  {isSelected && <Check size={14} className="sd-color-option-check" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
