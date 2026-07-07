#!/usr/bin/env bash
#
# sync-pandoc-assets.sh — one-way sync of the Pandoc export toolchain from the
# canonical source (a working vault's `脚本/Pandoc/`) into this repo's
# `pandoc-assets/` staging folder.
#
# The vault copy is the single source of truth; this repo's pandoc-assets/ is a
# staging area consumed by the test vault and packaged into the published assets
# zip (pandocAssetsUrl). Run this whenever the canonical source changes so we
# never hand-diff or drift again.
#
# It copies filters/ defaults/ templates/ csl/, then:
#   - normalizes machine-specific paths in defaults/*.yaml (crossrefYaml, bibliography),
#   - excludes docs (*.md), .DS_Store, and personal cover-letter identity assets
#     (signature / logo), leaving placeholders so the cover_letter preset still builds.
#
# Usage:
#   ./scripts/sync-pandoc-assets.sh            # sync from the default source
#   PANDOC_SRC=/path/to/Pandoc ./scripts/sync-pandoc-assets.sh
#   ./scripts/sync-pandoc-assets.sh --dry-run  # show what rsync would do, change nothing

set -euo pipefail

# ── paths ────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/pandoc-assets"
SRC="${PANDOC_SRC:-/Users/songshgeo/Documents/Obsidian/SongshGeo/40 - Obsidian/脚本/Pandoc}"

DRY=""
[[ "${1:-}" == "--dry-run" ]] && DRY="--dry-run"

# Personal identity assets we must NOT publish. Kept as placeholders instead.
PERSONAL=(
  "cover_letter/Song_signature.png"
  "cover_letter/MPI-GEA_logo.pdf"
)

# ── checks ───────────────────────────────────────────────────────────────────
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
[[ -d "$SRC" ]]  || die "canonical source not found: $SRC  (set PANDOC_SRC)"
[[ -d "$DEST" ]] || mkdir -p "$DEST"
command -v rsync >/dev/null || die "rsync not found"

printf '── syncing Pandoc assets ──\n  from: %s\n  to  : %s\n%s\n' \
  "$SRC" "$DEST" "${DRY:+  (dry-run — no changes)}"

# ── 1. copy the four asset dirs ──────────────────────────────────────────────
COMMON_EXCLUDES=(--exclude='.DS_Store' --exclude='*.md')
for d in filters defaults templates csl; do
  [[ -d "$SRC/$d" ]] || { printf '  skip %-10s (absent in source)\n' "$d"; continue; }
  excludes=("${COMMON_EXCLUDES[@]}")
  if [[ "$d" == templates ]]; then
    for p in "${PERSONAL[@]}"; do excludes+=(--exclude="$p"); done
  fi
  printf '  rsync %s/\n' "$d"
  rsync -a --delete --itemize-changes $DRY "${excludes[@]}" "$SRC/$d/" "$DEST/$d/" \
    | sed 's/^/    /' || true
done

[[ -n "$DRY" ]] && { printf '── dry-run done ──\n'; exit 0; }

# ── 2. normalize machine-specific paths in defaults/*.yaml (idempotent) ───────
printf '── normalizing defaults/*.yaml ──\n'
for f in "$DEST"/defaults/*.yaml; do
  [[ -e "$f" ]] || continue
  # crossrefYaml → ${USERDATA} form (per-line)
  perl -pi -e 's{crossrefYaml:\s*\.config/pandoc/defaults/crossref\.yaml}{crossrefYaml: \$\{USERDATA\}/defaults/crossref.yaml}' "$f"
  # comment out any active `bibliography:` line (plugin injects --bibliography).
  # Per-line; skips already-commented lines → idempotent across re-syncs.
  perl -pi -e 's{^(\s*)(bibliography:\s.*)$}{$1# $2  # (commented by sync: plugin injects --bibliography)} unless /^\s*#/' "$f"
done
# report any ACTIVE (non-commented) machine paths still referenced (should be none)
residual="$(grep -rnE '\.config/pandoc|/Users/|/Library/' "$DEST/defaults" 2>/dev/null \
  | grep -vE ':[[:space:]]*#|# \(commented' || true)"
if [[ -n "$residual" ]]; then
  printf '  ⚠ active machine paths remain (review):\n%s\n' "$residual" | sed 's/^/    /'
else
  printf '  ok — no active machine-specific paths left in defaults\n'
fi

# ── 3. placeholders for excluded personal cover-letter assets ────────────────
printf '── cover-letter placeholders ──\n'
CL="$DEST/templates/cover_letter"
mkdir -p "$CL"
for p in "${PERSONAL[@]}"; do
  target="$DEST/templates/$p"
  if [[ ! -e "$target" ]]; then
    case "$target" in
      *.png) magick -size 320x120 xc:none "$target" 2>/dev/null || : > "$target" ;;
      *.pdf) magick -size 320x120 xc:white "$target" 2>/dev/null || : > "$target" ;;
    esac
    printf '  placeholder: templates/%s\n' "$p"
  else
    printf '  kept existing: templates/%s\n' "$p"
  fi
done
cat > "$CL/README.md" <<'EOF'
# cover_letter/ — personal letterhead assets

`cover_letter.yaml` references `LogoPath`/`SignaturePath` (default `MPI-GEA_logo.pdf`
and `Song_signature.png`). This bundle ships **placeholders** so the preset compiles;
replace them with your own logo (PDF) and signature (PNG), keeping the same filenames,
or change the names in `defaults/cover_letter.yaml`.
EOF

printf '── sync complete ──\n'
