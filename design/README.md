# Final Claude Design files (Taimaka Stock Management Mockup)

Exported from the Claude Design canvas "Taimaka Stock Management Mockup" after the final round (feedback 3), 22 Nov 2026. These are exact copies; do not edit them. Build from them, following ../CLAUDE.md (where the two differ, CLAUDE.md wins).

- `*.dc.html`: one file per artboard (screen). `canvas.json` lists them with their titles.
- `tm.css`: the shared stylesheet, icons included. Copy style values from here exactly.
- `taimaka-logo.svg`: the trimmed Taimaka logo used in the header.

The artboards load these two files through canvas links:
- `/_blob/c9e5ce28784d19e9c6719cd6ca7ea026` is `tm.css`
- `/_blob/995f1343890a94906656cbfec067869b` is `taimaka-logo.svg`

The artboards load the font from Google Fonts; the app must bundle the font files instead (CLAUDE.md, UI rules).

Daily count layout: compact single rows (the right side of the "Daily count: cards vs compact rows" artboard, `CountCompare.dc.html`), chosen over the cards.

The file transfer to this computer added a content-credentials block to taimaka-logo.svg (a <metadata> element holding a <c2pa:manifest>, plus an xmlns:c2pa attribute on the <svg> tag). The drawing is unchanged. Before using the logo, remove that <metadata> element and that attribute; the result must match the canvas logo exactly (sha256 98d2070eed6b68db0e479e4f2784578ab3ca35dc0f9ea95ab2f8a67cfeb0c040).
