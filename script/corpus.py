"""The corpus the grammar is held to: corpus.py <lyric checkout> <lyric-spec checkout> <out dir>

Every Lyric 5 source the toolchain ships or tests — the standard library, its tests, the
examples, the Book's snippets as the programs they are, and the conformance cases at the spec's
pin — except what is written not to parse: a case or a snippet that must fail with a lexer's or a
parser's code. Each lands in <out dir> under a name that says where it came from; <out dir>/LIST
names them, one per line.
"""
import os
import re
import sys

lyric, spec, out = sys.argv[1], sys.argv[2], sys.argv[3]
REFUSED = re.compile(r"^//! error:.*\bLYR-(?:PAR|LEX)\d{4}", re.M)


def sources(root):
    for top, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in ("bin", "obj", "out"))
        for name in sorted(files):
            if name.endswith(".lyr"):
                yield os.path.join(top, name)


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return f.read()


entries = []
for corpus in ("stdlib5", "tests/std", "examples"):
    for path in sources(os.path.join(lyric, corpus)):
        entries.append((os.path.relpath(path, lyric), read(path)))


# The Book: a fence whose info string is 'lyric', 'lyric,no_run' or 'lyric,compile_fail=CODE',
# made the program it stands for — itself where it declares 'fn main', with an empty main after it
# where it declares, and otherwise its imports above a main that holds the rest.
MAIN = re.compile(r"^fn main\(", re.M)
DECLARATION = re.compile(r"^(?:pub )?(?:fn|struct|enum|class|interface|extend|type|opaque type) |^@", re.M)


def program(code):
    text = code if code.endswith("\n") else code + "\n"
    if MAIN.search(code):
        return text
    if DECLARATION.search(code):
        return text + "\nfn main(): void {}\n"
    imports, body = [], []
    for line in code.replace("\r\n", "\n").rstrip("\n").split("\n"):
        if line.startswith("import "):
            imports.append(line + "\n")
        elif line or body:
            body.append(("    " + line if line else "") + "\n")
    head = "".join(imports) + ("\n" if imports else "")
    return head + "fn main(): void {\n" + "".join(body) + "}\n"


book = os.path.join(lyric, "docs", "book")
for name in sorted(os.listdir(book)):
    if not name.endswith(".md"):
        continue
    lines = read(os.path.join(book, name)).replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        if not lines[i].startswith("```"):
            i += 1
            continue
        info = lines[i][3:].strip()
        close = next(j for j in range(i + 1, len(lines)) if lines[j].startswith("```"))
        kind = info.split(",")[0].split(" ")[0]
        refused = re.match(r"lyric,compile_fail=LYR-(?:PAR|LEX)", info)
        if kind == "lyric" and not refused:
            entries.append((f"book/{name}:{i + 1}", program("\n".join(lines[i + 1:close]))))
        i = close + 1


# The conformance cases: a file, or a directory that is a package. A package whose files say it
# must fail to parse is left out whole.
cases = os.path.join(spec, "conformance", "cases")
for chapter in sorted(os.listdir(cases)):
    root = os.path.join(cases, chapter)
    if not os.path.isdir(root):
        continue
    for top, dirs, files in os.walk(root):
        dirs.sort()
        if "lyric.toml" in files:
            members = list(sources(top))
            if not any(REFUSED.search(read(p)) for p in members):
                entries.extend((os.path.relpath(p, spec), read(p)) for p in members)
            dirs[:] = []
            continue
        for name in sorted(files):
            path = os.path.join(top, name)
            if name.endswith(".lyr") and not REFUSED.search(read(path)):
                entries.append((os.path.relpath(path, spec), read(path)))

os.makedirs(out, exist_ok=True)
listed = []
for where, text in entries:
    flat = re.sub(r"[^A-Za-z0-9._-]+", "_", where.replace(os.sep, "/"))
    if not flat.endswith(".lyr"):
        flat += ".lyr"
    with open(os.path.join(out, flat), "w", encoding="utf-8", newline="") as f:
        f.write(text)
    listed.append(flat)
with open(os.path.join(out, "LIST"), "w", encoding="utf-8") as f:
    f.write("\n".join(listed) + "\n")
print(f"{len(listed)} files")
