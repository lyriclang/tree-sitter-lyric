/**
 * @file The grammar of Lyric 5
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Binding powers as the compiler's parser has them, higher binds tighter.
const PREC = {
  lambda: -1,
  try: 0,
  assign: 1,
  coalesce: 3,
  or: 5,
  and: 7,
  equality: 9,
  comparison: 11,
  bitor: 13,
  xor: 15,
  bitand: 17,
  range: 19,
  shift: 21,
  additive: 23,
  multiplicative: 25,
  cast: 27,
  unary: 29,
  postfix: 31,
  call: 32,
  member: 33,
};

const ASSIGNMENTS = ['=', '+=', '-=', '*=', '/=', '%=', '+%=', '-%=', '*%=', '&=', '|=', '^=',
  '<<=', '>>=', '&&=', '||=', '??='];

// The words that are names everywhere but at their place.
const CONTEXTUAL = ['type', 'opaque', 'throws', 'extern', 'sealed', 'by', 'with', 'loop', 'using',
  'module', 'params'];

const INTEGER_SUFFIX = /(i8|i16|i32|i64|u8|u16|u32|u64)?/;

/** @param {RuleOrLiteral} rule */
const commaSep = rule => optional(commaSep1(rule));

/** @param {RuleOrLiteral} rule */
const commaSep1 = rule => seq(rule, repeat(seq(',', rule)), optional(','));

module.exports = grammar({
  name: 'lyric',

  word: $ => $.identifier,

  extras: $ => [/\s/, $.line_comment, $.block_comment],

  externals: $ => [
    $.block_comment,
    $.raw_string_literal,
    $.multiline_string_literal,
    $.string_content,
    $.f_string_content,
    $.f_string_raw_content,
    $.f_string_multiline_content,
    $.f_string_multiline_raw_content,
  ],

  supertypes: $ => [$._expression, $._type, $._pattern, $._statement, $._declaration],

  inline: $ => [$._name],

  // Where the toolchain's parser looks ahead — '<' a comparison or type arguments, '(' a group,
  // a tuple or a lambda's parameters, '{' a block, an initializer or a trailing lambda, a name a
  // binding or a pattern — this one splits and keeps what parses: each entry is a split the
  // generator asked for. 'tree-sitter generate' names any that has become unnecessary.
  conflicts: $ => [
    [$.tuple_expression, $.macro_arguments],
    [$.parenthesized_expression, $.macro_arguments],
    [$.dotted_name, $.implicit_member],
    [$._contextual_name, $.type_alias],
    [$.break_statement, $._expression, $.macro_invocation],
    [$.dotted_name, $.break_statement, $._expression],
    [$.break_statement, $._expression],
    [$._contextual_name, $.loop_expression],
    [$.loop_expression],
    [$._type, $.field_type],
    [$.generic_member, $.member_expression],
    [$.catch_clause, $._expression],
    [$._binding_rest, $.typed_pattern],
    [$._attribute_arguments, $.macro_arguments],
    [$.struct_initializer_body, $._variant_payload],
    [$.shorthand_field, $.field_pattern],
    [$._expression, $.if_expression],
    [$._expression, $.rest_pattern],
    [$.lambda_parameter, $.typed_pattern],
    [$.lambda_parameters, $.tuple_pattern],
    [$._binding_rest, $._pattern_head, $.typed_pattern],
    [$._binding_rest, $._pattern_head],
    [$.literal_pattern, $._literal],
    [$.array_expression, $.array_pattern],
    [$.implicit_member, $.variant_pattern],
    [$.attribute_item, $.attribute_expression],
    [$._expression, $.literal_pattern],
    [$.lambda_parameters, $._pattern_head],
    [$._expression, $.type_set_pattern],
    [$._expression, $.variant_pattern],
    [$._expression, $.lambda_parameter, $._pattern_head],
    [$.dotted_name, $._expression, $.variant_pattern],
    [$.defer_statement, $._expression],
    [$._pattern_head, $.typed_pattern],
    [$.generic_name, $.struct_initializer],
    [$.dotted_name, $._expression_ending_with_block, $._expression],
    [$._expression_ending_with_block, $._expression],
    [$.dotted_name, $._expression],
    [$._expression, $.lambda_parameter],
    [$._expression, $.struct_initializer],
    [$._expression, $._pattern_head],
    [$.macro_invocation, $._expression],
    [$.range_expression],
  ],

  rules: {
    source_file: $ => repeat(choice($.attribute_item, $.module_header, $._declaration)),

    module_header: $ => seq('module', optional($.dotted_name), ';'),

    // ---- names ----

    identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

    _name: $ => choice($.identifier, $._contextual_name, $.splice),

    _contextual_name: $ => alias(choice(...CONTEXTUAL), $.identifier),

    dotted_name: $ => prec.right(seq($._name, repeat(seq('.', $._name)))),

    // ---- attributes ----

    attribute_item: $ => choice(
      seq($.attribute_name, optional($._attribute_arguments)),
      seq('@[', commaSep1($.attribute), ']'),
    ),

    attribute_name: _ => token(seq('@', /[A-Za-z_][A-Za-z0-9_]*/, repeat(seq('.', /[A-Za-z_][A-Za-z0-9_]*/)))),

    attribute: $ => seq($.dotted_name, optional($._attribute_arguments)),

    _attribute_arguments: $ => choice(
      seq('{', commaSep($.attribute_field), '}'),
      seq('(', $._expression, ')'),
    ),

    attribute_field: $ => seq(field('name', $._name), '=', field('value', $._expression)),

    // ---- declarations ----

    _declaration: $ => choice(
      $.import_declaration,
      $.function_declaration,
      $.extern_block,
      $.struct_declaration,
      $.class_declaration,
      $.enum_declaration,
      $.interface_declaration,
      $.extend_declaration,
      $.global_binding,
      $.type_alias,
    ),

    // extern "C" { fn …; fn …; }: the functions of one ABI, each with its own attributes
    extern_block: $ => seq(
      optional($.visibility),
      $.extern_spec,
      '{',
      repeat(choice($.attribute_item, $.function_declaration)),
      '}',
    ),

    visibility: _ => choice('pub', 'internal', 'private'),

    import_declaration: $ => seq(
      optional($.visibility),
      'import',
      field('path', $.dotted_name),
      optional(choice(
        seq('{', commaSep1($.import_item), '}'),
        seq('as', field('alias', $._name)),
      )),
      ';',
    ),

    import_item: $ => seq(field('name', $._name), optional(seq('as', field('alias', $._name)))),

    function_declaration: $ => seq(
      optional($.visibility),
      optional($.extern_spec),
      optional('static'),
      optional('inline'),
      optional('mut'),
      choice('fn', 'macro'),
      field('name', $._name),
      optional(field('type_parameters', $.type_parameters)),
      field('parameters', $.parameters),
      optional(seq(':', field('return_type', $._unthrowing_type))),
      optional($.throws_clause),
      choice(
        field('body', $.block),
        seq('=', field('symbol', $._string), ';'),
        ';',
      ),
    ),

    extern_spec: $ => seq('extern', field('abi', $.string_literal)),

    throws_clause: $ => prec.right(seq('throws', optional(choice($._type, $.type_list)))),

    type_list: $ => seq('[', commaSep($._type), ']'),

    parameters: $ => seq('(', commaSep($.parameter), ')'),

    parameter: $ => seq(
      repeat($.attribute_item),
      optional('params'),
      optional('&'),
      field('name', $._name),
      ':',
      field('type', $._type),
      optional('...'),
      optional(seq('=', field('default', $._expression))),
    ),

    type_parameters: $ => seq('<', commaSep1($.type_parameter), '>'),

    type_parameter: $ => seq(
      field('name', $._name),
      optional(seq('::', field('constraints', $.type_list))),
      optional(seq('=', field('default', $._type))),
    ),

    conformances: $ => seq('::', '[', commaSep1($.conformance), ']'),

    conformance: $ => seq($._type, optional(seq('by', field('field', $._name)))),

    struct_declaration: $ => seq(
      optional($.visibility),
      'struct',
      field('name', $._name),
      optional(field('type_parameters', $.type_parameters)),
      optional($.conformances),
      field('body', $.type_body),
    ),

    class_declaration: $ => seq(
      optional($.visibility),
      'class',
      field('name', $._name),
      optional(field('type_parameters', $.type_parameters)),
      optional($.conformances),
      field('body', $.type_body),
    ),

    // a field needs its ',' but the last; what ends in '}' or ';' needs none
    type_body: $ => seq(
      '{',
      repeat(choice(
        $.attribute_item,
        seq($.field_declaration, choice(',', ';')),
        seq(choice($.function_declaration, $.static_binding, $.associated_type), optional(',')),
      )),
      optional($.field_declaration),
      '}',
    ),

    field_declaration: $ => seq(
      optional($.visibility),
      optional('var'),
      field('name', $._name),
      ':',
      field('type', $._type),
      optional(seq('=', field('default', $._expression))),
    ),

    static_binding: $ => seq(
      optional($.visibility),
      'static',
      $._binding_rest,
    ),

    associated_type: $ => seq(
      'type',
      field('name', $._name),
      optional(seq('::', $.type_list)),
      optional(seq('=', field('type', $._type))),
      ';',
    ),

    enum_declaration: $ => seq(
      optional($.visibility),
      'enum',
      field('name', $._name),
      optional(field('type_parameters', $.type_parameters)),
      optional($.conformances),
      field('body', $.enum_body),
    ),

    enum_body: $ => seq(
      '{',
      optional(seq(
        $.enum_variant,
        repeat(seq(',', $.enum_variant)),
        optional(','),
      )),
      optional(seq(';', repeat($._interface_member))),
      '}',
    ),

    enum_variant: $ => seq(
      repeat($.attribute_item),
      field('name', $._name),
      optional(choice(
        seq('(', commaSep($._type), ')'),
        seq('{', commaSep(seq(repeat($.attribute_item), $.field_declaration)), '}'),
      )),
    ),

    interface_declaration: $ => seq(
      optional($.visibility),
      optional('sealed'),
      'interface',
      field('name', $._name),
      optional(field('type_parameters', $.type_parameters)),
      optional($.conformances),
      field('body', $.interface_body),
    ),

    interface_body: $ => seq('{', repeat($._interface_member), '}'),

    _interface_member: $ => choice($.attribute_item, $.function_declaration, $.static_binding, $.associated_type),

    extend_declaration: $ => seq(
      optional($.visibility),
      'extend',
      optional(field('type_parameters', $.type_parameters)),
      field('type', $._type),
      optional($.conformances),
      field('body', $.interface_body),
    ),

    global_binding: $ => seq(
      optional($.visibility),
      $._binding_rest,
    ),

    _binding_rest: $ => seq(
      choice('let', 'var'),
      field('name', $._name),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', $._expression))),
      ';',
    ),

    type_alias: $ => seq(
      optional($.visibility),
      optional('opaque'),
      'type',
      field('name', $._name),
      optional(field('type_parameters', $.type_parameters)),
      '=',
      field('type', $._type),
      ';',
    ),

    // ---- types ----

    _type: $ => choice($._unthrowing_type, $.throwing_type),

    _unthrowing_type: $ => choice(
      $.named_type,
      $.optional_type,
      $.array_type,
      $.function_type,
      $.tuple_type,
      $.parenthesized_type,
      $.field_type,
    ),

    named_type: $ => prec.right(seq(
      field('name', $.dotted_name),
      optional(field('arguments', $.type_arguments)),
    )),

    type_arguments: $ => seq(
      '<',
      commaSep1(choice($._type, $.named_type_argument)),
      '>',
    ),

    named_type_argument: $ => seq(field('name', $._name), '=', field('type', $._type)),

    optional_type: $ => prec(2, seq(choice('?', '??'), $._unthrowing_type)),

    array_type: $ => prec(40, seq($._unthrowing_type, '[', optional($.integer_literal), ']')),

    function_type: $ => prec.right(seq(
      'fn',
      '(',
      commaSep(seq(optional('&'), $._type)),
      ')',
      '->',
      field('return_type', $._unthrowing_type),
      optional($.throws_clause),
    )),

    tuple_type: $ => seq(
      '(',
      $._tuple_type_element,
      repeat1(seq(',', $._tuple_type_element)),
      optional(','),
      ')',
    ),

    _tuple_type_element: $ => choice($._type, seq(field('label', $._name), ':', $._type)),

    parenthesized_type: $ => seq('(', $._type, ')'),

    throwing_type: $ => prec.right(1, seq($._unthrowing_type, 'throws', optional($._unthrowing_type))),

    field_type: $ => seq($._unthrowing_type, '.[', $._name, ']'),

    // ---- statements ----

    block: $ => seq('{', repeat($._statement), optional(field('value', $._expression)), '}'),

    _statement: $ => choice(
      $.expression_statement,
      $.let_statement,
      $.using_statement,
      $.local_function,
      $.while_statement,
      $.do_statement,
      $.for_statement,
      $.labeled_statement,
      $.break_statement,
      $.continue_statement,
      $.return_statement,
      $.yield_statement,
      $.defer_statement,
      $.comptime_statement,
      $.empty_statement,
    ),

    empty_statement: _ => ';',

    expression_statement: $ => choice(
      seq($._expression, ';'),
      prec(1, $._expression_ending_with_block),
    ),

    _expression_ending_with_block: $ => choice(
      $.block,
      $.if_expression,
      $.match_expression,
      $.loop_expression,
      $.trailing_call,
      $.macro_invocation,
      $.splice,
      $.comptime_expression,
      $.try_expression,
    ),

    let_statement: $ => seq(
      choice('let', 'var'),
      field('pattern', $._pattern),
      optional(seq(':', field('type', $._type))),
      optional(seq('=', field('value', $._expression))),
      optional(seq('else', field('else', $.block))),
      ';',
    ),

    using_statement: $ => seq('using', $.let_statement),

    local_function: $ => prec(1, seq(
      'fn',
      field('name', $._name),
      field('parameters', $.parameters),
      optional(seq(':', field('return_type', $._unthrowing_type))),
      optional($.throws_clause),
      field('body', $.block),
    )),

    _condition: $ => choice($._expression, $.let_condition),

    let_condition: $ => seq('let', field('pattern', $._pattern), '=', field('value', $._expression)),

    while_statement: $ => seq('while', '(', field('condition', $._condition), ')', field('body', $.block)),

    do_statement: $ => seq('do', field('body', $.block), 'while', '(', field('condition', $._expression), ')', ';'),

    for_statement: $ => seq(
      'for',
      '(',
      field('pattern', choice($._name, $.tuple_pattern)),
      'in',
      field('iterable', $._expression),
      ')',
      field('body', $.block),
    ),

    labeled_statement: $ => seq(
      field('label', $._name),
      ':',
      choice($.while_statement, $.do_statement, $.for_statement),
    ),

    // 'break outer value': a name before a value is the loop's label
    break_statement: $ => seq(
      'break',
      optional(choice(
        seq(field('label', $._name), field('value', $._expression)),
        field('value', $._expression),
      )),
      ';',
    ),

    continue_statement: $ => seq('continue', optional($._name), ';'),

    return_statement: $ => seq('return', optional($._expression), ';'),

    yield_statement: $ => seq('yield', optional($._expression), ';'),

    defer_statement: $ => seq('defer', choice($.block, seq($._expression, ';'))),

    catch_clause: $ => prec.right(seq(
      'catch',
      '(',
      field('binding', $._name),
      optional(choice(
        seq(':', commaSep1($._type)),
        seq('in', choice($._type, $.type_list)),
      )),
      ')',
      field('body', choice($.block, $._expression)),
    )),

    comptime_statement: $ => seq('comptime', $.for_statement),

    // ---- expressions ----

    _expression: $ => choice(
      $.identifier,
      $._contextual_name,
      $.this,
      $._literal,
      $.implicit_member,
      $.generic_name,
      $.struct_initializer,
      $.array_expression,
      $.tuple_expression,
      $.parenthesized_expression,
      $.lambda_expression,
      $.unary_expression,
      $.binary_expression,
      $.assignment_expression,
      $.range_expression,
      $.cast_expression,
      $.type_test_expression,
      $.try_expression,
      $.throw_expression,
      $.call_expression,
      $.trailing_call,
      $.member_expression,
      $.generic_member,
      $.field_by_info,
      $.index_expression,
      $.postfix_expression,
      $.with_expression,
      $.if_expression,
      $.match_expression,
      $.loop_expression,
      $.block,
      $.macro_invocation,
      $.quote_expression,
      $.splice,
      $.comptime_expression,
      $.attribute_expression,
    ),

    this: _ => 'this',

    implicit_member: $ => prec.right(seq('.', $._name, optional($.struct_initializer_body))),

    generic_name: $ => prec.dynamic(1, seq($.dotted_name, $.type_arguments)),

    struct_initializer: $ => prec.dynamic(1, seq(
      field('type', choice(
        $.dotted_name,
        seq($.dotted_name, $.type_arguments, repeat(seq('.', $._name))),
        $.field_by_info,
      )),
      field('body', $.struct_initializer_body),
    )),

    struct_initializer_body: $ => seq('{', commaSep($._initializer_item), '}'),

    _initializer_item: $ => choice(
      $.field_initializer,
      $.shorthand_field,
      $.info_field_initializer,
      $.comptime_field_initializer,
    ),

    field_initializer: $ => seq(field('name', $._name), choice('=', ':'), field('value', $._expression)),

    shorthand_field: $ => $._name,

    info_field_initializer: $ => seq('[', $._expression, ']', '=', field('value', $._expression)),

    comptime_field_initializer: $ => seq(
      'comptime', 'for', '(', $._name, 'in', $._expression, ')', $.info_field_initializer,
    ),

    array_expression: $ => seq('[', commaSep($._expression), ']'),

    tuple_expression: $ => seq(
      '(',
      $._expression,
      repeat1(seq(',', $._expression)),
      optional(','),
      ')',
    ),

    parenthesized_expression: $ => seq('(', $._expression, ')'),

    lambda_expression: $ => prec.right(PREC.lambda, seq(
      choice(
        field('parameters', $.lambda_parameters),
        field('parameter', $.identifier),
      ),
      '=>',
      field('body', $._expression),
    )),

    lambda_parameters: $ => seq(
      '(',
      commaSep(choice($.lambda_parameter, $.tuple_pattern)),
      ')',
      optional(seq(':', field('return_type', $._unthrowing_type), optional($.throws_clause))),
    ),

    lambda_parameter: $ => seq(optional('&'), field('name', $._name), optional(seq(':', field('type', $._type)))),

    unary_expression: $ => prec(PREC.unary, seq(
      field('operator', choice('!', '-', '~', '++', '--', '^')),
      field('operand', $._expression),
    )),

    binary_expression: $ => {
      const table = [
        [PREC.multiplicative, choice('*', '/', '%', '*%')],
        [PREC.additive, choice('+', '-', '+%', '-%')],
        [PREC.shift, choice('<<', '>>')],
        [PREC.bitand, '&'],
        [PREC.xor, '^'],
        [PREC.bitor, '|'],
        [PREC.comparison, choice('<', '<=', '>', '>=', 'in', '!in')],
        [PREC.equality, choice('==', '!=')],
        [PREC.and, '&&'],
        [PREC.or, '||'],
      ];
      return choice(
        ...table.map(([p, op]) => prec.left(/** @type {number} */ (p), seq(
          field('left', $._expression),
          field('operator', /** @type {RuleOrLiteral} */ (op)),
          field('right', $._expression),
        ))),
        prec.right(PREC.coalesce, seq(
          field('left', $._expression),
          field('operator', '??'),
          field('right', $._expression),
        )),
      );
    },

    assignment_expression: $ => prec.right(PREC.assign, seq(
      field('left', $._expression),
      field('operator', choice(...ASSIGNMENTS)),
      field('right', $._expression),
    )),

    range_expression: $ => choice(
      prec.left(PREC.range, seq($._expression, choice('..', '..='), $._expression)),
      prec.left(PREC.range, seq($._expression, choice('..', '..='))),
      prec.left(PREC.range, seq(choice('..', '..='), $._expression)),
      prec(PREC.range, choice('..', '..=')),
    ),

    cast_expression: $ => prec.left(PREC.cast, seq(field('value', $._expression), 'as', field('type', $._type))),

    type_test_expression: $ => prec.left(PREC.comparison, seq(field('value', $._expression), 'is', field('type', $._type))),

    try_expression: $ => prec.right(PREC.try, seq(
      choice('try', 'try?', 'try!'),
      $._expression,
      repeat($.catch_clause),
    )),

    throw_expression: $ => prec.right(PREC.unary, seq('throw', $._expression)),

    call_expression: $ => prec(PREC.call, seq(
      field('function', $._expression),
      field('arguments', $.arguments),
    )),

    generic_member: $ => prec.dynamic(1, prec(PREC.member, seq(
      field('object', $._expression),
      '.',
      field('member', $._name),
      field('type_arguments', $.type_arguments),
    ))),

    trailing_call: $ => prec(PREC.call, seq(
      field('function', $._expression),
      field('lambda', $.trailing_lambda),
    )),

    trailing_lambda: $ => seq(
      '{',
      optional(seq(commaSep1($.trailing_parameter), '=>')),
      repeat($._statement),
      optional(field('value', $._expression)),
      '}',
    ),

    trailing_parameter: $ => choice(seq(optional('&'), $._name), $.tuple_pattern),

    arguments: $ => seq('(', commaSep($.argument), ')'),

    argument: $ => seq(
      optional(seq(field('name', $._name), ':')),
      optional('&'),
      field('value', $._expression),
      optional('...'),
    ),

    member_expression: $ => prec(PREC.member, seq(
      field('object', $._expression),
      choice('.', '?.'),
      field('member', choice($._name, $.integer_literal, $.float_literal)),
    )),

    field_by_info: $ => prec(PREC.member, seq(
      field('object', $._expression),
      '.[',
      $._expression,
      optional(seq(',', $._expression)),
      ']',
    )),

    index_expression: $ => prec(PREC.postfix, seq(
      field('object', $._expression),
      '[',
      field('index', $._expression),
      ']',
    )),

    postfix_expression: $ => prec(PREC.postfix, seq(
      field('operand', $._expression),
      field('operator', choice('++', '--', '!')),
    )),

    with_expression: $ => prec(PREC.postfix, seq(
      $._expression,
      'with',
      '{',
      commaSep($.with_field),
      '}',
    )),

    with_field: $ => seq($.dotted_name, '=', $._expression),

    if_expression: $ => prec.right(seq(
      'if',
      '(',
      field('condition', $._condition),
      ')',
      field('consequence', choice($.block, $._expression)),
      optional(seq('else', field('alternative', choice($.block, $._expression)))),
    )),

    // an arm whose body is an expression needs its ',' but the last
    match_expression: $ => seq(
      'match',
      '(',
      field('value', $._expression),
      ')',
      '{',
      repeat(choice(
        seq(alias($._block_arm, $.match_arm), optional(',')),
        seq($.match_arm, ','),
      )),
      optional($.match_arm),
      '}',
    ),

    _arm_head: $ => seq(
      field('pattern', $._pattern),
      optional(seq('if', field('guard', $._expression))),
      '=>',
    ),

    _block_arm: $ => prec(1, seq($._arm_head, field('body', $.block))),

    match_arm: $ => seq($._arm_head, field('body', $._expression)),

    loop_expression: $ => seq(optional(seq(field('label', $._name), ':')), 'loop', field('body', $.block)),

    macro_invocation: $ => prec.dynamic(1, prec.right(seq(
      field('macro', $.identifier),
      '!',
      choice(
        seq($.macro_arguments, optional($.block)),
        $.block,
      ),
    ))),

    macro_arguments: $ => seq('(', commaSep($._expression), ')'),

    quote_expression: $ => seq('quote', '{', choice(repeat1(choice($.attribute_item, $._declaration)), seq(repeat($._statement), optional($._expression))), '}'),

    splice: $ => seq('#', '{', $._expression, '}'),

    comptime_expression: $ => prec.right(PREC.unary, seq('comptime', choice(
      $.block,
      $._expression,
    ))),

    attribute_expression: $ => prec.right(seq($.attribute_name, optional($.macro_arguments))),

    // ---- patterns ----

    _pattern: $ => choice(
      $.or_pattern,
      $._pattern_head,
    ),

    _pattern_head: $ => choice(
      $.identifier,
      $._contextual_name,
      $.wildcard_pattern,
      $.literal_pattern,
      $.range_pattern,
      $.typed_pattern,
      $.type_set_pattern,
      $.variant_pattern,
      $.tuple_pattern,
      $.array_pattern,
    ),

    or_pattern: $ => prec.left(seq($._pattern, '|', $._pattern)),

    wildcard_pattern: _ => '_',

    literal_pattern: $ => choice($._literal, seq('-', choice($.integer_literal, $.float_literal))),

    range_pattern: $ => seq($.literal_pattern, choice('..', '..='), $.literal_pattern),

    typed_pattern: $ => seq(choice($._name, $.wildcard_pattern), ':', $._type),

    type_set_pattern: $ => seq(choice($._name, $.wildcard_pattern), 'in', choice($._type, $.type_list)),

    variant_pattern: $ => prec.right(choice(
      seq(choice(seq('.', $._name), seq($._name, repeat1(seq('.', $._name)))), optional($._variant_payload)),
      seq($._name, $._variant_payload),
    )),

    _variant_payload: $ => choice(
      seq('(', commaSep($._pattern), ')'),
      seq('{', commaSep($.field_pattern), '}'),
    ),

    field_pattern: $ => seq(field('name', $._name), optional(seq('=', field('pattern', $._pattern)))),

    tuple_pattern: $ => seq('(', commaSep($._pattern), ')'),

    array_pattern: $ => seq('[', commaSep(choice($._pattern, $.rest_pattern)), ']'),

    rest_pattern: $ => seq('..', optional(choice($._name, $.wildcard_pattern))),

    // ---- literals ----

    _literal: $ => choice(
      $.integer_literal,
      $.float_literal,
      $.boolean_literal,
      $.null_literal,
      $.char_literal,
      $._string,
      $.byte_string_literal,
      $.f_string,
    ),

    _string: $ => choice($.string_literal, $.raw_string_literal, $.multiline_string_literal),

    integer_literal: _ => token(seq(
      choice(/0x[0-9A-Fa-f_]+/, /0o[0-7_]+/, /0b[01_]+/, /[0-9][0-9_]*/),
      INTEGER_SUFFIX,
    )),

    float_literal: _ => token(choice(
      seq(/[0-9][0-9_]*\.[0-9][0-9_]*/, optional(/[eE][+-]?[0-9_]+/), optional(/f32|f64/)),
      seq(/[0-9][0-9_]*/, /[eE][+-]?[0-9_]+/, optional(/f32|f64/)),
      seq(/[0-9][0-9_]*/, /f32|f64/),
    )),

    boolean_literal: _ => choice('true', 'false'),

    null_literal: _ => 'null',

    char_literal: _ => token(seq("'", choice(/[^'\\\n]/, /\\u\{[0-9A-Fa-f]+\}/, /\\./), "'")),

    escape_sequence: _ => token.immediate(choice(/\\u\{[0-9A-Fa-f]+\}/, /\\x[0-9A-Fa-f]{2}/, /\\./)),

    string_literal: $ => seq('"', repeat(choice($.string_content, $.escape_sequence)), token.immediate('"')),

    byte_string_literal: $ => seq('b"', repeat(choice($.string_content, $.escape_sequence)), token.immediate('"')),

    f_string: $ => choice(
      seq('f"', repeat(choice($.f_string_content, $.escape_sequence, $.brace_escape, $.interpolation)), token.immediate('"')),
      seq('fr"', repeat(choice($.f_string_raw_content, $.brace_escape, $.interpolation)), token.immediate('"')),
      seq('f"""', repeat(choice($.f_string_multiline_content, $.escape_sequence, $.brace_escape, $.interpolation)), '"""'),
      seq('fr"""', repeat(choice($.f_string_multiline_raw_content, $.brace_escape, $.interpolation)), '"""'),
    ),

    brace_escape: _ => token.immediate(choice('{{', '}}')),

    interpolation: $ => seq(
      token.immediate('{'),
      $._expression,
      optional($.format_spec),
      '}',
    ),

    format_spec: _ => token(seq(':', /[^}\n]*/)),

    // ---- comments ----

    line_comment: _ => token(seq('//', /[^\n]*/)),
  },
});
