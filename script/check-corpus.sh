#!/usr/bin/env bash
# check-corpus.sh <lyric checkout> <lyric-spec checkout> [tree-sitter]: every file of the corpus
# (script/corpus.py) parses without an ERROR or a MISSING node; the ones that do not are named,
# each with its first such node, and the exit is 1.
set -euo pipefail
lyric=$1 spec=$2 ts=${3:-tree-sitter}
here=$(cd "$(dirname "$0")/.." && pwd)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

python3 -I "$here/script/corpus.py" "$lyric" "$spec" "$out/corpus"
sed "s|^|$out/corpus/|" "$out/corpus/LIST" > "$out/paths"
cd "$here"
"$ts" parse --paths "$out/paths" --quiet --stat > "$out/parse.txt" 2>&1 || true
grep -E "^Total parses" "$out/parse.txt"
if grep -qE "\((ERROR|MISSING)" "$out/parse.txt"; then
  grep -E "\((ERROR|MISSING)" "$out/parse.txt" | sed "s|$out/corpus/||" | sort
  exit 1
fi
