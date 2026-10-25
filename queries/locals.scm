; What opens a scope, what a name declares in it, and every other name a reference to the nearest
; one that declares it.

[
  (source_file)
  (function_declaration)
  (local_function)
  (lambda_expression)
  (trailing_lambda)
  (block)
  (for_statement)
  (match_arm)
  (catch_clause)
] @local.scope

(function_declaration name: (identifier) @local.definition.function)
(local_function name: (identifier) @local.definition.function)
(parameter name: (identifier) @local.definition.parameter)
(lambda_parameter name: (identifier) @local.definition.parameter)
(lambda_expression parameter: (identifier) @local.definition.parameter)
(trailing_parameter (identifier) @local.definition.parameter)
(type_parameter name: (identifier) @local.definition.type)

(let_statement pattern: (identifier) @local.definition.var)
(global_binding name: (identifier) @local.definition.var)
(static_binding name: (identifier) @local.definition.var)
(for_statement pattern: (identifier) @local.definition.var)
(catch_clause binding: (identifier) @local.definition.var)
(typed_pattern (identifier) @local.definition.var)
(type_set_pattern (identifier) @local.definition.var)
(rest_pattern (identifier) @local.definition.var)
(tuple_pattern (identifier) @local.definition.var)
(array_pattern (identifier) @local.definition.var)
(match_arm pattern: (identifier) @local.definition.var)
(let_condition pattern: (identifier) @local.definition.var)

(identifier) @local.reference
