"""The TextMate grammar of the clients, made from this one: textmate.py [--check]

Its words, operators and literal forms are read from src/grammar.json and queries/highlights.scm,
so the two cannot tell different stories; what an editor learns beyond them, the language server's
semantic tokens say. Writes textmate/lyric.tmLanguage.json; with --check, says whether the file
written there is the one this would write, and exits 1 where it is not.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "textmate", "lyric.tmLanguage.json")

grammar = json.load(open(os.path.join(ROOT, "src", "grammar.json"), encoding="utf-8"))
rules = grammar["rules"]
highlights = open(os.path.join(ROOT, "queries", "highlights.scm"), encoding="utf-8").read()


def regex(node):
    """A token rule of grammar.json as one regular expression."""
    kind = node["type"]
    if kind == "STRING":
        return re.escape(node["value"])
    if kind == "PATTERN":
        # an alternation stands in a group of its own, or it takes what is around it
        return "(?:" + node["value"] + ")" if "|" in node["value"] else node["value"]
    if kind == "BLANK":
        return ""
    if kind == "SEQ":
        return "".join(regex(m) for m in node["members"])
    if kind == "CHOICE":
        members = [regex(m) for m in node["members"]]
        optional = "" in members
        body = "(?:" + "|".join(m for m in members if m) + ")"
        return body + ("?" if optional else "")
    if kind in ("REPEAT", "REPEAT1"):
        return "(?:" + regex(node["content"]) + ")" + ("*" if kind == "REPEAT" else "+")
    if kind in ("TOKEN", "IMMEDIATE_TOKEN", "PREC", "PREC_LEFT", "PREC_RIGHT", "PREC_DYNAMIC", "FIELD", "ALIAS"):
        return regex(node["content"])
    raise ValueError(f"no regular expression for {kind}")


def captured(capture):
    """The words a bracketed list in highlights.scm gives one capture."""
    m = re.search(r"\[([^\]]*)\]\s*@" + re.escape(capture) + r"\b", highlights)
    return re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1)) if m else []


def words(found):
    return r"\b(?:" + "|".join(re.escape(w) for w in sorted(found, key=lambda w: (-len(w), w))) + r")\b"


contextual = [m["value"] for m in rules["_contextual_name"]["content"]["members"]]

# each capture of a keyword list, as TextMate's scopes name it
SCOPES = [
    ("keyword.function", "storage.type.function.lyric"),
    ("keyword.return", "keyword.control.return.lyric"),
    ("keyword.conditional", "keyword.control.conditional.lyric"),
    ("keyword.repeat", "keyword.control.loop.lyric"),
    ("keyword.import", "keyword.control.import.lyric"),
    ("keyword.exception", "keyword.control.exception.lyric"),
    ("keyword.type", "storage.type.lyric"),
    ("keyword.modifier", "storage.modifier.lyric"),
    ("keyword.operator", "keyword.operator.word.lyric"),
    ("keyword", "keyword.other.lyric"),
]

keyword_patterns = []
for capture, scope in SCOPES:
    found = captured(capture)
    reserved = [w for w in found if w not in contextual and re.fullmatch(r"[a-z]+", w)]
    # a contextual word is a keyword where a name or a block follows it, a name elsewhere
    contextual_here = [w for w in found if w in contextual]
    signed = [w for w in found if not re.fullmatch(r"[a-z]+", w)]
    # 'try?' before 'try', or the word takes the sign's place
    for w in signed:
        keyword_patterns.append({"name": scope, "match": r"\b" + re.escape(w)})
    if reserved:
        keyword_patterns.append({"name": scope, "match": words(reserved)})
    if contextual_here:
        keyword_patterns.append({"name": scope, "match": words(contextual_here) + r"(?=\s+[A-Za-z_\[{<\"(])"})

operators = sorted(captured("operator"), key=lambda o: (-len(o), o))
builtin_types = re.search(r'#any-of\? @type\.builtin((?:\s+"[^"]+")+)', highlights)
builtins = re.findall(r'"([^"]+)"', builtin_types.group(1))

identifier = regex(rules["identifier"])
escape = regex(rules["escape_sequence"])
integer = regex(rules["integer_literal"])
floating = regex(rules["float_literal"])
char = regex(rules["char_literal"])

literal_words = {
    "true": "constant.language.boolean.lyric",
    "false": "constant.language.boolean.lyric",
    "null": "constant.language.null.lyric",
}
for w in literal_words:
    assert any(m.get("value") == w for m in rules["boolean_literal"].get("members", []) + [rules["null_literal"]]), w


def string(begin, end, escapes=True, holes=False, scope="string.quoted.double.lyric"):
    patterns = []
    if escapes:
        patterns.append({"include": "#escape"})
    if holes:
        patterns.append({"name": "constant.character.escape.lyric", "match": r"\{\{|\}\}"})
        patterns.append({"include": "#interpolation"})
    return {"name": scope, "begin": begin, "end": end, "patterns": patterns}


tm = {
    "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
    "name": "Lyric",
    "scopeName": "source.lyric",
    "fileTypes": ["lyr"],
    "comment": "Made by tree-sitter-lyric's script/textmate.py from its grammar; do not edit.",
    "patterns": [
        {"include": "#comments"},
        {"include": "#strings"},
        {"include": "#numbers"},
        {"include": "#attributes"},
        {"include": "#declarations"},
        {"include": "#keywords"},
        {"include": "#constants"},
        {"include": "#types"},
        {"include": "#calls"},
        {"include": "#operators"},
    ],
    "repository": {
        "comments": {"patterns": [
            {"name": "comment.line.documentation.lyric", "match": r"//[/!].*$"},
            {"name": "comment.line.double-slash.lyric", "match": r"//.*$"},
            {"include": "#block-comment"},
        ]},
        "block-comment": {
            "name": "comment.block.lyric",
            "begin": r"/\*",
            "end": r"\*/",
            "patterns": [{"include": "#block-comment"}],
        },
        "escape": {"name": "constant.character.escape.lyric", "match": escape},
        "interpolation": {
            "name": "meta.interpolation.lyric",
            "begin": r"\{",
            "end": r"\}",
            "beginCaptures": {"0": {"name": "punctuation.section.interpolation.begin.lyric"}},
            "endCaptures": {"0": {"name": "punctuation.section.interpolation.end.lyric"}},
            "patterns": [
                {"name": "constant.other.format-spec.lyric", "match": r":[^}\n]*(?=\})"},
                {"include": "$self"},
            ],
        },
        "strings": {"patterns": [
            string(r'fr"""', r'"""', escapes=False, holes=True),
            string(r'f"""', r'"""', holes=True),
            string(r'fr"', r'"', escapes=False, holes=True),
            string(r'f"', r'"', holes=True),
            {"name": "string.quoted.raw.lyric", "begin": r'r(#*)"', "end": r'"\1'},
            string(r'"""', r'"""', scope="string.quoted.triple.lyric"),
            string(r'b"', r'"'),
            string(r'"', r'"'),
            {"name": "string.quoted.single.lyric", "match": char},
        ]},
        "numbers": {"patterns": [
            {"name": "constant.numeric.float.lyric", "match": r"\b" + floating + r"\b"},
            {"name": "constant.numeric.integer.lyric", "match": r"\b" + integer + r"\b"},
        ]},
        "attributes": {"patterns": [
            {"name": "entity.name.tag.attribute.lyric", "match": regex(rules["attribute_name"])},
            {"name": "punctuation.definition.attribute.lyric", "match": r"@\["},
        ]},
        "declarations": {"patterns": [
            {
                "match": r"\b(fn|macro)\s+(" + identifier + ")",
                "captures": {"1": {"name": "storage.type.function.lyric"}, "2": {"name": "entity.name.function.lyric"}},
            },
            {
                "match": r"\b(struct|class|enum|interface|type)\s+(" + identifier + ")",
                "captures": {"1": {"name": "storage.type.lyric"}, "2": {"name": "entity.name.type.lyric"}},
            },
        ]},
        "keywords": {"patterns": keyword_patterns},
        "constants": {"patterns": [
            *({"name": scope, "match": r"\b" + w + r"\b"} for w, scope in literal_words.items()),
            {"name": "variable.language.this.lyric", "match": r"\bthis\b"},
        ]},
        "types": {"patterns": [
            {"name": "support.type.builtin.lyric", "match": words(builtins)},
            {"name": "entity.name.type.lyric", "match": r"\b[A-Z][A-Za-z0-9_]*\b"},
        ]},
        "calls": {"patterns": [
            {
                "match": "(" + identifier + r")(!)(?=[({])",
                "captures": {"1": {"name": "entity.name.function.macro.lyric"}, "2": {"name": "entity.name.function.macro.lyric"}},
            },
            {"match": "(" + identifier + r")(?=\s*(?:<[^<>()]*>)?\()", "captures": {"1": {"name": "entity.name.function.call.lyric"}}},
        ]},
        "operators": {"patterns": [
            {"name": "keyword.operator.lyric", "match": "|".join(re.escape(o) for o in operators)},
        ]},
    },
}


def compiled(node):
    """Every expression of the grammar compiles — Python's engine standing in for Oniguruma."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in ("match", "begin") or key == "end" and "\\1" not in value:
                re.compile(value)
            compiled(value)
    elif isinstance(node, list):
        for value in node:
            compiled(value)


compiled(tm)
text = json.dumps(tm, indent=2, ensure_ascii=False) + "\n"
if "--check" in sys.argv[1:]:
    current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if current != text:
        print("textmate/lyric.tmLanguage.json is not the one the grammar makes: run script/textmate.py")
        sys.exit(1)
    print("textmate/lyric.tmLanguage.json is the grammar's")
    sys.exit(0)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)
print("wrote", os.path.relpath(OUT, ROOT))
