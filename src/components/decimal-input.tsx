import { useEffect, useState } from 'react';
import { TextInput, StyleProp, TextStyle } from 'react-native';

interface DecimalInputProps {
  value: number | null;
  onCommit: (n: number | null) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
  /** When true an empty field commits null; otherwise it commits 0. */
  allowNull?: boolean;
}

/** '' or unparseable → null, otherwise the parsed number. */
function parseDraft(text: string): number | null {
  if (text === '') return null;
  const n = parseFloat(text);
  return Number.isNaN(n) ? null : n;
}

/** What a given draft commits as — the single rule shared by typing and re-sync. */
function draftCommit(text: string, allowNull: boolean): number | null {
  const n = parseDraft(text);
  return n == null && !allowNull ? 0 : n;
}

/** Keep only digits and the first decimal point. */
function sanitize(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

/**
 * Numeric TextInput that owns a local string draft so in-progress decimals
 * ("19.", "0.0", a lone ".") stay typeable while the parent still receives a
 * parsed number on every keystroke.
 */
export function DecimalInput({
  value, onCommit, placeholder, style, allowNull = false,
}: DecimalInputProps) {
  const [text, setText] = useState(value == null ? '' : String(value));

  // Re-sync prop → draft ONLY when the prop no longer matches what this draft
  // committed (i.e. the parent changed the value out from under us, e.g. a
  // pipeline reload). While the user types, value always catches up to
  // draftCommit(text), so "19." / "0.0" / "" are never clobbered mid-entry.
  useEffect(() => {
    if ((value ?? null) !== draftCommit(text, allowNull)) {
      setText(value == null ? '' : String(value));
    }
  }, [value, text, allowNull]);

  return (
    <TextInput
      style={style}
      value={text}
      placeholder={placeholder}
      keyboardType="decimal-pad"
      onChangeText={(t) => {
        const next = sanitize(t);
        setText(next);
        onCommit(draftCommit(next, allowNull));
      }}
    />
  );
}
