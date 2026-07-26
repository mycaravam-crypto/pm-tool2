#!/usr/bin/env bash
# Regenerates client/src/lib/fonts/interFonts.js — base64 static-instance Inter
# TTFs (Latin + common punctuation/symbols subset) embedded into the PDF
# exports (server/../client/src/lib/pdfReports.js) via jsPDF's addFont, since
# jsPDF ships only the 14 standard PDF fonts and has no Inter of its own.
#
# Only needs re-running if the subset's Unicode range or the set of weights
# changes — the output is committed, so this isn't part of the normal build.
# Requires: curl, unzip, python3 with `pip install fonttools` (for pyftsubset).
set -euo pipefail

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/client/src/lib/fonts"

echo "Downloading Inter release..."
curl -sL "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip" -o "$WORKDIR/inter.zip"
unzip -q -j "$WORKDIR/inter.zip" \
  "extras/ttf/Inter-Regular.ttf" "extras/ttf/Inter-SemiBold.ttf" "extras/ttf/Inter-Bold.ttf" \
  -d "$WORKDIR"
unzip -q -j "$WORKDIR/inter.zip" "LICENSE.txt" -d "$WORKDIR" 2>/dev/null || \
  curl -sL "https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt" -o "$WORKDIR/LICENSE.txt"

echo "Subsetting to Latin + common punctuation/symbols..."
for w in Regular SemiBold Bold; do
  pyftsubset "$WORKDIR/Inter-$w.ttf" \
    --output-file="$WORKDIR/Inter-$w-subset.ttf" \
    --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+2000-206F,U+2074,U+20AC,U+2122,U+2212,U+FB01-FB02" \
    --layout-features='*' \
    --glyph-names \
    --no-hinting
done

echo "Encoding to $OUT_DIR/interFonts.js..."
python3 - "$WORKDIR" "$OUT_DIR" <<'PY'
import base64, sys
workdir, out_dir = sys.argv[1], sys.argv[2]
weights = {"Regular": "REGULAR", "SemiBold": "SEMIBOLD", "Bold": "BOLD"}
lines = [
    "// Subset (Latin + common punctuation/symbols) static-instance Inter TTFs from https://github.com/rsms/inter,",
    "// base64-encoded for jsPDF.addFileToVFS/addFont. Regenerate via scripts/build-pdf-fonts.sh if the subset range needs to change.",
]
for file, name in weights.items():
    with open(f"{workdir}/Inter-{file}-subset.ttf", "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    lines.append(f"export const INTER_{name} = '{b64}';")
with open(f"{out_dir}/interFonts.js", "w") as f:
    f.write("\n".join(lines) + "\n")
PY

cp "$WORKDIR/LICENSE.txt" "$OUT_DIR/LICENSE-Inter.txt"
echo "Done."
