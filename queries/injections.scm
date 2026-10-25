; A doc comment is Markdown: the lines of one, read as one text.
((line_comment) @injection.content
  (#match? @injection.content "^//[/!]")
  (#offset! @injection.content 0 3 0 0)
  (#set! injection.language "markdown")
  (#set! injection.combined))

; A comment's other text is the comment grammar's (TODO and the like), where an editor has one.
([(line_comment) (block_comment)] @injection.content
  (#not-match? @injection.content "^//[/!]")
  (#set! injection.language "comment"))
