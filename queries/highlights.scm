; The general first, the particular after it: where two patterns take one node, the later one
; stands.

(identifier) @variable

((identifier) @constant
  (#match? @constant "^[A-Z][A-Z0-9_]+$"))

(this) @variable.builtin
(wildcard_pattern) @variable.builtin

; ---- words ----

["fn" "macro"] @keyword.function
["return" "yield"] @keyword.return
["if" "else" "match"] @keyword.conditional
["for" "while" "do" "loop" "break" "continue" "in"] @keyword.repeat
["import" "module"] @keyword.import
["try" "try?" "try!" "catch" "throw" "throws" "defer"] @keyword.exception
["struct" "class" "enum" "interface" "extend" "type"] @keyword.type
["pub" "internal" "private" "static" "mut" "var" "inline" "sealed" "opaque" "extern" "params"] @keyword.modifier
["as" "is" "with" "by"] @keyword.operator
["let" "using" "comptime" "quote"] @keyword

; ---- operators and punctuation ----

[
  "=" "+=" "-=" "*=" "/=" "%=" "+%=" "-%=" "*%=" "&=" "|=" "^=" "<<=" ">>=" "&&=" "||=" "??="
  "+" "-" "*" "/" "%" "+%" "-%" "*%" "++" "--" "&" "|" "^" "~" "<<" ">>"
  "==" "!=" "!in" "<" "<=" ">" ">=" "&&" "||" "!" "??" "?" "?." ".." "..=" "..." "->" "=>" "::"
] @operator

["(" ")" "[" "]" "{" "}" "@["] @punctuation.bracket
["," ";" ":" "." ".["] @punctuation.delimiter

; ---- literals ----

(integer_literal) @number
(float_literal) @number.float
(boolean_literal) @boolean
(null_literal) @constant.builtin
(char_literal) @character
(string_literal) @string
(raw_string_literal) @string
(multiline_string_literal) @string
(byte_string_literal) @string
(f_string) @string
(escape_sequence) @string.escape
(brace_escape) @string.escape
(format_spec) @string.special
(interpolation "{" @punctuation.special "}" @punctuation.special)
(splice "#" @punctuation.special "{" @punctuation.special "}" @punctuation.special)

; ---- uses ----

(member_expression member: (identifier) @property)
(field_initializer name: (identifier) @property)
(shorthand_field (identifier) @property)
(field_pattern name: (identifier) @property)
(attribute_field name: (identifier) @property)
(argument name: (identifier) @variable.parameter)

(struct_initializer type: (dotted_name (identifier) @type .))
(implicit_member (identifier) @constant)
(variant_pattern (identifier) @constant .)

(call_expression function: (identifier) @function.call)
(call_expression function: (generic_name (dotted_name (identifier) @function.call .)))
(call_expression function: (member_expression member: (identifier) @function.method.call))
(call_expression function: (generic_member member: (identifier) @function.method.call))
(trailing_call function: (identifier) @function.call)
(trailing_call function: (member_expression member: (identifier) @function.method.call))
(trailing_call function: (call_expression function: (identifier) @function.call))
(trailing_call function: (call_expression function: (member_expression member: (identifier) @function.method.call)))

(macro_invocation macro: (identifier) @function.macro "!" @function.macro)

(attribute_item) @attribute
(attribute_name) @attribute
(attribute (dotted_name (identifier) @attribute))
(attribute_expression (attribute_name) @function.builtin)

; ---- types ----

(named_type name: (dotted_name (identifier) @module))
(named_type name: (dotted_name (identifier) @type .))
(named_type
  name: (dotted_name (identifier) @type.builtin .)
  (#any-of? @type.builtin
    "int" "uint" "float" "int8" "int16" "int32" "int64" "uint8" "uint16" "uint32" "uint64"
    "float32" "float64" "bool" "char" "string" "void" "never" "Self"))
(named_type_argument name: (identifier) @type)
(generic_name (dotted_name (identifier) @type .))
(call_expression function: (generic_name (dotted_name (identifier) @function.call .)))

; ---- declarations ----

(module_header (dotted_name (identifier) @module))
(import_declaration path: (dotted_name (identifier) @module))

(parameter name: (identifier) @variable.parameter)
(lambda_parameter name: (identifier) @variable.parameter)
(lambda_expression parameter: (identifier) @variable.parameter)
(trailing_parameter (identifier) @variable.parameter)

(loop_expression label: (identifier) @label)
(labeled_statement label: (identifier) @label)
(break_statement label: (identifier) @label)
(continue_statement (identifier) @label)

(enum_variant name: (identifier) @constant)
(field_declaration name: (identifier) @property)

(struct_declaration name: (identifier) @type)
(class_declaration name: (identifier) @type)
(enum_declaration name: (identifier) @type)
(interface_declaration name: (identifier) @type)
(type_alias name: (identifier) @type.definition)
(associated_type name: (identifier) @type)
(type_parameter name: (identifier) @type)

(function_declaration name: (identifier) @function)
(local_function name: (identifier) @function)
(function_declaration "macro" name: (identifier) @function.macro)

; ---- comments ----

(line_comment) @comment
(block_comment) @comment
((line_comment) @comment.documentation
  (#match? @comment.documentation "^//[/!]"))
