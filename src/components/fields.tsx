import { useEffect, useState, type KeyboardEvent } from 'react';

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  min?: number;
  step?: number;
  optional?: boolean;
  disabled?: boolean;
  /**
   * Apply every valid value as it is typed (the caller coalesces these into one undo step).
   * Otherwise the value is applied on blur or Enter.
   */
  live?: boolean;
  testId?: string;
}

const show = (v: number | undefined) => (v === undefined ? '' : String(v));

export function NumberField({ label, value, onCommit, min, step = 1, optional, disabled, live, testId }: NumberFieldProps) {
  const [text, setText] = useState(show(value));
  // Sync from outside changes (undo, drag, clamping), but don't rewrite text that already
  // means this value, e.g. "12." while typing "12.5".
  useEffect(() => setText((t) => (parse(t)?.v === value ? t : show(value))), [value]);

  /** The value `t` represents, or null if it isn't a valid entry. */
  function parse(t: string): { v: number | undefined } | null {
    const trimmed = t.trim();
    if (trimmed === '') return optional ? { v: undefined } : null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || (min !== undefined && n < min)) return null;
    return { v: n };
  }

  function apply(t: string) {
    const parsed = parse(t);
    if (parsed && parsed.v !== value) onCommit(parsed.v);
    return parsed;
  }

  function onChange(t: string) {
    setText(t);
    if (live) apply(t);
  }

  function onBlur() {
    // Live fields are already applied; just tidy the text (e.g. after an invalid entry).
    if (live || !apply(text)) setText(show(value));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      setText(show(value));
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={text}
        min={min}
        step={step}
        disabled={disabled}
        placeholder={optional ? '—' : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        data-testid={testId}
      />
    </label>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  live?: boolean;
  testId?: string;
}

export function TextField({ label, value, onCommit, live, testId }: TextFieldProps) {
  const [text, setText] = useState(value);
  // Keep trailing spaces while typing ("Big " → "Big desk").
  useEffect(() => setText((t) => (t.trim() === value ? t : value)), [value]);

  function apply(t: string): boolean {
    const trimmed = t.trim();
    if (!trimmed) return false;
    if (trimmed !== value) onCommit(trimmed);
    return true;
  }

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (live) apply(e.target.value);
        }}
        onBlur={() => {
          if (live || !apply(text)) setText(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        data-testid={testId}
      />
    </label>
  );
}
