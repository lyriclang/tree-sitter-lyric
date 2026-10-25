# tree-sitter-lyric

The [tree-sitter](https://tree-sitter.github.io/) grammar of [Lyric](https://github.com/lyriclang/lyric)
5, with its queries: `highlights.scm`, `locals.scm`, `injections.scm`.

It is the source of Lyric's highlighting. The TextMate grammar the editor clients carry,
`textmate/lyric.tmLanguage.json`, is made from it by `script/textmate.py`: the words, the
operators and the literal forms come from `src/grammar.json` and `queries/highlights.scm`, so
there is one account of them. What a name is — a type, a field, a function — the language server
says on top of it with semantic tokens.

## The corpus

The grammar is held to every Lyric source the toolchain ships or tests: the standard library,
its tests, the examples, the Book's snippets and the conformance cases at the spec's pin, minus
what is written not to parse. Each parses without an `ERROR` or a `MISSING` node:

```sh
bash script/check-corpus.sh ../lyric ../lyric-spec
```

CI runs it against `lyriclang/lyric`'s `main` on every change here and once a week.

## Working on it

```sh
tree-sitter generate --js-runtime native   # src/ from grammar.js; no Node needed
tree-sitter test                           # test/corpus and test/highlight
python3 script/textmate.py                 # textmate/ from the grammar
```

`src/` is committed, as tree-sitter grammars do: a consumer builds `src/parser.c` and
`src/scanner.c` with any C compiler and needs no CLI. The CLI CI uses is pinned in
`.github/workflows/ci.yml`.

The external scanner (`src/scanner.c`) reads what the grammar's own lexer cannot: a block
comment that nests, a raw string ending at its own number of `#`, a string over lines, and the
text inside strings, so that `//` there stays text.

## License

MIT
