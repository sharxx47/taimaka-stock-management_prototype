// Tiny HTML helpers. Every interpolated value is escaped unless wrapped in raw().

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export function raw(s) {
  return s instanceof Raw ? s : new Raw(String(s ?? ''));
}

function piece(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(piece).join('');
  if (v instanceof Raw) return v.s;
  return esc(v);
}

// html`<p>${name}</p>` -> Raw, with name escaped. Arrays are joined; null, undefined and false print nothing.
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += piece(values[i]) + strings[i + 1];
  return new Raw(out);
}

// Attribute helper: attrs({ 'data-act': 'x', disabled: true }) -> ' data-act="x" disabled'
export function attrs(o) {
  let s = '';
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === false) continue;
    s += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
  }
  return raw(s);
}

// Joins a list as "A, B, C and D".
export function joinAnd(list) {
  const parts = list.map((x) => piece(x));
  if (parts.length <= 1) return raw(parts.join(''));
  return raw(`${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);
}
