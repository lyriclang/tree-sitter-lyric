#include "tree_sitter/parser.h"

#include <stdbool.h>

// What the grammar's own lexer cannot say: a comment that nests, a raw string that ends at its
// own number of '#', a string over lines that ends at '"""', and the text of a string — read here
// so a '//' inside one is text, not a comment.
enum TokenType {
    BLOCK_COMMENT,
    RAW_STRING_LITERAL,
    MULTILINE_STRING_LITERAL,
    STRING_CONTENT,
    F_STRING_CONTENT,
    F_STRING_RAW_CONTENT,
    F_STRING_MULTILINE_CONTENT,
    F_STRING_MULTILINE_RAW_CONTENT,
};

void *tree_sitter_lyric_external_scanner_create(void) { return NULL; }
void tree_sitter_lyric_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_lyric_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload;
    (void)buffer;
    return 0;
}
void tree_sitter_lyric_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    (void)payload;
    (void)buffer;
    (void)length;
}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

// '/*' … '*/', each '/*' inside opening one more
static bool block_comment(TSLexer *lexer) {
    advance(lexer); // '*'
    unsigned depth = 1;
    while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '*') {
            advance(lexer);
            if (lexer->lookahead == '/') {
                advance(lexer);
                if (--depth == 0) {
                    lexer->mark_end(lexer);
                    lexer->result_symbol = BLOCK_COMMENT;
                    return true;
                }
            }
        } else if (lexer->lookahead == '/') {
            advance(lexer);
            if (lexer->lookahead == '*') {
                advance(lexer);
                depth++;
            }
        } else {
            advance(lexer);
        }
    }
    return false;
}

// at the first of three '"': on to the next three
static bool to_three_quotes(TSLexer *lexer, bool escapes) {
    unsigned quotes = 0;
    while (!lexer->eof(lexer)) {
        int32_t c = lexer->lookahead;
        advance(lexer);
        if (c == '"') {
            if (++quotes == 3) return true;
        } else {
            quotes = 0;
            if (escapes && c == '\\' && !lexer->eof(lexer)) advance(lexer);
        }
    }
    return false;
}

// after the 'r': 'r"…"', 'r#"…"#' with as many '#', 'r"""…"""'
static bool raw_string(TSLexer *lexer) {
    unsigned hashes = 0;
    while (lexer->lookahead == '#') {
        advance(lexer);
        hashes++;
    }
    if (lexer->lookahead != '"') return false;
    advance(lexer);
    if (hashes == 0 && lexer->lookahead == '"') {
        advance(lexer);
        if (lexer->lookahead != '"') {
            // 'r""': the empty raw string
            lexer->mark_end(lexer);
            lexer->result_symbol = RAW_STRING_LITERAL;
            return true;
        }
        advance(lexer);
        if (!to_three_quotes(lexer, false)) return false;
        lexer->mark_end(lexer);
        lexer->result_symbol = RAW_STRING_LITERAL;
        return true;
    }
    while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '"') {
            advance(lexer);
            unsigned seen = 0;
            while (seen < hashes && lexer->lookahead == '#') {
                advance(lexer);
                seen++;
            }
            if (seen == hashes) {
                lexer->mark_end(lexer);
                lexer->result_symbol = RAW_STRING_LITERAL;
                return true;
            }
        } else if (hashes == 0 && lexer->lookahead == '\n') {
            return false;
        } else {
            advance(lexer);
        }
    }
    return false;
}

// the text of a string up to what ends it or a special: a '"', a '\', a line's end, and in an
// f-string a brace; over lines, a '"' that begins '"""' ends it, one that does not is text
static bool content(TSLexer *lexer, enum TokenType type, bool braces, bool escapes, bool lines) {
    bool any = false;
    for (;;) {
        if (lexer->eof(lexer)) break;
        int32_t c = lexer->lookahead;
        if (c == '\\' && escapes) break;
        if ((c == '{' || c == '}') && braces) break;
        if (c == '\n' && !lines) break;
        if (c == '"') {
            if (!lines) break;
            lexer->mark_end(lexer);
            advance(lexer);
            if (lexer->lookahead == '"') {
                advance(lexer);
                if (lexer->lookahead == '"') break;
            }
            any = true;
            continue;
        }
        advance(lexer);
        any = true;
    }
    if (!any) return false;
    if (lexer->lookahead != '"' || !lines) lexer->mark_end(lexer);
    lexer->result_symbol = type;
    return true;
}

bool tree_sitter_lyric_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;

    // every symbol valid at once is the parser's recovery, which no text of a string is
    bool recovering = valid_symbols[STRING_CONTENT] && valid_symbols[F_STRING_CONTENT];

    // inside a string the text is the token: no whitespace is skipped
    if (recovering) {
    } else if (valid_symbols[STRING_CONTENT])return content(lexer, STRING_CONTENT, false, true, false);
    else if (valid_symbols[F_STRING_CONTENT]) return content(lexer, F_STRING_CONTENT, true, true, false);
    else if (valid_symbols[F_STRING_RAW_CONTENT]) return content(lexer, F_STRING_RAW_CONTENT, true, false, false);
    else if (valid_symbols[F_STRING_MULTILINE_CONTENT]) return content(lexer, F_STRING_MULTILINE_CONTENT, true, true, true);
    else if (valid_symbols[F_STRING_MULTILINE_RAW_CONTENT]) return content(lexer, F_STRING_MULTILINE_RAW_CONTENT, true, false, true);

    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r' || lexer->lookahead == '\n')
        skip(lexer);

    if (lexer->lookahead == '/' && valid_symbols[BLOCK_COMMENT]) {
        advance(lexer);
        if (lexer->lookahead != '*') return false;
        return block_comment(lexer);
    }
    if (lexer->lookahead == 'r' && valid_symbols[RAW_STRING_LITERAL]) {
        advance(lexer);
        return raw_string(lexer);
    }
    if (lexer->lookahead == '"' && valid_symbols[MULTILINE_STRING_LITERAL]) {
        advance(lexer);
        if (lexer->lookahead != '"') return false;
        advance(lexer);
        if (lexer->lookahead != '"') return false;
        advance(lexer);
        if (!to_three_quotes(lexer, true)) return false;
        lexer->mark_end(lexer);
        lexer->result_symbol = MULTILINE_STRING_LITERAL;
        return true;
    }
    return false;
}
