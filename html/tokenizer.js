// This library CC-BY-SA woven and designed by Thaddée Tyl.
(function(exports) {

// Stream.
//

function Stream(input) {
  this.input = input;
  this.currentToken = this.startToken(token.char);
}
Stream.prototype = {
  line: 0,
  col: 0,
  index: 0,
  input: '',
  errors: [],
  // Token-wise.
  currentToken: null,
  previousTokenStart: 0,
  currentTokenStart: 0,

  peek: function() { return this.input.charCodeAt(this.index); },
  peekn: function(n) { return this.input.charCodeAt(this.index + n); },
  slice: function(n) { return this.input.slice(this.index, this.index + n); },
  char: function() {
    var ch = this.input.charCodeAt(this.index);
    if (ch === 13) {
      // Carriage return.
      this.col = 0;
    } else if (ch === 12) {
      // Form feed.
      this.line++;
    } else if (ch === 10) {
      // New line.
      this.line++;
      this.col = 0;
    } else {
      this.col++;
    }
    this.index++;
    return ch;
  },
  consume: function(n) {
    while (n > 0) { this.char(); n--; }
  },
  unconsume: function(n) {
    if (n == null) { n = 1; }
    // Warning: lines and columns are off. But unconsuming is an error.
    this.index -= n;
    this.col -= n;
  },
  error: function(cause) {
    this.errors.push((this.line + ":" + this.col) + ": " + cause);
  },
  hasTokenValue: function() {
    return this.index > this.currentTokenStart;
  },
  tokenValue: function() {
    return this.input.slice(this.currentTokenStart, this.index);
  },
  addToPreviousToken: function(tokens, tokType) {
    var lastToken = tokens[tokens.length - 1];
    if (lastToken != null && lastToken.type === tokType) {
      // Integrate in the previous token.
      lastToken.value += this.tokenValue();
      if (Object(lastToken.data) instanceof String
       && Object(this.currentToken.data) instanceof String) {
        lastToken.data += this.currentToken.data;
      }
      lastToken.end.line = this.line;
      lastToken.end.column = this.col;
      this.startToken(token.tokType);
    } else {
      tokens.push(this.emit(tokType));
    }
  },
  resumePreviousToken: function(tokens) {
    var lastToken = tokens[tokens.length - 1];
    if (lastToken != null) {
      this.currentTokenStart = this.previousTokenStart;
      if (Object(lastToken.data) instanceof String
       && Object(this.currentToken.data) instanceof String) {
        lastToken.data += this.currentToken.data;
      }
      this.currentToken = lastToken;
      tokens.pop();
    }
  },
  startToken: function(tokType) {
    this.currentTokenStart = this.index;
    this.currentToken = makeToken(tokType, '', null,
        {line: this.line, column: this.col},
        {line: this.line, column: this.col});
    return this.currentToken;
  },
  emit: function(tokType, data) {
    this.previousTokenStart = this.currentTokenStart;
    var token = this.currentToken;
    token.value = this.tokenValue();
    token.end.line = this.line;
    token.end.column = this.col;
    if (tokType != null) { token.type = tokType; }
    if (data != null) { token.data = data; }
    this.startToken(token.char);
    return token;
  },

  // HTML-specific state & functions.
  openElements: [],
  htmlFragmentParsingAlgorithm: false,
  additionalAllowedCharacter: 0,
  context: null,
  currentNode: null,
  adjustedCurrentNode: function() {
    if (this.htmlFragmentParsingAlgorithm && this.openElements.length === 1) {
      return this.context;
    } else {
      return this.currentNode;
    }
  }
};


// Tokenizer.
//
// We are using the rules available for free at <http://www.whatwg.org/C>.

var incr = 0;

// Tokens.
var token = {
  eof:           incr++, // End of file.
  char:          incr++, // Characters token.
  charRef:       incr++, // Character reference &…; token.
  startTagOpen:  incr++, // Start tag opening bracket.
  startTag:      incr++, // Start tag <…> token.
  startTagClose: incr++, // Start tag closing bracket.
  selfClosing:   incr++, // Start tag self closing slash <…/>
  commentTag:    incr++, // Comment tag <!-- … --> token.
  endTagOpen:    incr++, // End tag opening bracket </.
  endTag:        incr++, // End tag </…> token.
  endTagClose:   incr++, // End tag closing bracket >.
  attr:          incr++, // Attribute <a …>.
  attrEq:        incr++, // Attribute equal <a=…>.
  attrSingleQuotOpen:  incr++, // Attribute single quote <a='>.
  attrSingleQuotClose: incr++, // Attribute single quote <a=''>.
  attrDoubleQuotOpen:  incr++, // Attribute double quote <a=">.
  attrDoubleQuotClose: incr++, // Attribute double quote <a="">.
  attrValue:     incr++, // Attribute value.
  commentOpen:   incr++, // Start of comment <!--.
  comment:       incr++, // Comment <!--…-->.
  commentClose:  incr++, // End of comment -->.
  doctypeOpen:   incr++, // Doctype <!doctype.
  doctype:       incr++, // Doctype <!doctype…>.
  doctypeClose:  incr++, // Doctype >.
};

function Token(type, value, data, start, end) {
  this.type = +type;
  this.value = ''+value;
  this.data = data;
  this.start = start;
  this.end = end;
}

function makeToken(type, value, data, start, end) {
  return new Token(type, value, data, start, end);
}

function addCharToken(tokens, stream) {
  if (stream.hasTokenValue()) {
    stream.addToPreviousToken(tokens, token.char);
  }
}

function addAttrValueToken(tokens, stream) {
  if (stream.hasTokenValue()) {
    stream.addToPreviousToken(tokens, token.attrValue);
  }
}


var state = {
  dataState: dataState,
  characterReferenceInDataState: characterReferenceInDataState,
  tagOpenState: tagOpenState,
  markupDeclarationOpenState: markupDeclarationOpenState,
  endTagOpenState: endTagOpenState,
  tagNameState: tagNameState,
  // Comment
  bogusCommentState: bogusCommentState,
  commentStartState: commentStartState,
  commentStartDashState: commentStartDashState,
  commentState: commentState,
  commentEndState: commentEndState,
  commentEndDashState: commentEndDashState,
  commentEndBangState: commentEndBangState,
  // Doctype
  doctypeState: doctypeState,
  beforeDoctypeNameState: beforeDoctypeNameState,
  doctypeNameState: doctypeNameState,
  afterDoctypeNameState: afterDoctypeNameState,
  afterDoctypePublicKeywordState: afterDoctypePublicKeywordState,
  beforeDoctypePublicIdentifierState: beforeDoctypePublicIdentifierState,
  doctypePublicIdentifierDoubleQuotedState: doctypePublicIdentifierDoubleQuotedState,
  doctypePublicIdentifierSingleQuotedState: doctypePublicIdentifierSingleQuotedState,
  afterDoctypePublicIdentifierState: afterDoctypePublicIdentifierState,
  doctypeSystemIdentifierDoubleQuotedState: doctypeSystemIdentifierDoubleQuotedState,
  doctypeSystemIdentifierSingleQuotedState: doctypeSystemIdentifierSingleQuotedState,
  betweenDoctypePublicAndSystemIdentifiersState: betweenDoctypePublicAndSystemIdentifiersState,
  afterDoctypeSystemKeywordState: afterDoctypeSystemKeywordState,
  bogusDoctypeState: bogusDoctypeState,
  cdataSectionState: cdataSectionState,
  // Attribute
  beforeAttributeNameState: beforeAttributeNameState,
  attributeNameState: attributeNameState,
  afterAttributeNameState: afterAttributeNameState,
  beforeAttributeValueState: beforeAttributeValueState,
  selfClosingStartTagState: selfClosingStartTagState,
  attributeValueDoubleQuotedState: attributeValueDoubleQuotedState,
  attributeValueUnquotedState: attributeValueUnquotedState,
  attributeValueSingleQuotedState: attributeValueSingleQuotedState,
  afterAttributeValueQuotedState: afterAttributeValueQuotedState,
  characterReferenceInAttributeValueState: characterReferenceInAttributeValueState,
};

// All state functions return the function of the next state function to be run.

// 12.2.4.1
function dataState(stream, tokens) {
  var ch = stream.peek();
  var nextState = dataState;
  if (ch === 0x26) {
    // Ampersand &
    addCharToken(tokens, stream);
    nextState = state.characterReferenceInDataState;
  } else if (ch === 0x3c) {
    // Less-than sign
    addCharToken(tokens, stream);
    stream.char();
    tokens.push(stream.emit(token.startTagOpen));
    return state.tagOpenState;
  } else if (ch !== ch) {
    // EOF
    addCharToken(tokens, stream);
    tokens.push(stream.emit(token.eof));
    nextState = null;
  } else if (ch === 0x0) {
    // NULL
    stream.error("NULL character found.");
    nextState = dataState;
  } else {
    // normal text
    nextState = dataState;
  }
  stream.char();
  return nextState;
}

// 12.2.4.2
function characterReferenceInDataState(stream, tokens) {
  var res = consumeCharacterReference(stream);
  if (res != null) {
    tokens.push(res);
  } else {
    // Ghost token.
    addCharToken(tokens, stream);
  }
  return state.dataState;
}

// 12.2.4.8
function tagOpenState(stream, tokens) {
  var ch = stream.char();
  if (ch === 0x21) {            // Exclamation mark (!)
    var lastToken = tokens[tokens.length - 1];
    lastToken.type = token.commentOpen;
    return state.markupDeclarationOpenState;
  } else if (ch === 0x2f) {     // Solidus (/)
    var lastToken = tokens[tokens.length - 1];
    lastToken.type = token.endTagOpen;
    stream.addToPreviousToken(tokens, token.endTagOpen);
    return state.endTagOpenState;
  } else if (isUppercaseAscii(ch)) {
    stream.currentToken.type = token.startTag;
    stream.currentToken.data = String.fromCharCode(ch + 0x20);
    return state.tagNameState;
  } else if (isLowercaseAscii(ch)) {
    stream.currentToken.type = token.startTag;
    stream.currentToken.data = String.fromCharCode(ch);
    return state.tagNameState;
  } else if (ch === 0x3f) {     // ?
    stream.error('Remove the ? at the start of the tag.');
    return state.bogusCommentState;
  } else {
    stream.error('Invalid start of tag "' + String.fromCharCode(ch) + '".');
    addCharToken(tokens, stream);
    return state.dataState;
  }
}

// 12.2.4.9
function endTagOpenState(stream, tokens) {
  var ch = stream.char();
  if (isUppercaseAscii(ch)) {
    stream.currentToken.type = token.endTag;
    stream.currentToken.data = String.fromCharCode(ch + 0x20);
    return state.tagNameState;
  } else if (isLowercaseAscii(ch)) {
    stream.currentToken.type = token.endTag;
    stream.currentToken.data = String.fromCharCode(ch);
    return state.tagNameState;
  } else if (ch === 0x3e) {     // >
    stream.error('Invalid end tag "</>".');
    return state.dataState;
  } else if (ch === null) {     // EOF
    stream.error('Invalid end of file in end tag.');
    addCharToken(tokens, stream);
    stream.unconsume(1);
    return state.dataState;
  } else {
    stream.error('Invalid "' + String.fromCharCode(ch) + '" in end tag.');
    return state.bogusCommentState;
  }
}

// 12.2.4.10
function tagNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LINE FEED, FORM FEED, SPACE
    tokens.push(stream.emit());
    stream.char();
    return state.beforeAttributeNameState;
  } else if (ch === 0x2f) {  // SOLIDUS '/'
    tokens.push(stream.emit());
    stream.char();
    tokens.push(stream.emit(token.selfClosing));
    return state.selfClosingStartTagState;
  } else if (ch === 0x3e) {  // GREATER-THAN SIGN >
    var lastToken = tokens[tokens.length - 1];
    var closeToken = lastToken.type === token.endTagOpen? token.endTagClose: token.startTagClose;
    tokens.push(stream.emit());
    stream.char();
    tokens.push(stream.emit(closeToken));
    return state.dataState;
  } else if (isUppercaseAscii(ch)) {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch + 0x20);
  } else if (ch === 0) {
    stream.error("Invalid null character in tag name");
    stream.char();
    stream.currentToken.data += '\ufffd';
  } else if (ch !== ch) {  // EOF
    stream.error("Invalid end of file in tag name");
    return state.dataState;
  } else {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
  }
  return state.tagNameState;
}

// 12.2.4.34
function beforeAttributeNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LINE FEED, FORM FEED, SPACE
    stream.char();
  } else if (ch == 0x2f) {  // SOLIDUS '/'
    stream.startToken(token.selfClosing);
    stream.char();
    tokens.push(stream.emit());
    return state.selfClosingStartTagState;
  } else if (ch == 0x3e) {  // GREATER-THAN '>'
    stream.startToken(token.startTagClose);
    stream.char();
    tokens.push(stream.emit());
    return state.dataState;
  } else if (isUppercaseAscii(ch)) {
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = String.fromCharCode(ch + 0x20);
    return state.attributeNameState;
  } else if (ch === 0x0) {  // NULL
    stream.error("Invalid null character before attribute name");
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = '\ufffd';
    return state.attributeNameState;
  } else if (ch !== ch) {  // EOF
    stream.error("Invalid end of file before attribute name");
    return state.dataState;
  } else {
    if (ch === 0x22 || ch === 0x27 || ch === 0x3c || ch === 0x3d) {  // " ' < =
      stream.error("Invalid character before attribute name: " +
        String.fromCharCode(ch));
    }
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = String.fromCharCode(ch);
    return state.attributeNameState;
  }
  return state.beforeAttributeNameState;
}

// 12.2.4.35
function attributeNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LINE FEED, FORM FEED, SPACE
    tokens.push(stream.emit(token.attr));
    stream.char();
    return state.afterAttributeNameState;
  } else if (ch === 0x2f) {  // /
    tokens.push(stream.emit(token.attr));
    stream.char();
    tokens.push(stream.emit(token.selfClosing));
    return state.selfClosingStartTagState;
  } else if (ch === 0x3d) {  // =
    tokens.push(stream.emit(token.attr));
    stream.startToken(token.attrEq);
    stream.char();
    tokens.push(stream.emit());
    return state.beforeAttributeValueState;
  } else if (ch === 0x3e) {  // >
    tokens.push(stream.emit(token.attr));
    stream.char();
    return state.dataState;
  } else if (isUppercaseAscii(ch)) {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch + 0x20);
  } else if (ch === 0) {
    stream.char();
    stream.currentToken.data += '\ufffd';
  } else if (ch !== ch) {  // EOF
    stream.error("Invalid end of file in attribute");
    tokens.push(stream.emit(token.attr));
    return state.dataState;
  } else {
    if (ch === 0x22 || ch === 0x27 || ch === 0x3c) {  // " ' <
      stream.error("Invalid character '" + String.fromCharCode(ch) + "'" +
        " in attribute");
    }
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
  }
  return state.attributeNameState;
}

// 12.2.4.36
function afterAttributeNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
  } else if (ch === 0x2f) {  // /
    stream.startToken(token.selfClosing);
    stream.char();
    tokens.push(stream.emit());
    return state.selfClosingStartTagState;
  } else if (ch === 0x3d) {  // =
    stream.startToken(token.attrEq);
    stream.char();
    tokens.push(stream.emit());
    return state.beforeAttributeValueState;
  } else if (ch === 0x3e) {  // >
    stream.startToken(token.startTagClose);
    stream.char();
    tokens.push(stream.emit());
    return state.dataState;
  } else if (isUppercaseAscii(ch)) {
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = String.fromCharCode(ch + 0x20);
    return state.attributeNameState;
  } else if (ch === 0) {
    stream.error("Null character after attribute name '" +
      tokens[tokens.length - 1].value + "'");
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = '\ufffd';
    return state.attributeNameState;
  } else if (ch !== ch) {  // EOF
    stream.error("Reached end of file after attribute name");
    stream.unconsume();
    return state.dataState;
  } else {
    if (ch === 0x22 || ch === 0x27 || ch === 0x3c) {  // " ' <
      stream.error("Invalid '" + String.fromCharCode(ch) +
        "' after attribute name '" + tokens[tokens.length - 1].value + "'");
    }
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = String.fromCharCode(ch);
    return state.attributeNameState;
  }
  return state.afterAttributeNameState;
}

// 12.2.4.37
function beforeAttributeValueState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // Tab, LF, FF, Space
    stream.char();
  } else if (ch === 0x22) {  // "
    stream.startToken(token.attrDoubleQuotOpen);
    stream.char();
    tokens.push(stream.emit());
    stream.startToken(token.attrValue);
    stream.currentToken.data = '';
    return state.attributeValueDoubleQuotedState;
  } else if (ch === 0x26) {  // &
    stream.startToken(token.attrValue);
    stream.currentToken.data = '';
    return state.attributeValueUnquotedState;
  } else if (ch === 0x27) {  // '
    stream.startToken(token.attrSingleQuotOpen);
    stream.char();
    tokens.push(stream.emit());
    stream.startToken(token.attrValue);
    stream.currentToken.data = '';
    return state.attributeValueSingleQuotedState;
  } else if (ch === 0) {
    stream.error("Null character in attribute value after attribute name '" +
      tokens[tokens.length - 1].value + "'");
    stream.startToken(token.attr);
    stream.char();
    stream.currentToken.data = '\ufffd';
  } else if (ch === 0x3e) {  // >
    stream.error("Invalid '>' at the start of attribute value");
    stream.startToken(token.startTagClose);
    stream.char();
    tokens.push(stream.emit());
    return stream.dataState;
  } else if (ch !== ch) {
    stream.error("End of file at the start of attribute value");
    return stream.dataState;
  } else {
    stream.startToken(token.attrValue);
    stream.currentToken.data = String.fromCharCode(ch);
    if (ch === 0x3c || ch === 0x3d || ch === 0x60) {
      // < = `
      stream.error("Invalid '" + String.fromCharCode(ch) +
        "' at the start of attribute value");
    } else {
      stream.char();
    }
    return state.attributeValueUnquotedState;
  }
  return state.beforeAttributeValueState;
}

// 12.2.4.38
function attributeValueDoubleQuotedState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x22) {  // "
    addAttrValueToken(tokens, stream);
    stream.startToken(token.attrDoubleQuotClose);
    stream.char();
    tokens.push(stream.emit());
    return state.afterAttributeValueQuotedState;
  } else if (ch === 0x26) {  // &
    stream.char();
    stream.additionalAllowedCharacter = 0x22;
    return state.characterReferenceInAttributeValueState;
  } else if (ch !== ch) {
    stream.error("End of file at the start of attribute value");
    return stream.dataState;
  } else {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
  }
  return state.attributeValueDoubleQuotedState;
}

// 12.2.4.39
function attributeValueSingleQuotedState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x27) {  // '
    addAttrValueToken(tokens, stream);
    stream.startToken(token.attrSingleQuotClose);
    stream.char();
    tokens.push(stream.emit());
    return state.afterAttributeValueQuotedState;
  } else if (ch === 0x26) {  // &
    stream.char();
    stream.additionalAllowedCharacter = 0x27;
    return state.characterReferenceInAttributeValueState;
  } else if (ch !== ch) {
    stream.error("End of file at the start of attribute value");
    return stream.dataState;
  } else {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
  }
  return state.attributeValueSingleQuotedState;
}

// 12.2.4.40
function attributeValueUnquotedState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // Tab, LF, FF, Space
    stream.char();
    return state.beforeAttributeNameState;
  } else if (ch === 0x26) {  // &
    addAttrValueToken(tokens, stream);
    stream.char();
    return state.characterReferenceInAttributeValueState;
  } else if (ch === 0x3e) {  // >
    addAttrValueToken(tokens, stream);
    stream.startToken(token.startTagClose);
    stream.char();
    tokens.push(stream.emit());
    return state.dataState;
  } else if (ch === 0) {  // NULL
    stream.char();
    stream.error("Null character at the start of unquoted attribute value");
    stream.currentToken.data += '\ufffd';
  } else if (ch !== ch) {
    stream.error("End of file at the start of unquoted attribute value");
    return stream.dataState;
  } else {
    if (ch === 0x22 || ch === 0x27 || ch === 0x3c || ch === 0x3d
      || ch === 0x60) {
      // " ' < = `
      stream.error("This character is in an unquoted attribute: '"
          + String.fromCharCode(ch) + "'");
    }
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
  }
  return state.attributeValueUnquotedState;
}

// 12.2.4.41
function characterReferenceInAttributeValueState(stream, tokens) {
  var res = consumeCharacterReference(stream, true);
  if (res != null) {
    tokens.push(res);
    stream.currentToken.data = '';
  } else {
    // Ghost token.
    stream.currentToken.data = '&';
  }
  return state.attributeValueUnquotedState;
}

// 12.2.4.42
function afterAttributeValueQuotedState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // Tab, LF, FF, Space
    stream.char();
    return state.beforeAttributeNameState;
  } else if (ch === 0x2f) {  // /
    stream.startToken(token.selfClosing);
    stream.char();
    tokens.push(stream.emit());
    return state.selfClosingStartTagState;
  } else if (ch === 0x3e) {  // >
    stream.startToken(token.startTagClose);
    stream.char();
    tokens.push(stream.emit());
    return state.dataState;
  } else if (ch !== ch) {
    stream.error("End of file at the start of attribute value");
    return state.dataState;
  } else {
    stream.error("Invalid '" + String.fromCharCode(ch) +
      "' after a doubly quoted attribute value");
    return state.beforeAttributeNameState;
  }
  return state.afterAttributeValueQuotedState;
}

// 12.2.4.43
function selfClosingStartTagState(stream, tokens) {
  var ch = stream.char();
  if (ch === 0x3e) {  // >
    tokens.push(stream.emit(token.startTagClose));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error("End of file in self-closing tag");
    stream.unconsume();
    return state.dataState;
  } else {
    stream.error("Invalid character '" + String.fromCharCode(ch) +
      "' in self-closing tag");
    stream.unconsume();
    return state.beforeAttributeNameState;
  }
}

// 12.2.4.44
function bogusCommentState(stream, tokens) {
  var ch = stream.char();
  while (ch !== 0x3e || ch !== ch) {
    // While not GREATER-THAN SIGN or EOF.
    ch = stream.char();
  }
  stream.emit(token.comment);
  return stream.dataState;
}

// 12.2.4.45
function markupDeclarationOpenState(stream, tokens) {
  var c0 = stream.peek();
  var c1 = stream.peekn(1);
  if (c0 === 0x2d && c1 === 0x2d) {     // HYPHEN-MINUS -
    stream.consume(2);
    stream.addToPreviousToken(tokens, token.commentOpen);
    stream.startToken(token.comment);
    return state.commentStartState;
  } else if (/^doctype$/i.test(stream.slice(7))) {
    stream.consume(7);
    // The previous token is declared as commentOpen by default.
    stream.addToPreviousToken(tokens, token.commentOpen);
    tokens[tokens.length - 1].type = token.doctypeOpen;
    tokens[tokens.length - 1].data = {forceQuirksFlag: false};
    stream.startToken(token.doctype);
    stream.currentToken.data = '';
    return state.doctypeState;
  } else if (stream.adjustedCurrentNode() !== null
          && stream.slice(7) === "[CDATA[") {
    stream.consume(7);
    return state.cdataSectionState;
  } else {
    stream.error('Invalid character "' + String.fromCharCode(c0) +
        '" in <! declaration.');
    return state.bogusCommentState;
  }
}

// 12.2.4.46
function commentStartState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x2d) {      // HYPHEN-MINUS -
    stream.char();
    return state.commentStartDashState;
  } else if (ch !== ch) { // EOF
    stream.error('End of file in comment');
    return state.dataState;
  } else {
    stream.char();
    if (ch === 0) {  // NULL
      stream.error('Null character in comment');
      stream.currentToken.data = '\ufffd';
    } else {
      stream.currentToken.data = String.fromCharCode(ch);
    }
    return state.commentState;
  }
}

// 12.2.4.47
function commentStartDashState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x2d) {        // HYPHEN-MINUS -
    stream.char();
    return state.commentEndState;
  } else if (ch === 0) {    // NULL
    stream.char();
    stream.error('Null character in empty comment');
    stream.currentToken.data += '-\ufffd';
    return state.commentState;
  } else if (ch === 0x3e) { // >
    stream.char();
    stream.error('End of comment lacks a dash `-`');
    tokens.push(stream.emit(token.commentClose));
    return state.dataState;
  } else if (ch !== ch) {   // EOF
    stream.error('End of file at end of comment');
    tokens.push(stream.emit(token.commentClose));
    return state.dataState;
  } else {
    stream.char();
    stream.currentToken.data += '-' + String.fromCharCode(ch);
    return state.commentState;
  }
}

// 12.2.4.48
function commentState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x2d) {      // HYPHEN-MINUS -
    tokens.push(stream.emit(token.comment));
    stream.char();
    return state.commentEndDashState;
  } else if (ch !== ch) { // EOF
    stream.error('End of file in comment');
    tokens.push(stream.emit(token.comment));
    return state.dataState;
  } else {
    stream.char();
    if (ch === 0) {
      stream.error('Null character in comment');
      stream.currentToken.data += '\ufffd';
    } else {
      stream.currentToken.data += String.fromCharCode(ch);
    }
    return state.commentState;
  }
}

// 12.2.4.49
function commentEndDashState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x2d) {      // HYPHEN-MINUS -
    stream.char();
    return state.commentEndState;
  } else if (ch !== ch) { // EOF
    stream.error('End of file in comment after a dash');
    tokens.push(stream.emit(token.comment));
    return state.dataState;
  } else {
    stream.char();
    stream.resumePreviousToken(tokens);
    if (ch === 0) {  // NULL
      stream.error('Null character in comment after a dash');
      stream.currentToken.data += '-\ufffd';
    } else {
      stream.currentToken.data += '-' + String.fromCharCode(ch);
    }
    return state.commentState;
  }
}

// 12.2.4.50
function commentEndState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x3e) {        // >
    stream.char();
    tokens.push(stream.emit(token.commentClose));
    return state.dataState;
  } else if (ch === 0x21) { // !
    stream.char();
    stream.error('Incorrect --! end of a comment');
    return state.commentEndBangState;
  } else if (ch === 0x2d) { // HYPHEN-MINUS -
    stream.char();
    stream.error('Incorrect --- in a comment');
    tokens[tokens.length - 1].data += '-';
    tokens[tokens.length - 1].end.column++;
    stream.currentToken.start.column++;
    stream.currentTokenStart++;
    return state.commentEndState;
  } else if (ch !== ch) {   // EOF
    stream.error("End of file at the very end of comment");
    tokens.push(stream.emit(token.commentClose));
    return state.dataState;
  } else {
    stream.char();
    stream.resumePreviousToken(tokens);
    if (ch === 0) {  // NULL
      stream.error('Null character after two dashes in a comment');
      stream.currentToken.data += '--\ufffd';
    } else {
      stream.currentToken.data += '--' + String.fromCharCode(ch);
    }
    return state.commentState;
  }
}

// 12.2.4.51
function commentEndBangState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x2d) {        // HYPHEN-MINUS -
    stream.char();
    tokens[tokens.length - 1].data += '--!';
    tokens[tokens.length - 1].end.column += 3;
    stream.currentToken.start.column += 3;
    stream.currentTokenStart += 3;
    return state.commentEndDashState;
  } else if (ch === 0x3e) { // >
    stream.char();
    tokens.push(stream.emit(token.commentClose));
    return state.dataState;
  } else if (ch !== ch) {   // EOF
    if (ch === 0) {  // NULL
      stream.error('Null character after --! in a comment');
      stream.currentToken.data += '--!\ufffd';
    } else {
      stream.currentToken.data += '--!' + String.fromCharCode(ch);
    }
    return state.commentState;
  }
}

// 12.2.4.52
function doctypeState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.beforeDoctypeNameState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file at start of doctype');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else {
    stream.error('No space between doctype declaration and content');
    return state.beforeDoctypeNameState;
  }
}

// 12.2.4.53
function beforeDoctypeNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.beforeDoctypeNameState;
  } else if (ch === 0) {  // NULL
    stream.char();
    stream.error('Null character inside doctype');
    stream.currentToken.data += '\ufffd';
    return state.doctypeNameState;
  } else if (ch === 0x3e) {  // >
    if (stream.hasTokenValue()) {
      tokens.push(stream.emit(token.doctype));
    }
    stream.char();
    stream.error('Empty doctype');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctypeClose));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file inside doctype');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (isUppercaseAscii(ch)) {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch + 0x20);
    return state.doctypeNameState;
  } else {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
    return state.doctypeNameState;
  }
}

// 12.2.4.54
function doctypeNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.afterDoctypeNameState;
  } else if (ch === 0x3e) {  // >
    tokens.push(stream.emit(token.doctype));
    stream.char();
    tokens.push(stream.emit(token.doctypeClose));
    return state.dataState;
  } else if (ch === 0) {  // NULL
    stream.char();
    stream.error('Null character inside doctype name');
    stream.currentToken.data += '\ufffd';
    return state.doctypeNameState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file inside doctype name');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (isUppercaseAscii(ch)) {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch + 0x20);
    return state.doctypeNameState;
  } else {
    stream.char();
    stream.currentToken.data += String.fromCharCode(ch);
    return state.doctypeNameState;
  }
}

// 12.2.4.55
function afterDoctypeNameState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.afterDoctypeNameState;
  } else if (ch === 0x3e) { // >
    tokens.push(stream.emit(token.doctype));
    stream.char();
    tokens.push(stream.emit(token.doctypeClose));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file after doctype name');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (/^public$/i.test(stream.slice(6))) {
    stream.consume(6);
    return state.afterDoctypePublicKeywordState;
  } else if (/^system$/i.test(stream.slice(6))) {
    stream.consume(6);
    return state.afterDoctypeSystemKeywordState;
  } else {
    stream.error('Invalid "' + String.fromCharCode(ch)
      + '" after doctype name');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    return state.bogusDoctypeState;
  }
}

// 12.2.4.56
function afterDoctypePublicKeywordState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.beforeDoctypePublicIdentifierState;
  } else if (ch === 0x22) {  // "
    stream.error('Quotation mark after doctype PUBLIC');
    stream.char();
    tokens[tokens.length - 1].data.publicIdentifier = '';
    return state.doctypePublicIdentifierDoubleQuotedState;
  } else if (ch === 0x27) {  // '
    stream.error('Apostrophe after doctype PUBLIC');
    stream.char();
    tokens[tokens.length - 1].data.publicIdentifier = '';
    return state.doctypePublicIdentifierSingleQuotedState;
  } else if (ch === 0x3e) {  // >
    stream.error('Closing bracket > after doctype PUBLIC');
    stream.char();
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file after doctype PUBLIC');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else {
    stream.error('Invalid "' + String.fromCharCode(ch)
      + '" after doctype PUBLIC');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    return state.bogusDoctypeState;
  }
}

// 12.2.4.57
function beforeDoctypePublicIdentifierState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.beforeDoctypePublicIdentifierState;
  } else if (ch === 0x22) {  // "
    stream.char();
    tokens[tokens.length - 1].data.publicIdentifier = '';
    return state.doctypePublicIdentifierDoubleQuotedState;
  } else if (ch === 0x27) {  // '
    stream.char();
    tokens[tokens.length - 1].data.publicIdentifier = '';
    return state.doctypePublicIdentifierSingleQuotedState;
  } else if (ch === 0x3e) {  // >
    stream.error('Closing bracket > after doctype PUBLIC and spaces');
    stream.char();
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file after doctype PUBLIC and spaces');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else {
    stream.error('Invalid "' + String.fromCharCode(ch)
      + '" after doctype PUBLIC and spaces');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    return state.bogusDoctypeState;
  }
}

// 12.2.4.58
function doctypePublicIdentifierDoubleQuotedState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x22) {  // "
    stream.char();
    return state.afterDoctypePublicIdentifierState;
  } else if (ch === 0) {  // NULL
    stream.error('Invalid NULL in double-quoted PUBLIC doctype');
    stream.currentToken.data += '\ufffd';
    stream.char();
    return state.doctypePublicIdentifierDoubleQuotedState;
  } else if (ch === 0x3e) {  // >
    stream.error('Closing bracket > in double-quoted PUBLIC doctype');
    stream.char();
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else {
    stream.char();
    tokens[tokens.length - 1].data.publicIdentifier += String.fromCharCode(ch);
    return state.doctypePublicIdentifierDoubleQuotedState;
  }
}

// 12.2.4.59
function doctypePublicIdentifierSingleQuotedState(stream, tokens) {
  var ch = stream.peek();
  // TODO
}

// 12.2.4.60
function afterDoctypePublicIdentifierState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.betweenDoctypePublicAndSystemIdentifiersState;
  } else if (ch === 0x22) {  // "
    stream.char();
    stream.error('Double quotation after doctype PUBLIC identifier');
    tokens[tokens.length - 1].data.systemIdentifier = '';
    return state.doctypeSystemIdentifierDoubleQuotedState;
  } else if (ch === 0x27) {  // '
    stream.char();
    stream.error('Single quotation after doctype PUBLIC identifier');
    tokens[tokens.length - 1].data.systemIdentifier = '';
    return state.doctypeSystemIdentifierSingleQuotedState;
  } else if (ch === 0x3e) {  // >
    stream.char();
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file after doctype PUBLIC identifier');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else {
    stream.error('Invalid "' + String.fromCharCode(ch)
      + '" after doctype PUBLIC identifier');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    return state.bogusDoctypeState;
  }
}

// 12.2.4.61
function betweenDoctypePublicAndSystemIdentifiersState(stream, tokens) {
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20) {
    // TAB, LF, FF, SPACE
    stream.char();
    return state.betweenDoctypePublicAndSystemIdentifiersState;
  } else if (ch === 0x22) {  // "
    stream.char();
    tokens[tokens.length - 1].data.systemIdentifier = '';
    return state.doctypeSystemIdentifierDoubleQuotedState;
  } else if (ch === 0x27) {  // '
    stream.char();
    tokens[tokens.length - 1].data.systemIdentifier = '';
    return state.doctypeSystemIdentifierSingleQuotedState;
  } else if (ch === 0x3e) {  // >
    stream.char();
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else if (ch !== ch) {  // EOF
    stream.error('End of file between doctype PUBLIC and SYSTEM identifiers');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    tokens.push(stream.emit(token.doctype));
    return state.dataState;
  } else {
    stream.error('Invalid "' + String.fromCharCode(ch)
      + '" between doctype PUBLIC and SYSTEM identifiers');
    tokens[tokens.length - 1].data.forceQuirksFlag = true;
    return state.bogusDoctypeState;
  }
}

// 12.2.4.62
function afterDoctypeSystemKeywordState(stream, tokens) {
  var ch = stream.peek();
  // TODO
}

// 12.2.4.64
function doctypeSystemIdentifierDoubleQuotedState(stream, tokens) {
  var ch = stream.peek();
  // TODO
}

// 12.2.4.65
function doctypeSystemIdentifierSingleQuotedState(stream, tokens) {
  var ch = stream.peek();
  // TODO
}

// 12.2.4.67
function bogusDoctypeState(stream, tokens) {
  var ch = stream.peek();
  // TODO
}

// 12.2.4.68
function cdataSectionState(stream, tokens) {
  // TODO
}

// 12.2.4.69
function consumeCharacterReference(stream, isAttribute) {
  var additionalAllowedCharacter = stream.additionalAllowedCharacter;
  var ch = stream.peek();
  if (ch === 0x9 || ch === 0xa || ch === 0xc || ch === 0x20 || ch === 0x3c || ch === 0x26 || ch !== ch || ch === additionalAllowedCharacter) {
    // TAB LF FF SPACE LESS-THAN AMPERSAND EOF AdditionalAllowedCharacter
    return;
  } else if (ch === 0x23) {
    // NUMBER-SIGN
    stream.char();  // consume it.
    var numberSize = 0; // Number of digits in the number.
    var encodedNumber;  // What number is encoded.
    var nextch = stream.peek();
    if (nextch === 0x78 || nextch === 0x58) {
      // x X [ASCII hex digits]
      stream.char();    // consume it.
      var digit = stream.peek();
      if (!isHexDigit(digit)) {
        // The digit isn't a valid hex digit.
        stream.error('No digits after a &#x…; token.');
        stream.unconsume(2);    // Unconsume '#x'.
        return;
      } else {
        while (isHexDigit(stream.peek())) {
          stream.char();
          numberSize++;
        }
        // We have consumed all hex digits.
        var encodedNumberString = stream.input.slice(
            stream.index - numberSize, stream.index
            );
        encodedNumber = parseInt(encodedNumberString, 16);
      }
    } else {
      // [ASCII digits]
      stream.char();    // consume it.
      var digit = stream.peek();
      if (!isDigit(digit)) {
        // The digit isn't a valid digit.
        stream.error('No digits after a &#…; token.');
        stream.unconsume();    // Unconsume '#'.
        return;
      } else {
        while (isDigit(stream.peek())) {
          stream.char();
          numberSize++;
        }
        // We have consumed all digits.
        var encodedNumberString = stream.input.slice(
            stream.index - numberSize, stream.index
            );
        encodedNumber = parseInt(encodedNumberString, 10);
      }
    }
    // The next character must be a semicolon.
    if (stream.peek() === 0x3b) {
      // SEMICOLON
      stream.char();    // consume it.
      // Is the decoded number valid?
      for (var i = 0; i < consumeCharacterReferenceInvalidNumber.length; i++) {
        if (encodedNumber === consumeCharacterReferenceInvalidNumber[i]) {
          // No.
          stream.error('Invalid &#…; token.');
          return stream.emit(token.charRef,
            consumeCharacterReferenceReplaceInvalidNumber[i]);
        }
      }
      // Other invalid possibilities!
      if (consumeCharacterReferenceFurtherInvalidNumber(encodedNumber)) {
        return stream.emit(token.charRef, '\ufffd');
      }
      // We have something valid. Good.
      return stream.emit(token.charRef, String.fromCodePoint(encodedNumber));
    } else {
      // Bah! Parse error.
      stream.error('No semicolon in an &…; token.');
      return;
    }
  } else {
    // Conventional &…; production.
    // The minimum token is '&gt', the maximum is
    // '&CounterClockwiseContourIntegral;'
    for (var i = 32; i >= 2; i--) {
      var reference = stream.input.slice(stream.index, stream.index + i);
      var potential = consumeCharacterReferenceTable['&' + reference];
      if (potential != null) {
        // We have a winner! eg, '&gt;' → reference = 'gt;'.
        if (reference[reference.length-1] !== ';') {
          // Slightly invalid production.
          if (isAttribute) {
            if (/[a-zA-Z0-9]/.test(
                  stream.input.slice(stream.index + i, stream.index + i + 1))) {
              return;
            } else if (stream.input
                .slice(stream.index + i, stream.index + i + 1) === '=') {
              stream.error('A &…; token without the ; has an = after it.');
              return;
            }
          }
          stream.error('Missing a semicolon at the end of a &…; token.');
        }
        stream.consume(i);
        return stream.emit(token.charRef, potential.characters);
      }
    }
    // Too bad, this is a mistake!
    stream.error('Unknown &…; production.');
    return;
  }
}

var consumeCharacterReferenceInvalidNumber = [
  0x0, 0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f
];
var consumeCharacterReferenceReplaceInvalidNumber = [
  '\ufffd', '\u20ac', '\u201a', '\u0192', '\u201e', '\u2026', '\u2020', '\u2021', '\u02c6', '\u2030', '\u0160', '\u2039', '\u0152', '\u017d', '\u2018', '\u2019', '\u201c', '\u201d', '\u2022', '\u2013', '\u2014', '\u02dc', '\u2122', '\u0161', '\u203a', '\u0153', '\u017e', '\u0178'
];
function consumeCharacterReferenceFurtherInvalidNumber(num) {
  return ((num >= 0x1 && num <= 0x8) || (num >= 0xd && num <= 0x1f) || (num >= 0x7f && num <= 0x9f) || (num >= 0xfdd0 && num <= 0xfdef)
      || num === 0xb || num === 0xfffe || num === 0xffff || num === 0x1fffe || num === 0x1ffff || num === 0x2fffe || num === 0x2ffff || num === 0x3fffe || num === 0x3ffff || num === 0x4fffe || num === 0x4ffff || num === 0x5fffe || num === 0x5ffff || num === 0x6fffe || num === 0x6ffff || num === 0x7fffe || num === 0x7ffff || num === 0x8fffe || num === 0x8ffff || num === 0x9fffe || num === 0x9ffff || num === 0xafffe || num === 0xaffff || num === 0xbfffe || num === 0xbffff || num === 0xcfffe || num === 0xcffff || num === 0xdfffe || num === 0xdffff || num === 0xefffe || num === 0xeffff || num === 0xffffe || num === 0xfffff || num === 0x10fffe || num === 0x10ffff);
}
// <http://www.whatwg.org/specs/web-apps/current-work/multipage/entities.json>
var consumeCharacterReferenceTable = { "&Aacute;": { "codepoints": [193], "characters": "\u00C1" }, "&Aacute": { "codepoints": [193], "characters": "\u00C1" }, "&aacute;": { "codepoints": [225], "characters": "\u00E1" }, "&aacute": { "codepoints": [225], "characters": "\u00E1" }, "&Abreve;": { "codepoints": [258], "characters": "\u0102" }, "&abreve;": { "codepoints": [259], "characters": "\u0103" }, "&ac;": { "codepoints": [8766], "characters": "\u223E" }, "&acd;": { "codepoints": [8767], "characters": "\u223F" }, "&acE;": { "codepoints": [8766, 819], "characters": "\u223E\u0333" }, "&Acirc;": { "codepoints": [194], "characters": "\u00C2" }, "&Acirc": { "codepoints": [194], "characters": "\u00C2" }, "&acirc;": { "codepoints": [226], "characters": "\u00E2" }, "&acirc": { "codepoints": [226], "characters": "\u00E2" }, "&acute;": { "codepoints": [180], "characters": "\u00B4" }, "&acute": { "codepoints": [180], "characters": "\u00B4" }, "&Acy;": { "codepoints": [1040], "characters": "\u0410" }, "&acy;": { "codepoints": [1072], "characters": "\u0430" }, "&AElig;": { "codepoints": [198], "characters": "\u00C6" }, "&AElig": { "codepoints": [198], "characters": "\u00C6" }, "&aelig;": { "codepoints": [230], "characters": "\u00E6" }, "&aelig": { "codepoints": [230], "characters": "\u00E6" }, "&af;": { "codepoints": [8289], "characters": "\u2061" }, "&Afr;": { "codepoints": [120068], "characters": "\uD835\uDD04" }, "&afr;": { "codepoints": [120094], "characters": "\uD835\uDD1E" }, "&Agrave;": { "codepoints": [192], "characters": "\u00C0" }, "&Agrave": { "codepoints": [192], "characters": "\u00C0" }, "&agrave;": { "codepoints": [224], "characters": "\u00E0" }, "&agrave": { "codepoints": [224], "characters": "\u00E0" }, "&alefsym;": { "codepoints": [8501], "characters": "\u2135" }, "&aleph;": { "codepoints": [8501], "characters": "\u2135" }, "&Alpha;": { "codepoints": [913], "characters": "\u0391" }, "&alpha;": { "codepoints": [945], "characters": "\u03B1" }, "&Amacr;": { "codepoints": [256], "characters": "\u0100" }, "&amacr;": { "codepoints": [257], "characters": "\u0101" }, "&amalg;": { "codepoints": [10815], "characters": "\u2A3F" }, "&amp;": { "codepoints": [38], "characters": "\u0026" }, "&amp": { "codepoints": [38], "characters": "\u0026" }, "&AMP;": { "codepoints": [38], "characters": "\u0026" }, "&AMP": { "codepoints": [38], "characters": "\u0026" }, "&andand;": { "codepoints": [10837], "characters": "\u2A55" }, "&And;": { "codepoints": [10835], "characters": "\u2A53" }, "&and;": { "codepoints": [8743], "characters": "\u2227" }, "&andd;": { "codepoints": [10844], "characters": "\u2A5C" }, "&andslope;": { "codepoints": [10840], "characters": "\u2A58" }, "&andv;": { "codepoints": [10842], "characters": "\u2A5A" }, "&ang;": { "codepoints": [8736], "characters": "\u2220" }, "&ange;": { "codepoints": [10660], "characters": "\u29A4" }, "&angle;": { "codepoints": [8736], "characters": "\u2220" }, "&angmsdaa;": { "codepoints": [10664], "characters": "\u29A8" }, "&angmsdab;": { "codepoints": [10665], "characters": "\u29A9" }, "&angmsdac;": { "codepoints": [10666], "characters": "\u29AA" }, "&angmsdad;": { "codepoints": [10667], "characters": "\u29AB" }, "&angmsdae;": { "codepoints": [10668], "characters": "\u29AC" }, "&angmsdaf;": { "codepoints": [10669], "characters": "\u29AD" }, "&angmsdag;": { "codepoints": [10670], "characters": "\u29AE" }, "&angmsdah;": { "codepoints": [10671], "characters": "\u29AF" }, "&angmsd;": { "codepoints": [8737], "characters": "\u2221" }, "&angrt;": { "codepoints": [8735], "characters": "\u221F" }, "&angrtvb;": { "codepoints": [8894], "characters": "\u22BE" }, "&angrtvbd;": { "codepoints": [10653], "characters": "\u299D" }, "&angsph;": { "codepoints": [8738], "characters": "\u2222" }, "&angst;": { "codepoints": [197], "characters": "\u00C5" }, "&angzarr;": { "codepoints": [9084], "characters": "\u237C" }, "&Aogon;": { "codepoints": [260], "characters": "\u0104" }, "&aogon;": { "codepoints": [261], "characters": "\u0105" }, "&Aopf;": { "codepoints": [120120], "characters": "\uD835\uDD38" }, "&aopf;": { "codepoints": [120146], "characters": "\uD835\uDD52" }, "&apacir;": { "codepoints": [10863], "characters": "\u2A6F" }, "&ap;": { "codepoints": [8776], "characters": "\u2248" }, "&apE;": { "codepoints": [10864], "characters": "\u2A70" }, "&ape;": { "codepoints": [8778], "characters": "\u224A" }, "&apid;": { "codepoints": [8779], "characters": "\u224B" }, "&apos;": { "codepoints": [39], "characters": "\u0027" }, "&ApplyFunction;": { "codepoints": [8289], "characters": "\u2061" }, "&approx;": { "codepoints": [8776], "characters": "\u2248" }, "&approxeq;": { "codepoints": [8778], "characters": "\u224A" }, "&Aring;": { "codepoints": [197], "characters": "\u00C5" }, "&Aring": { "codepoints": [197], "characters": "\u00C5" }, "&aring;": { "codepoints": [229], "characters": "\u00E5" }, "&aring": { "codepoints": [229], "characters": "\u00E5" }, "&Ascr;": { "codepoints": [119964], "characters": "\uD835\uDC9C" }, "&ascr;": { "codepoints": [119990], "characters": "\uD835\uDCB6" }, "&Assign;": { "codepoints": [8788], "characters": "\u2254" }, "&ast;": { "codepoints": [42], "characters": "\u002A" }, "&asymp;": { "codepoints": [8776], "characters": "\u2248" }, "&asympeq;": { "codepoints": [8781], "characters": "\u224D" }, "&Atilde;": { "codepoints": [195], "characters": "\u00C3" }, "&Atilde": { "codepoints": [195], "characters": "\u00C3" }, "&atilde;": { "codepoints": [227], "characters": "\u00E3" }, "&atilde": { "codepoints": [227], "characters": "\u00E3" }, "&Auml;": { "codepoints": [196], "characters": "\u00C4" }, "&Auml": { "codepoints": [196], "characters": "\u00C4" }, "&auml;": { "codepoints": [228], "characters": "\u00E4" }, "&auml": { "codepoints": [228], "characters": "\u00E4" }, "&awconint;": { "codepoints": [8755], "characters": "\u2233" }, "&awint;": { "codepoints": [10769], "characters": "\u2A11" }, "&backcong;": { "codepoints": [8780], "characters": "\u224C" }, "&backepsilon;": { "codepoints": [1014], "characters": "\u03F6" }, "&backprime;": { "codepoints": [8245], "characters": "\u2035" }, "&backsim;": { "codepoints": [8765], "characters": "\u223D" }, "&backsimeq;": { "codepoints": [8909], "characters": "\u22CD" }, "&Backslash;": { "codepoints": [8726], "characters": "\u2216" }, "&Barv;": { "codepoints": [10983], "characters": "\u2AE7" }, "&barvee;": { "codepoints": [8893], "characters": "\u22BD" }, "&barwed;": { "codepoints": [8965], "characters": "\u2305" }, "&Barwed;": { "codepoints": [8966], "characters": "\u2306" }, "&barwedge;": { "codepoints": [8965], "characters": "\u2305" }, "&bbrk;": { "codepoints": [9141], "characters": "\u23B5" }, "&bbrktbrk;": { "codepoints": [9142], "characters": "\u23B6" }, "&bcong;": { "codepoints": [8780], "characters": "\u224C" }, "&Bcy;": { "codepoints": [1041], "characters": "\u0411" }, "&bcy;": { "codepoints": [1073], "characters": "\u0431" }, "&bdquo;": { "codepoints": [8222], "characters": "\u201E" }, "&becaus;": { "codepoints": [8757], "characters": "\u2235" }, "&because;": { "codepoints": [8757], "characters": "\u2235" }, "&Because;": { "codepoints": [8757], "characters": "\u2235" }, "&bemptyv;": { "codepoints": [10672], "characters": "\u29B0" }, "&bepsi;": { "codepoints": [1014], "characters": "\u03F6" }, "&bernou;": { "codepoints": [8492], "characters": "\u212C" }, "&Bernoullis;": { "codepoints": [8492], "characters": "\u212C" }, "&Beta;": { "codepoints": [914], "characters": "\u0392" }, "&beta;": { "codepoints": [946], "characters": "\u03B2" }, "&beth;": { "codepoints": [8502], "characters": "\u2136" }, "&between;": { "codepoints": [8812], "characters": "\u226C" }, "&Bfr;": { "codepoints": [120069], "characters": "\uD835\uDD05" }, "&bfr;": { "codepoints": [120095], "characters": "\uD835\uDD1F" }, "&bigcap;": { "codepoints": [8898], "characters": "\u22C2" }, "&bigcirc;": { "codepoints": [9711], "characters": "\u25EF" }, "&bigcup;": { "codepoints": [8899], "characters": "\u22C3" }, "&bigodot;": { "codepoints": [10752], "characters": "\u2A00" }, "&bigoplus;": { "codepoints": [10753], "characters": "\u2A01" }, "&bigotimes;": { "codepoints": [10754], "characters": "\u2A02" }, "&bigsqcup;": { "codepoints": [10758], "characters": "\u2A06" }, "&bigstar;": { "codepoints": [9733], "characters": "\u2605" }, "&bigtriangledown;": { "codepoints": [9661], "characters": "\u25BD" }, "&bigtriangleup;": { "codepoints": [9651], "characters": "\u25B3" }, "&biguplus;": { "codepoints": [10756], "characters": "\u2A04" }, "&bigvee;": { "codepoints": [8897], "characters": "\u22C1" }, "&bigwedge;": { "codepoints": [8896], "characters": "\u22C0" }, "&bkarow;": { "codepoints": [10509], "characters": "\u290D" }, "&blacklozenge;": { "codepoints": [10731], "characters": "\u29EB" }, "&blacksquare;": { "codepoints": [9642], "characters": "\u25AA" }, "&blacktriangle;": { "codepoints": [9652], "characters": "\u25B4" }, "&blacktriangledown;": { "codepoints": [9662], "characters": "\u25BE" }, "&blacktriangleleft;": { "codepoints": [9666], "characters": "\u25C2" }, "&blacktriangleright;": { "codepoints": [9656], "characters": "\u25B8" }, "&blank;": { "codepoints": [9251], "characters": "\u2423" }, "&blk12;": { "codepoints": [9618], "characters": "\u2592" }, "&blk14;": { "codepoints": [9617], "characters": "\u2591" }, "&blk34;": { "codepoints": [9619], "characters": "\u2593" }, "&block;": { "codepoints": [9608], "characters": "\u2588" }, "&bne;": { "codepoints": [61, 8421], "characters": "\u003D\u20E5" }, "&bnequiv;": { "codepoints": [8801, 8421], "characters": "\u2261\u20E5" }, "&bNot;": { "codepoints": [10989], "characters": "\u2AED" }, "&bnot;": { "codepoints": [8976], "characters": "\u2310" }, "&Bopf;": { "codepoints": [120121], "characters": "\uD835\uDD39" }, "&bopf;": { "codepoints": [120147], "characters": "\uD835\uDD53" }, "&bot;": { "codepoints": [8869], "characters": "\u22A5" }, "&bottom;": { "codepoints": [8869], "characters": "\u22A5" }, "&bowtie;": { "codepoints": [8904], "characters": "\u22C8" }, "&boxbox;": { "codepoints": [10697], "characters": "\u29C9" }, "&boxdl;": { "codepoints": [9488], "characters": "\u2510" }, "&boxdL;": { "codepoints": [9557], "characters": "\u2555" }, "&boxDl;": { "codepoints": [9558], "characters": "\u2556" }, "&boxDL;": { "codepoints": [9559], "characters": "\u2557" }, "&boxdr;": { "codepoints": [9484], "characters": "\u250C" }, "&boxdR;": { "codepoints": [9554], "characters": "\u2552" }, "&boxDr;": { "codepoints": [9555], "characters": "\u2553" }, "&boxDR;": { "codepoints": [9556], "characters": "\u2554" }, "&boxh;": { "codepoints": [9472], "characters": "\u2500" }, "&boxH;": { "codepoints": [9552], "characters": "\u2550" }, "&boxhd;": { "codepoints": [9516], "characters": "\u252C" }, "&boxHd;": { "codepoints": [9572], "characters": "\u2564" }, "&boxhD;": { "codepoints": [9573], "characters": "\u2565" }, "&boxHD;": { "codepoints": [9574], "characters": "\u2566" }, "&boxhu;": { "codepoints": [9524], "characters": "\u2534" }, "&boxHu;": { "codepoints": [9575], "characters": "\u2567" }, "&boxhU;": { "codepoints": [9576], "characters": "\u2568" }, "&boxHU;": { "codepoints": [9577], "characters": "\u2569" }, "&boxminus;": { "codepoints": [8863], "characters": "\u229F" }, "&boxplus;": { "codepoints": [8862], "characters": "\u229E" }, "&boxtimes;": { "codepoints": [8864], "characters": "\u22A0" }, "&boxul;": { "codepoints": [9496], "characters": "\u2518" }, "&boxuL;": { "codepoints": [9563], "characters": "\u255B" }, "&boxUl;": { "codepoints": [9564], "characters": "\u255C" }, "&boxUL;": { "codepoints": [9565], "characters": "\u255D" }, "&boxur;": { "codepoints": [9492], "characters": "\u2514" }, "&boxuR;": { "codepoints": [9560], "characters": "\u2558" }, "&boxUr;": { "codepoints": [9561], "characters": "\u2559" }, "&boxUR;": { "codepoints": [9562], "characters": "\u255A" }, "&boxv;": { "codepoints": [9474], "characters": "\u2502" }, "&boxV;": { "codepoints": [9553], "characters": "\u2551" }, "&boxvh;": { "codepoints": [9532], "characters": "\u253C" }, "&boxvH;": { "codepoints": [9578], "characters": "\u256A" }, "&boxVh;": { "codepoints": [9579], "characters": "\u256B" }, "&boxVH;": { "codepoints": [9580], "characters": "\u256C" }, "&boxvl;": { "codepoints": [9508], "characters": "\u2524" }, "&boxvL;": { "codepoints": [9569], "characters": "\u2561" }, "&boxVl;": { "codepoints": [9570], "characters": "\u2562" }, "&boxVL;": { "codepoints": [9571], "characters": "\u2563" }, "&boxvr;": { "codepoints": [9500], "characters": "\u251C" }, "&boxvR;": { "codepoints": [9566], "characters": "\u255E" }, "&boxVr;": { "codepoints": [9567], "characters": "\u255F" }, "&boxVR;": { "codepoints": [9568], "characters": "\u2560" }, "&bprime;": { "codepoints": [8245], "characters": "\u2035" }, "&breve;": { "codepoints": [728], "characters": "\u02D8" }, "&Breve;": { "codepoints": [728], "characters": "\u02D8" }, "&brvbar;": { "codepoints": [166], "characters": "\u00A6" }, "&brvbar": { "codepoints": [166], "characters": "\u00A6" }, "&bscr;": { "codepoints": [119991], "characters": "\uD835\uDCB7" }, "&Bscr;": { "codepoints": [8492], "characters": "\u212C" }, "&bsemi;": { "codepoints": [8271], "characters": "\u204F" }, "&bsim;": { "codepoints": [8765], "characters": "\u223D" }, "&bsime;": { "codepoints": [8909], "characters": "\u22CD" }, "&bsolb;": { "codepoints": [10693], "characters": "\u29C5" }, "&bsol;": { "codepoints": [92], "characters": "\u005C" }, "&bsolhsub;": { "codepoints": [10184], "characters": "\u27C8" }, "&bull;": { "codepoints": [8226], "characters": "\u2022" }, "&bullet;": { "codepoints": [8226], "characters": "\u2022" }, "&bump;": { "codepoints": [8782], "characters": "\u224E" }, "&bumpE;": { "codepoints": [10926], "characters": "\u2AAE" }, "&bumpe;": { "codepoints": [8783], "characters": "\u224F" }, "&Bumpeq;": { "codepoints": [8782], "characters": "\u224E" }, "&bumpeq;": { "codepoints": [8783], "characters": "\u224F" }, "&Cacute;": { "codepoints": [262], "characters": "\u0106" }, "&cacute;": { "codepoints": [263], "characters": "\u0107" }, "&capand;": { "codepoints": [10820], "characters": "\u2A44" }, "&capbrcup;": { "codepoints": [10825], "characters": "\u2A49" }, "&capcap;": { "codepoints": [10827], "characters": "\u2A4B" }, "&cap;": { "codepoints": [8745], "characters": "\u2229" }, "&Cap;": { "codepoints": [8914], "characters": "\u22D2" }, "&capcup;": { "codepoints": [10823], "characters": "\u2A47" }, "&capdot;": { "codepoints": [10816], "characters": "\u2A40" }, "&CapitalDifferentialD;": { "codepoints": [8517], "characters": "\u2145" }, "&caps;": { "codepoints": [8745, 65024], "characters": "\u2229\uFE00" }, "&caret;": { "codepoints": [8257], "characters": "\u2041" }, "&caron;": { "codepoints": [711], "characters": "\u02C7" }, "&Cayleys;": { "codepoints": [8493], "characters": "\u212D" }, "&ccaps;": { "codepoints": [10829], "characters": "\u2A4D" }, "&Ccaron;": { "codepoints": [268], "characters": "\u010C" }, "&ccaron;": { "codepoints": [269], "characters": "\u010D" }, "&Ccedil;": { "codepoints": [199], "characters": "\u00C7" }, "&Ccedil": { "codepoints": [199], "characters": "\u00C7" }, "&ccedil;": { "codepoints": [231], "characters": "\u00E7" }, "&ccedil": { "codepoints": [231], "characters": "\u00E7" }, "&Ccirc;": { "codepoints": [264], "characters": "\u0108" }, "&ccirc;": { "codepoints": [265], "characters": "\u0109" }, "&Cconint;": { "codepoints": [8752], "characters": "\u2230" }, "&ccups;": { "codepoints": [10828], "characters": "\u2A4C" }, "&ccupssm;": { "codepoints": [10832], "characters": "\u2A50" }, "&Cdot;": { "codepoints": [266], "characters": "\u010A" }, "&cdot;": { "codepoints": [267], "characters": "\u010B" }, "&cedil;": { "codepoints": [184], "characters": "\u00B8" }, "&cedil": { "codepoints": [184], "characters": "\u00B8" }, "&Cedilla;": { "codepoints": [184], "characters": "\u00B8" }, "&cemptyv;": { "codepoints": [10674], "characters": "\u29B2" }, "&cent;": { "codepoints": [162], "characters": "\u00A2" }, "&cent": { "codepoints": [162], "characters": "\u00A2" }, "&centerdot;": { "codepoints": [183], "characters": "\u00B7" }, "&CenterDot;": { "codepoints": [183], "characters": "\u00B7" }, "&cfr;": { "codepoints": [120096], "characters": "\uD835\uDD20" }, "&Cfr;": { "codepoints": [8493], "characters": "\u212D" }, "&CHcy;": { "codepoints": [1063], "characters": "\u0427" }, "&chcy;": { "codepoints": [1095], "characters": "\u0447" }, "&check;": { "codepoints": [10003], "characters": "\u2713" }, "&checkmark;": { "codepoints": [10003], "characters": "\u2713" }, "&Chi;": { "codepoints": [935], "characters": "\u03A7" }, "&chi;": { "codepoints": [967], "characters": "\u03C7" }, "&circ;": { "codepoints": [710], "characters": "\u02C6" }, "&circeq;": { "codepoints": [8791], "characters": "\u2257" }, "&circlearrowleft;": { "codepoints": [8634], "characters": "\u21BA" }, "&circlearrowright;": { "codepoints": [8635], "characters": "\u21BB" }, "&circledast;": { "codepoints": [8859], "characters": "\u229B" }, "&circledcirc;": { "codepoints": [8858], "characters": "\u229A" }, "&circleddash;": { "codepoints": [8861], "characters": "\u229D" }, "&CircleDot;": { "codepoints": [8857], "characters": "\u2299" }, "&circledR;": { "codepoints": [174], "characters": "\u00AE" }, "&circledS;": { "codepoints": [9416], "characters": "\u24C8" }, "&CircleMinus;": { "codepoints": [8854], "characters": "\u2296" }, "&CirclePlus;": { "codepoints": [8853], "characters": "\u2295" }, "&CircleTimes;": { "codepoints": [8855], "characters": "\u2297" }, "&cir;": { "codepoints": [9675], "characters": "\u25CB" }, "&cirE;": { "codepoints": [10691], "characters": "\u29C3" }, "&cire;": { "codepoints": [8791], "characters": "\u2257" }, "&cirfnint;": { "codepoints": [10768], "characters": "\u2A10" }, "&cirmid;": { "codepoints": [10991], "characters": "\u2AEF" }, "&cirscir;": { "codepoints": [10690], "characters": "\u29C2" }, "&ClockwiseContourIntegral;": { "codepoints": [8754], "characters": "\u2232" }, "&CloseCurlyDoubleQuote;": { "codepoints": [8221], "characters": "\u201D" }, "&CloseCurlyQuote;": { "codepoints": [8217], "characters": "\u2019" }, "&clubs;": { "codepoints": [9827], "characters": "\u2663" }, "&clubsuit;": { "codepoints": [9827], "characters": "\u2663" }, "&colon;": { "codepoints": [58], "characters": "\u003A" }, "&Colon;": { "codepoints": [8759], "characters": "\u2237" }, "&Colone;": { "codepoints": [10868], "characters": "\u2A74" }, "&colone;": { "codepoints": [8788], "characters": "\u2254" }, "&coloneq;": { "codepoints": [8788], "characters": "\u2254" }, "&comma;": { "codepoints": [44], "characters": "\u002C" }, "&commat;": { "codepoints": [64], "characters": "\u0040" }, "&comp;": { "codepoints": [8705], "characters": "\u2201" }, "&compfn;": { "codepoints": [8728], "characters": "\u2218" }, "&complement;": { "codepoints": [8705], "characters": "\u2201" }, "&complexes;": { "codepoints": [8450], "characters": "\u2102" }, "&cong;": { "codepoints": [8773], "characters": "\u2245" }, "&congdot;": { "codepoints": [10861], "characters": "\u2A6D" }, "&Congruent;": { "codepoints": [8801], "characters": "\u2261" }, "&conint;": { "codepoints": [8750], "characters": "\u222E" }, "&Conint;": { "codepoints": [8751], "characters": "\u222F" }, "&ContourIntegral;": { "codepoints": [8750], "characters": "\u222E" }, "&copf;": { "codepoints": [120148], "characters": "\uD835\uDD54" }, "&Copf;": { "codepoints": [8450], "characters": "\u2102" }, "&coprod;": { "codepoints": [8720], "characters": "\u2210" }, "&Coproduct;": { "codepoints": [8720], "characters": "\u2210" }, "&copy;": { "codepoints": [169], "characters": "\u00A9" }, "&copy": { "codepoints": [169], "characters": "\u00A9" }, "&COPY;": { "codepoints": [169], "characters": "\u00A9" }, "&COPY": { "codepoints": [169], "characters": "\u00A9" }, "&copysr;": { "codepoints": [8471], "characters": "\u2117" }, "&CounterClockwiseContourIntegral;": { "codepoints": [8755], "characters": "\u2233" }, "&crarr;": { "codepoints": [8629], "characters": "\u21B5" }, "&cross;": { "codepoints": [10007], "characters": "\u2717" }, "&Cross;": { "codepoints": [10799], "characters": "\u2A2F" }, "&Cscr;": { "codepoints": [119966], "characters": "\uD835\uDC9E" }, "&cscr;": { "codepoints": [119992], "characters": "\uD835\uDCB8" }, "&csub;": { "codepoints": [10959], "characters": "\u2ACF" }, "&csube;": { "codepoints": [10961], "characters": "\u2AD1" }, "&csup;": { "codepoints": [10960], "characters": "\u2AD0" }, "&csupe;": { "codepoints": [10962], "characters": "\u2AD2" }, "&ctdot;": { "codepoints": [8943], "characters": "\u22EF" }, "&cudarrl;": { "codepoints": [10552], "characters": "\u2938" }, "&cudarrr;": { "codepoints": [10549], "characters": "\u2935" }, "&cuepr;": { "codepoints": [8926], "characters": "\u22DE" }, "&cuesc;": { "codepoints": [8927], "characters": "\u22DF" }, "&cularr;": { "codepoints": [8630], "characters": "\u21B6" }, "&cularrp;": { "codepoints": [10557], "characters": "\u293D" }, "&cupbrcap;": { "codepoints": [10824], "characters": "\u2A48" }, "&cupcap;": { "codepoints": [10822], "characters": "\u2A46" }, "&CupCap;": { "codepoints": [8781], "characters": "\u224D" }, "&cup;": { "codepoints": [8746], "characters": "\u222A" }, "&Cup;": { "codepoints": [8915], "characters": "\u22D3" }, "&cupcup;": { "codepoints": [10826], "characters": "\u2A4A" }, "&cupdot;": { "codepoints": [8845], "characters": "\u228D" }, "&cupor;": { "codepoints": [10821], "characters": "\u2A45" }, "&cups;": { "codepoints": [8746, 65024], "characters": "\u222A\uFE00" }, "&curarr;": { "codepoints": [8631], "characters": "\u21B7" }, "&curarrm;": { "codepoints": [10556], "characters": "\u293C" }, "&curlyeqprec;": { "codepoints": [8926], "characters": "\u22DE" }, "&curlyeqsucc;": { "codepoints": [8927], "characters": "\u22DF" }, "&curlyvee;": { "codepoints": [8910], "characters": "\u22CE" }, "&curlywedge;": { "codepoints": [8911], "characters": "\u22CF" }, "&curren;": { "codepoints": [164], "characters": "\u00A4" }, "&curren": { "codepoints": [164], "characters": "\u00A4" }, "&curvearrowleft;": { "codepoints": [8630], "characters": "\u21B6" }, "&curvearrowright;": { "codepoints": [8631], "characters": "\u21B7" }, "&cuvee;": { "codepoints": [8910], "characters": "\u22CE" }, "&cuwed;": { "codepoints": [8911], "characters": "\u22CF" }, "&cwconint;": { "codepoints": [8754], "characters": "\u2232" }, "&cwint;": { "codepoints": [8753], "characters": "\u2231" }, "&cylcty;": { "codepoints": [9005], "characters": "\u232D" }, "&dagger;": { "codepoints": [8224], "characters": "\u2020" }, "&Dagger;": { "codepoints": [8225], "characters": "\u2021" }, "&daleth;": { "codepoints": [8504], "characters": "\u2138" }, "&darr;": { "codepoints": [8595], "characters": "\u2193" }, "&Darr;": { "codepoints": [8609], "characters": "\u21A1" }, "&dArr;": { "codepoints": [8659], "characters": "\u21D3" }, "&dash;": { "codepoints": [8208], "characters": "\u2010" }, "&Dashv;": { "codepoints": [10980], "characters": "\u2AE4" }, "&dashv;": { "codepoints": [8867], "characters": "\u22A3" }, "&dbkarow;": { "codepoints": [10511], "characters": "\u290F" }, "&dblac;": { "codepoints": [733], "characters": "\u02DD" }, "&Dcaron;": { "codepoints": [270], "characters": "\u010E" }, "&dcaron;": { "codepoints": [271], "characters": "\u010F" }, "&Dcy;": { "codepoints": [1044], "characters": "\u0414" }, "&dcy;": { "codepoints": [1076], "characters": "\u0434" }, "&ddagger;": { "codepoints": [8225], "characters": "\u2021" }, "&ddarr;": { "codepoints": [8650], "characters": "\u21CA" }, "&DD;": { "codepoints": [8517], "characters": "\u2145" }, "&dd;": { "codepoints": [8518], "characters": "\u2146" }, "&DDotrahd;": { "codepoints": [10513], "characters": "\u2911" }, "&ddotseq;": { "codepoints": [10871], "characters": "\u2A77" }, "&deg;": { "codepoints": [176], "characters": "\u00B0" }, "&deg": { "codepoints": [176], "characters": "\u00B0" }, "&Del;": { "codepoints": [8711], "characters": "\u2207" }, "&Delta;": { "codepoints": [916], "characters": "\u0394" }, "&delta;": { "codepoints": [948], "characters": "\u03B4" }, "&demptyv;": { "codepoints": [10673], "characters": "\u29B1" }, "&dfisht;": { "codepoints": [10623], "characters": "\u297F" }, "&Dfr;": { "codepoints": [120071], "characters": "\uD835\uDD07" }, "&dfr;": { "codepoints": [120097], "characters": "\uD835\uDD21" }, "&dHar;": { "codepoints": [10597], "characters": "\u2965" }, "&dharl;": { "codepoints": [8643], "characters": "\u21C3" }, "&dharr;": { "codepoints": [8642], "characters": "\u21C2" }, "&DiacriticalAcute;": { "codepoints": [180], "characters": "\u00B4" }, "&DiacriticalDot;": { "codepoints": [729], "characters": "\u02D9" }, "&DiacriticalDoubleAcute;": { "codepoints": [733], "characters": "\u02DD" }, "&DiacriticalGrave;": { "codepoints": [96], "characters": "\u0060" }, "&DiacriticalTilde;": { "codepoints": [732], "characters": "\u02DC" }, "&diam;": { "codepoints": [8900], "characters": "\u22C4" }, "&diamond;": { "codepoints": [8900], "characters": "\u22C4" }, "&Diamond;": { "codepoints": [8900], "characters": "\u22C4" }, "&diamondsuit;": { "codepoints": [9830], "characters": "\u2666" }, "&diams;": { "codepoints": [9830], "characters": "\u2666" }, "&die;": { "codepoints": [168], "characters": "\u00A8" }, "&DifferentialD;": { "codepoints": [8518], "characters": "\u2146" }, "&digamma;": { "codepoints": [989], "characters": "\u03DD" }, "&disin;": { "codepoints": [8946], "characters": "\u22F2" }, "&div;": { "codepoints": [247], "characters": "\u00F7" }, "&divide;": { "codepoints": [247], "characters": "\u00F7" }, "&divide": { "codepoints": [247], "characters": "\u00F7" }, "&divideontimes;": { "codepoints": [8903], "characters": "\u22C7" }, "&divonx;": { "codepoints": [8903], "characters": "\u22C7" }, "&DJcy;": { "codepoints": [1026], "characters": "\u0402" }, "&djcy;": { "codepoints": [1106], "characters": "\u0452" }, "&dlcorn;": { "codepoints": [8990], "characters": "\u231E" }, "&dlcrop;": { "codepoints": [8973], "characters": "\u230D" }, "&dollar;": { "codepoints": [36], "characters": "\u0024" }, "&Dopf;": { "codepoints": [120123], "characters": "\uD835\uDD3B" }, "&dopf;": { "codepoints": [120149], "characters": "\uD835\uDD55" }, "&Dot;": { "codepoints": [168], "characters": "\u00A8" }, "&dot;": { "codepoints": [729], "characters": "\u02D9" }, "&DotDot;": { "codepoints": [8412], "characters": "\u20DC" }, "&doteq;": { "codepoints": [8784], "characters": "\u2250" }, "&doteqdot;": { "codepoints": [8785], "characters": "\u2251" }, "&DotEqual;": { "codepoints": [8784], "characters": "\u2250" }, "&dotminus;": { "codepoints": [8760], "characters": "\u2238" }, "&dotplus;": { "codepoints": [8724], "characters": "\u2214" }, "&dotsquare;": { "codepoints": [8865], "characters": "\u22A1" }, "&doublebarwedge;": { "codepoints": [8966], "characters": "\u2306" }, "&DoubleContourIntegral;": { "codepoints": [8751], "characters": "\u222F" }, "&DoubleDot;": { "codepoints": [168], "characters": "\u00A8" }, "&DoubleDownArrow;": { "codepoints": [8659], "characters": "\u21D3" }, "&DoubleLeftArrow;": { "codepoints": [8656], "characters": "\u21D0" }, "&DoubleLeftRightArrow;": { "codepoints": [8660], "characters": "\u21D4" }, "&DoubleLeftTee;": { "codepoints": [10980], "characters": "\u2AE4" }, "&DoubleLongLeftArrow;": { "codepoints": [10232], "characters": "\u27F8" }, "&DoubleLongLeftRightArrow;": { "codepoints": [10234], "characters": "\u27FA" }, "&DoubleLongRightArrow;": { "codepoints": [10233], "characters": "\u27F9" }, "&DoubleRightArrow;": { "codepoints": [8658], "characters": "\u21D2" }, "&DoubleRightTee;": { "codepoints": [8872], "characters": "\u22A8" }, "&DoubleUpArrow;": { "codepoints": [8657], "characters": "\u21D1" }, "&DoubleUpDownArrow;": { "codepoints": [8661], "characters": "\u21D5" }, "&DoubleVerticalBar;": { "codepoints": [8741], "characters": "\u2225" }, "&DownArrowBar;": { "codepoints": [10515], "characters": "\u2913" }, "&downarrow;": { "codepoints": [8595], "characters": "\u2193" }, "&DownArrow;": { "codepoints": [8595], "characters": "\u2193" }, "&Downarrow;": { "codepoints": [8659], "characters": "\u21D3" }, "&DownArrowUpArrow;": { "codepoints": [8693], "characters": "\u21F5" }, "&DownBreve;": { "codepoints": [785], "characters": "\u0311" }, "&downdownarrows;": { "codepoints": [8650], "characters": "\u21CA" }, "&downharpoonleft;": { "codepoints": [8643], "characters": "\u21C3" }, "&downharpoonright;": { "codepoints": [8642], "characters": "\u21C2" }, "&DownLeftRightVector;": { "codepoints": [10576], "characters": "\u2950" }, "&DownLeftTeeVector;": { "codepoints": [10590], "characters": "\u295E" }, "&DownLeftVectorBar;": { "codepoints": [10582], "characters": "\u2956" }, "&DownLeftVector;": { "codepoints": [8637], "characters": "\u21BD" }, "&DownRightTeeVector;": { "codepoints": [10591], "characters": "\u295F" }, "&DownRightVectorBar;": { "codepoints": [10583], "characters": "\u2957" }, "&DownRightVector;": { "codepoints": [8641], "characters": "\u21C1" }, "&DownTeeArrow;": { "codepoints": [8615], "characters": "\u21A7" }, "&DownTee;": { "codepoints": [8868], "characters": "\u22A4" }, "&drbkarow;": { "codepoints": [10512], "characters": "\u2910" }, "&drcorn;": { "codepoints": [8991], "characters": "\u231F" }, "&drcrop;": { "codepoints": [8972], "characters": "\u230C" }, "&Dscr;": { "codepoints": [119967], "characters": "\uD835\uDC9F" }, "&dscr;": { "codepoints": [119993], "characters": "\uD835\uDCB9" }, "&DScy;": { "codepoints": [1029], "characters": "\u0405" }, "&dscy;": { "codepoints": [1109], "characters": "\u0455" }, "&dsol;": { "codepoints": [10742], "characters": "\u29F6" }, "&Dstrok;": { "codepoints": [272], "characters": "\u0110" }, "&dstrok;": { "codepoints": [273], "characters": "\u0111" }, "&dtdot;": { "codepoints": [8945], "characters": "\u22F1" }, "&dtri;": { "codepoints": [9663], "characters": "\u25BF" }, "&dtrif;": { "codepoints": [9662], "characters": "\u25BE" }, "&duarr;": { "codepoints": [8693], "characters": "\u21F5" }, "&duhar;": { "codepoints": [10607], "characters": "\u296F" }, "&dwangle;": { "codepoints": [10662], "characters": "\u29A6" }, "&DZcy;": { "codepoints": [1039], "characters": "\u040F" }, "&dzcy;": { "codepoints": [1119], "characters": "\u045F" }, "&dzigrarr;": { "codepoints": [10239], "characters": "\u27FF" }, "&Eacute;": { "codepoints": [201], "characters": "\u00C9" }, "&Eacute": { "codepoints": [201], "characters": "\u00C9" }, "&eacute;": { "codepoints": [233], "characters": "\u00E9" }, "&eacute": { "codepoints": [233], "characters": "\u00E9" }, "&easter;": { "codepoints": [10862], "characters": "\u2A6E" }, "&Ecaron;": { "codepoints": [282], "characters": "\u011A" }, "&ecaron;": { "codepoints": [283], "characters": "\u011B" }, "&Ecirc;": { "codepoints": [202], "characters": "\u00CA" }, "&Ecirc": { "codepoints": [202], "characters": "\u00CA" }, "&ecirc;": { "codepoints": [234], "characters": "\u00EA" }, "&ecirc": { "codepoints": [234], "characters": "\u00EA" }, "&ecir;": { "codepoints": [8790], "characters": "\u2256" }, "&ecolon;": { "codepoints": [8789], "characters": "\u2255" }, "&Ecy;": { "codepoints": [1069], "characters": "\u042D" }, "&ecy;": { "codepoints": [1101], "characters": "\u044D" }, "&eDDot;": { "codepoints": [10871], "characters": "\u2A77" }, "&Edot;": { "codepoints": [278], "characters": "\u0116" }, "&edot;": { "codepoints": [279], "characters": "\u0117" }, "&eDot;": { "codepoints": [8785], "characters": "\u2251" }, "&ee;": { "codepoints": [8519], "characters": "\u2147" }, "&efDot;": { "codepoints": [8786], "characters": "\u2252" }, "&Efr;": { "codepoints": [120072], "characters": "\uD835\uDD08" }, "&efr;": { "codepoints": [120098], "characters": "\uD835\uDD22" }, "&eg;": { "codepoints": [10906], "characters": "\u2A9A" }, "&Egrave;": { "codepoints": [200], "characters": "\u00C8" }, "&Egrave": { "codepoints": [200], "characters": "\u00C8" }, "&egrave;": { "codepoints": [232], "characters": "\u00E8" }, "&egrave": { "codepoints": [232], "characters": "\u00E8" }, "&egs;": { "codepoints": [10902], "characters": "\u2A96" }, "&egsdot;": { "codepoints": [10904], "characters": "\u2A98" }, "&el;": { "codepoints": [10905], "characters": "\u2A99" }, "&Element;": { "codepoints": [8712], "characters": "\u2208" }, "&elinters;": { "codepoints": [9191], "characters": "\u23E7" }, "&ell;": { "codepoints": [8467], "characters": "\u2113" }, "&els;": { "codepoints": [10901], "characters": "\u2A95" }, "&elsdot;": { "codepoints": [10903], "characters": "\u2A97" }, "&Emacr;": { "codepoints": [274], "characters": "\u0112" }, "&emacr;": { "codepoints": [275], "characters": "\u0113" }, "&empty;": { "codepoints": [8709], "characters": "\u2205" }, "&emptyset;": { "codepoints": [8709], "characters": "\u2205" }, "&EmptySmallSquare;": { "codepoints": [9723], "characters": "\u25FB" }, "&emptyv;": { "codepoints": [8709], "characters": "\u2205" }, "&EmptyVerySmallSquare;": { "codepoints": [9643], "characters": "\u25AB" }, "&emsp13;": { "codepoints": [8196], "characters": "\u2004" }, "&emsp14;": { "codepoints": [8197], "characters": "\u2005" }, "&emsp;": { "codepoints": [8195], "characters": "\u2003" }, "&ENG;": { "codepoints": [330], "characters": "\u014A" }, "&eng;": { "codepoints": [331], "characters": "\u014B" }, "&ensp;": { "codepoints": [8194], "characters": "\u2002" }, "&Eogon;": { "codepoints": [280], "characters": "\u0118" }, "&eogon;": { "codepoints": [281], "characters": "\u0119" }, "&Eopf;": { "codepoints": [120124], "characters": "\uD835\uDD3C" }, "&eopf;": { "codepoints": [120150], "characters": "\uD835\uDD56" }, "&epar;": { "codepoints": [8917], "characters": "\u22D5" }, "&eparsl;": { "codepoints": [10723], "characters": "\u29E3" }, "&eplus;": { "codepoints": [10865], "characters": "\u2A71" }, "&epsi;": { "codepoints": [949], "characters": "\u03B5" }, "&Epsilon;": { "codepoints": [917], "characters": "\u0395" }, "&epsilon;": { "codepoints": [949], "characters": "\u03B5" }, "&epsiv;": { "codepoints": [1013], "characters": "\u03F5" }, "&eqcirc;": { "codepoints": [8790], "characters": "\u2256" }, "&eqcolon;": { "codepoints": [8789], "characters": "\u2255" }, "&eqsim;": { "codepoints": [8770], "characters": "\u2242" }, "&eqslantgtr;": { "codepoints": [10902], "characters": "\u2A96" }, "&eqslantless;": { "codepoints": [10901], "characters": "\u2A95" }, "&Equal;": { "codepoints": [10869], "characters": "\u2A75" }, "&equals;": { "codepoints": [61], "characters": "\u003D" }, "&EqualTilde;": { "codepoints": [8770], "characters": "\u2242" }, "&equest;": { "codepoints": [8799], "characters": "\u225F" }, "&Equilibrium;": { "codepoints": [8652], "characters": "\u21CC" }, "&equiv;": { "codepoints": [8801], "characters": "\u2261" }, "&equivDD;": { "codepoints": [10872], "characters": "\u2A78" }, "&eqvparsl;": { "codepoints": [10725], "characters": "\u29E5" }, "&erarr;": { "codepoints": [10609], "characters": "\u2971" }, "&erDot;": { "codepoints": [8787], "characters": "\u2253" }, "&escr;": { "codepoints": [8495], "characters": "\u212F" }, "&Escr;": { "codepoints": [8496], "characters": "\u2130" }, "&esdot;": { "codepoints": [8784], "characters": "\u2250" }, "&Esim;": { "codepoints": [10867], "characters": "\u2A73" }, "&esim;": { "codepoints": [8770], "characters": "\u2242" }, "&Eta;": { "codepoints": [919], "characters": "\u0397" }, "&eta;": { "codepoints": [951], "characters": "\u03B7" }, "&ETH;": { "codepoints": [208], "characters": "\u00D0" }, "&ETH": { "codepoints": [208], "characters": "\u00D0" }, "&eth;": { "codepoints": [240], "characters": "\u00F0" }, "&eth": { "codepoints": [240], "characters": "\u00F0" }, "&Euml;": { "codepoints": [203], "characters": "\u00CB" }, "&Euml": { "codepoints": [203], "characters": "\u00CB" }, "&euml;": { "codepoints": [235], "characters": "\u00EB" }, "&euml": { "codepoints": [235], "characters": "\u00EB" }, "&euro;": { "codepoints": [8364], "characters": "\u20AC" }, "&excl;": { "codepoints": [33], "characters": "\u0021" }, "&exist;": { "codepoints": [8707], "characters": "\u2203" }, "&Exists;": { "codepoints": [8707], "characters": "\u2203" }, "&expectation;": { "codepoints": [8496], "characters": "\u2130" }, "&exponentiale;": { "codepoints": [8519], "characters": "\u2147" }, "&ExponentialE;": { "codepoints": [8519], "characters": "\u2147" }, "&fallingdotseq;": { "codepoints": [8786], "characters": "\u2252" }, "&Fcy;": { "codepoints": [1060], "characters": "\u0424" }, "&fcy;": { "codepoints": [1092], "characters": "\u0444" }, "&female;": { "codepoints": [9792], "characters": "\u2640" }, "&ffilig;": { "codepoints": [64259], "characters": "\uFB03" }, "&fflig;": { "codepoints": [64256], "characters": "\uFB00" }, "&ffllig;": { "codepoints": [64260], "characters": "\uFB04" }, "&Ffr;": { "codepoints": [120073], "characters": "\uD835\uDD09" }, "&ffr;": { "codepoints": [120099], "characters": "\uD835\uDD23" }, "&filig;": { "codepoints": [64257], "characters": "\uFB01" }, "&FilledSmallSquare;": { "codepoints": [9724], "characters": "\u25FC" }, "&FilledVerySmallSquare;": { "codepoints": [9642], "characters": "\u25AA" }, "&fjlig;": { "codepoints": [102, 106], "characters": "\u0066\u006A" }, "&flat;": { "codepoints": [9837], "characters": "\u266D" }, "&fllig;": { "codepoints": [64258], "characters": "\uFB02" }, "&fltns;": { "codepoints": [9649], "characters": "\u25B1" }, "&fnof;": { "codepoints": [402], "characters": "\u0192" }, "&Fopf;": { "codepoints": [120125], "characters": "\uD835\uDD3D" }, "&fopf;": { "codepoints": [120151], "characters": "\uD835\uDD57" }, "&forall;": { "codepoints": [8704], "characters": "\u2200" }, "&ForAll;": { "codepoints": [8704], "characters": "\u2200" }, "&fork;": { "codepoints": [8916], "characters": "\u22D4" }, "&forkv;": { "codepoints": [10969], "characters": "\u2AD9" }, "&Fouriertrf;": { "codepoints": [8497], "characters": "\u2131" }, "&fpartint;": { "codepoints": [10765], "characters": "\u2A0D" }, "&frac12;": { "codepoints": [189], "characters": "\u00BD" }, "&frac12": { "codepoints": [189], "characters": "\u00BD" }, "&frac13;": { "codepoints": [8531], "characters": "\u2153" }, "&frac14;": { "codepoints": [188], "characters": "\u00BC" }, "&frac14": { "codepoints": [188], "characters": "\u00BC" }, "&frac15;": { "codepoints": [8533], "characters": "\u2155" }, "&frac16;": { "codepoints": [8537], "characters": "\u2159" }, "&frac18;": { "codepoints": [8539], "characters": "\u215B" }, "&frac23;": { "codepoints": [8532], "characters": "\u2154" }, "&frac25;": { "codepoints": [8534], "characters": "\u2156" }, "&frac34;": { "codepoints": [190], "characters": "\u00BE" }, "&frac34": { "codepoints": [190], "characters": "\u00BE" }, "&frac35;": { "codepoints": [8535], "characters": "\u2157" }, "&frac38;": { "codepoints": [8540], "characters": "\u215C" }, "&frac45;": { "codepoints": [8536], "characters": "\u2158" }, "&frac56;": { "codepoints": [8538], "characters": "\u215A" }, "&frac58;": { "codepoints": [8541], "characters": "\u215D" }, "&frac78;": { "codepoints": [8542], "characters": "\u215E" }, "&frasl;": { "codepoints": [8260], "characters": "\u2044" }, "&frown;": { "codepoints": [8994], "characters": "\u2322" }, "&fscr;": { "codepoints": [119995], "characters": "\uD835\uDCBB" }, "&Fscr;": { "codepoints": [8497], "characters": "\u2131" }, "&gacute;": { "codepoints": [501], "characters": "\u01F5" }, "&Gamma;": { "codepoints": [915], "characters": "\u0393" }, "&gamma;": { "codepoints": [947], "characters": "\u03B3" }, "&Gammad;": { "codepoints": [988], "characters": "\u03DC" }, "&gammad;": { "codepoints": [989], "characters": "\u03DD" }, "&gap;": { "codepoints": [10886], "characters": "\u2A86" }, "&Gbreve;": { "codepoints": [286], "characters": "\u011E" }, "&gbreve;": { "codepoints": [287], "characters": "\u011F" }, "&Gcedil;": { "codepoints": [290], "characters": "\u0122" }, "&Gcirc;": { "codepoints": [284], "characters": "\u011C" }, "&gcirc;": { "codepoints": [285], "characters": "\u011D" }, "&Gcy;": { "codepoints": [1043], "characters": "\u0413" }, "&gcy;": { "codepoints": [1075], "characters": "\u0433" }, "&Gdot;": { "codepoints": [288], "characters": "\u0120" }, "&gdot;": { "codepoints": [289], "characters": "\u0121" }, "&ge;": { "codepoints": [8805], "characters": "\u2265" }, "&gE;": { "codepoints": [8807], "characters": "\u2267" }, "&gEl;": { "codepoints": [10892], "characters": "\u2A8C" }, "&gel;": { "codepoints": [8923], "characters": "\u22DB" }, "&geq;": { "codepoints": [8805], "characters": "\u2265" }, "&geqq;": { "codepoints": [8807], "characters": "\u2267" }, "&geqslant;": { "codepoints": [10878], "characters": "\u2A7E" }, "&gescc;": { "codepoints": [10921], "characters": "\u2AA9" }, "&ges;": { "codepoints": [10878], "characters": "\u2A7E" }, "&gesdot;": { "codepoints": [10880], "characters": "\u2A80" }, "&gesdoto;": { "codepoints": [10882], "characters": "\u2A82" }, "&gesdotol;": { "codepoints": [10884], "characters": "\u2A84" }, "&gesl;": { "codepoints": [8923, 65024], "characters": "\u22DB\uFE00" }, "&gesles;": { "codepoints": [10900], "characters": "\u2A94" }, "&Gfr;": { "codepoints": [120074], "characters": "\uD835\uDD0A" }, "&gfr;": { "codepoints": [120100], "characters": "\uD835\uDD24" }, "&gg;": { "codepoints": [8811], "characters": "\u226B" }, "&Gg;": { "codepoints": [8921], "characters": "\u22D9" }, "&ggg;": { "codepoints": [8921], "characters": "\u22D9" }, "&gimel;": { "codepoints": [8503], "characters": "\u2137" }, "&GJcy;": { "codepoints": [1027], "characters": "\u0403" }, "&gjcy;": { "codepoints": [1107], "characters": "\u0453" }, "&gla;": { "codepoints": [10917], "characters": "\u2AA5" }, "&gl;": { "codepoints": [8823], "characters": "\u2277" }, "&glE;": { "codepoints": [10898], "characters": "\u2A92" }, "&glj;": { "codepoints": [10916], "characters": "\u2AA4" }, "&gnap;": { "codepoints": [10890], "characters": "\u2A8A" }, "&gnapprox;": { "codepoints": [10890], "characters": "\u2A8A" }, "&gne;": { "codepoints": [10888], "characters": "\u2A88" }, "&gnE;": { "codepoints": [8809], "characters": "\u2269" }, "&gneq;": { "codepoints": [10888], "characters": "\u2A88" }, "&gneqq;": { "codepoints": [8809], "characters": "\u2269" }, "&gnsim;": { "codepoints": [8935], "characters": "\u22E7" }, "&Gopf;": { "codepoints": [120126], "characters": "\uD835\uDD3E" }, "&gopf;": { "codepoints": [120152], "characters": "\uD835\uDD58" }, "&grave;": { "codepoints": [96], "characters": "\u0060" }, "&GreaterEqual;": { "codepoints": [8805], "characters": "\u2265" }, "&GreaterEqualLess;": { "codepoints": [8923], "characters": "\u22DB" }, "&GreaterFullEqual;": { "codepoints": [8807], "characters": "\u2267" }, "&GreaterGreater;": { "codepoints": [10914], "characters": "\u2AA2" }, "&GreaterLess;": { "codepoints": [8823], "characters": "\u2277" }, "&GreaterSlantEqual;": { "codepoints": [10878], "characters": "\u2A7E" }, "&GreaterTilde;": { "codepoints": [8819], "characters": "\u2273" }, "&Gscr;": { "codepoints": [119970], "characters": "\uD835\uDCA2" }, "&gscr;": { "codepoints": [8458], "characters": "\u210A" }, "&gsim;": { "codepoints": [8819], "characters": "\u2273" }, "&gsime;": { "codepoints": [10894], "characters": "\u2A8E" }, "&gsiml;": { "codepoints": [10896], "characters": "\u2A90" }, "&gtcc;": { "codepoints": [10919], "characters": "\u2AA7" }, "&gtcir;": { "codepoints": [10874], "characters": "\u2A7A" }, "&gt;": { "codepoints": [62], "characters": "\u003E" }, "&gt": { "codepoints": [62], "characters": "\u003E" }, "&GT;": { "codepoints": [62], "characters": "\u003E" }, "&GT": { "codepoints": [62], "characters": "\u003E" }, "&Gt;": { "codepoints": [8811], "characters": "\u226B" }, "&gtdot;": { "codepoints": [8919], "characters": "\u22D7" }, "&gtlPar;": { "codepoints": [10645], "characters": "\u2995" }, "&gtquest;": { "codepoints": [10876], "characters": "\u2A7C" }, "&gtrapprox;": { "codepoints": [10886], "characters": "\u2A86" }, "&gtrarr;": { "codepoints": [10616], "characters": "\u2978" }, "&gtrdot;": { "codepoints": [8919], "characters": "\u22D7" }, "&gtreqless;": { "codepoints": [8923], "characters": "\u22DB" }, "&gtreqqless;": { "codepoints": [10892], "characters": "\u2A8C" }, "&gtrless;": { "codepoints": [8823], "characters": "\u2277" }, "&gtrsim;": { "codepoints": [8819], "characters": "\u2273" }, "&gvertneqq;": { "codepoints": [8809, 65024], "characters": "\u2269\uFE00" }, "&gvnE;": { "codepoints": [8809, 65024], "characters": "\u2269\uFE00" }, "&Hacek;": { "codepoints": [711], "characters": "\u02C7" }, "&hairsp;": { "codepoints": [8202], "characters": "\u200A" }, "&half;": { "codepoints": [189], "characters": "\u00BD" }, "&hamilt;": { "codepoints": [8459], "characters": "\u210B" }, "&HARDcy;": { "codepoints": [1066], "characters": "\u042A" }, "&hardcy;": { "codepoints": [1098], "characters": "\u044A" }, "&harrcir;": { "codepoints": [10568], "characters": "\u2948" }, "&harr;": { "codepoints": [8596], "characters": "\u2194" }, "&hArr;": { "codepoints": [8660], "characters": "\u21D4" }, "&harrw;": { "codepoints": [8621], "characters": "\u21AD" }, "&Hat;": { "codepoints": [94], "characters": "\u005E" }, "&hbar;": { "codepoints": [8463], "characters": "\u210F" }, "&Hcirc;": { "codepoints": [292], "characters": "\u0124" }, "&hcirc;": { "codepoints": [293], "characters": "\u0125" }, "&hearts;": { "codepoints": [9829], "characters": "\u2665" }, "&heartsuit;": { "codepoints": [9829], "characters": "\u2665" }, "&hellip;": { "codepoints": [8230], "characters": "\u2026" }, "&hercon;": { "codepoints": [8889], "characters": "\u22B9" }, "&hfr;": { "codepoints": [120101], "characters": "\uD835\uDD25" }, "&Hfr;": { "codepoints": [8460], "characters": "\u210C" }, "&HilbertSpace;": { "codepoints": [8459], "characters": "\u210B" }, "&hksearow;": { "codepoints": [10533], "characters": "\u2925" }, "&hkswarow;": { "codepoints": [10534], "characters": "\u2926" }, "&hoarr;": { "codepoints": [8703], "characters": "\u21FF" }, "&homtht;": { "codepoints": [8763], "characters": "\u223B" }, "&hookleftarrow;": { "codepoints": [8617], "characters": "\u21A9" }, "&hookrightarrow;": { "codepoints": [8618], "characters": "\u21AA" }, "&hopf;": { "codepoints": [120153], "characters": "\uD835\uDD59" }, "&Hopf;": { "codepoints": [8461], "characters": "\u210D" }, "&horbar;": { "codepoints": [8213], "characters": "\u2015" }, "&HorizontalLine;": { "codepoints": [9472], "characters": "\u2500" }, "&hscr;": { "codepoints": [119997], "characters": "\uD835\uDCBD" }, "&Hscr;": { "codepoints": [8459], "characters": "\u210B" }, "&hslash;": { "codepoints": [8463], "characters": "\u210F" }, "&Hstrok;": { "codepoints": [294], "characters": "\u0126" }, "&hstrok;": { "codepoints": [295], "characters": "\u0127" }, "&HumpDownHump;": { "codepoints": [8782], "characters": "\u224E" }, "&HumpEqual;": { "codepoints": [8783], "characters": "\u224F" }, "&hybull;": { "codepoints": [8259], "characters": "\u2043" }, "&hyphen;": { "codepoints": [8208], "characters": "\u2010" }, "&Iacute;": { "codepoints": [205], "characters": "\u00CD" }, "&Iacute": { "codepoints": [205], "characters": "\u00CD" }, "&iacute;": { "codepoints": [237], "characters": "\u00ED" }, "&iacute": { "codepoints": [237], "characters": "\u00ED" }, "&ic;": { "codepoints": [8291], "characters": "\u2063" }, "&Icirc;": { "codepoints": [206], "characters": "\u00CE" }, "&Icirc": { "codepoints": [206], "characters": "\u00CE" }, "&icirc;": { "codepoints": [238], "characters": "\u00EE" }, "&icirc": { "codepoints": [238], "characters": "\u00EE" }, "&Icy;": { "codepoints": [1048], "characters": "\u0418" }, "&icy;": { "codepoints": [1080], "characters": "\u0438" }, "&Idot;": { "codepoints": [304], "characters": "\u0130" }, "&IEcy;": { "codepoints": [1045], "characters": "\u0415" }, "&iecy;": { "codepoints": [1077], "characters": "\u0435" }, "&iexcl;": { "codepoints": [161], "characters": "\u00A1" }, "&iexcl": { "codepoints": [161], "characters": "\u00A1" }, "&iff;": { "codepoints": [8660], "characters": "\u21D4" }, "&ifr;": { "codepoints": [120102], "characters": "\uD835\uDD26" }, "&Ifr;": { "codepoints": [8465], "characters": "\u2111" }, "&Igrave;": { "codepoints": [204], "characters": "\u00CC" }, "&Igrave": { "codepoints": [204], "characters": "\u00CC" }, "&igrave;": { "codepoints": [236], "characters": "\u00EC" }, "&igrave": { "codepoints": [236], "characters": "\u00EC" }, "&ii;": { "codepoints": [8520], "characters": "\u2148" }, "&iiiint;": { "codepoints": [10764], "characters": "\u2A0C" }, "&iiint;": { "codepoints": [8749], "characters": "\u222D" }, "&iinfin;": { "codepoints": [10716], "characters": "\u29DC" }, "&iiota;": { "codepoints": [8489], "characters": "\u2129" }, "&IJlig;": { "codepoints": [306], "characters": "\u0132" }, "&ijlig;": { "codepoints": [307], "characters": "\u0133" }, "&Imacr;": { "codepoints": [298], "characters": "\u012A" }, "&imacr;": { "codepoints": [299], "characters": "\u012B" }, "&image;": { "codepoints": [8465], "characters": "\u2111" }, "&ImaginaryI;": { "codepoints": [8520], "characters": "\u2148" }, "&imagline;": { "codepoints": [8464], "characters": "\u2110" }, "&imagpart;": { "codepoints": [8465], "characters": "\u2111" }, "&imath;": { "codepoints": [305], "characters": "\u0131" }, "&Im;": { "codepoints": [8465], "characters": "\u2111" }, "&imof;": { "codepoints": [8887], "characters": "\u22B7" }, "&imped;": { "codepoints": [437], "characters": "\u01B5" }, "&Implies;": { "codepoints": [8658], "characters": "\u21D2" }, "&incare;": { "codepoints": [8453], "characters": "\u2105" }, "&in;": { "codepoints": [8712], "characters": "\u2208" }, "&infin;": { "codepoints": [8734], "characters": "\u221E" }, "&infintie;": { "codepoints": [10717], "characters": "\u29DD" }, "&inodot;": { "codepoints": [305], "characters": "\u0131" }, "&intcal;": { "codepoints": [8890], "characters": "\u22BA" }, "&int;": { "codepoints": [8747], "characters": "\u222B" }, "&Int;": { "codepoints": [8748], "characters": "\u222C" }, "&integers;": { "codepoints": [8484], "characters": "\u2124" }, "&Integral;": { "codepoints": [8747], "characters": "\u222B" }, "&intercal;": { "codepoints": [8890], "characters": "\u22BA" }, "&Intersection;": { "codepoints": [8898], "characters": "\u22C2" }, "&intlarhk;": { "codepoints": [10775], "characters": "\u2A17" }, "&intprod;": { "codepoints": [10812], "characters": "\u2A3C" }, "&InvisibleComma;": { "codepoints": [8291], "characters": "\u2063" }, "&InvisibleTimes;": { "codepoints": [8290], "characters": "\u2062" }, "&IOcy;": { "codepoints": [1025], "characters": "\u0401" }, "&iocy;": { "codepoints": [1105], "characters": "\u0451" }, "&Iogon;": { "codepoints": [302], "characters": "\u012E" }, "&iogon;": { "codepoints": [303], "characters": "\u012F" }, "&Iopf;": { "codepoints": [120128], "characters": "\uD835\uDD40" }, "&iopf;": { "codepoints": [120154], "characters": "\uD835\uDD5A" }, "&Iota;": { "codepoints": [921], "characters": "\u0399" }, "&iota;": { "codepoints": [953], "characters": "\u03B9" }, "&iprod;": { "codepoints": [10812], "characters": "\u2A3C" }, "&iquest;": { "codepoints": [191], "characters": "\u00BF" }, "&iquest": { "codepoints": [191], "characters": "\u00BF" }, "&iscr;": { "codepoints": [119998], "characters": "\uD835\uDCBE" }, "&Iscr;": { "codepoints": [8464], "characters": "\u2110" }, "&isin;": { "codepoints": [8712], "characters": "\u2208" }, "&isindot;": { "codepoints": [8949], "characters": "\u22F5" }, "&isinE;": { "codepoints": [8953], "characters": "\u22F9" }, "&isins;": { "codepoints": [8948], "characters": "\u22F4" }, "&isinsv;": { "codepoints": [8947], "characters": "\u22F3" }, "&isinv;": { "codepoints": [8712], "characters": "\u2208" }, "&it;": { "codepoints": [8290], "characters": "\u2062" }, "&Itilde;": { "codepoints": [296], "characters": "\u0128" }, "&itilde;": { "codepoints": [297], "characters": "\u0129" }, "&Iukcy;": { "codepoints": [1030], "characters": "\u0406" }, "&iukcy;": { "codepoints": [1110], "characters": "\u0456" }, "&Iuml;": { "codepoints": [207], "characters": "\u00CF" }, "&Iuml": { "codepoints": [207], "characters": "\u00CF" }, "&iuml;": { "codepoints": [239], "characters": "\u00EF" }, "&iuml": { "codepoints": [239], "characters": "\u00EF" }, "&Jcirc;": { "codepoints": [308], "characters": "\u0134" }, "&jcirc;": { "codepoints": [309], "characters": "\u0135" }, "&Jcy;": { "codepoints": [1049], "characters": "\u0419" }, "&jcy;": { "codepoints": [1081], "characters": "\u0439" }, "&Jfr;": { "codepoints": [120077], "characters": "\uD835\uDD0D" }, "&jfr;": { "codepoints": [120103], "characters": "\uD835\uDD27" }, "&jmath;": { "codepoints": [567], "characters": "\u0237" }, "&Jopf;": { "codepoints": [120129], "characters": "\uD835\uDD41" }, "&jopf;": { "codepoints": [120155], "characters": "\uD835\uDD5B" }, "&Jscr;": { "codepoints": [119973], "characters": "\uD835\uDCA5" }, "&jscr;": { "codepoints": [119999], "characters": "\uD835\uDCBF" }, "&Jsercy;": { "codepoints": [1032], "characters": "\u0408" }, "&jsercy;": { "codepoints": [1112], "characters": "\u0458" }, "&Jukcy;": { "codepoints": [1028], "characters": "\u0404" }, "&jukcy;": { "codepoints": [1108], "characters": "\u0454" }, "&Kappa;": { "codepoints": [922], "characters": "\u039A" }, "&kappa;": { "codepoints": [954], "characters": "\u03BA" }, "&kappav;": { "codepoints": [1008], "characters": "\u03F0" }, "&Kcedil;": { "codepoints": [310], "characters": "\u0136" }, "&kcedil;": { "codepoints": [311], "characters": "\u0137" }, "&Kcy;": { "codepoints": [1050], "characters": "\u041A" }, "&kcy;": { "codepoints": [1082], "characters": "\u043A" }, "&Kfr;": { "codepoints": [120078], "characters": "\uD835\uDD0E" }, "&kfr;": { "codepoints": [120104], "characters": "\uD835\uDD28" }, "&kgreen;": { "codepoints": [312], "characters": "\u0138" }, "&KHcy;": { "codepoints": [1061], "characters": "\u0425" }, "&khcy;": { "codepoints": [1093], "characters": "\u0445" }, "&KJcy;": { "codepoints": [1036], "characters": "\u040C" }, "&kjcy;": { "codepoints": [1116], "characters": "\u045C" }, "&Kopf;": { "codepoints": [120130], "characters": "\uD835\uDD42" }, "&kopf;": { "codepoints": [120156], "characters": "\uD835\uDD5C" }, "&Kscr;": { "codepoints": [119974], "characters": "\uD835\uDCA6" }, "&kscr;": { "codepoints": [120000], "characters": "\uD835\uDCC0" }, "&lAarr;": { "codepoints": [8666], "characters": "\u21DA" }, "&Lacute;": { "codepoints": [313], "characters": "\u0139" }, "&lacute;": { "codepoints": [314], "characters": "\u013A" }, "&laemptyv;": { "codepoints": [10676], "characters": "\u29B4" }, "&lagran;": { "codepoints": [8466], "characters": "\u2112" }, "&Lambda;": { "codepoints": [923], "characters": "\u039B" }, "&lambda;": { "codepoints": [955], "characters": "\u03BB" }, "&lang;": { "codepoints": [10216], "characters": "\u27E8" }, "&Lang;": { "codepoints": [10218], "characters": "\u27EA" }, "&langd;": { "codepoints": [10641], "characters": "\u2991" }, "&langle;": { "codepoints": [10216], "characters": "\u27E8" }, "&lap;": { "codepoints": [10885], "characters": "\u2A85" }, "&Laplacetrf;": { "codepoints": [8466], "characters": "\u2112" }, "&laquo;": { "codepoints": [171], "characters": "\u00AB" }, "&laquo": { "codepoints": [171], "characters": "\u00AB" }, "&larrb;": { "codepoints": [8676], "characters": "\u21E4" }, "&larrbfs;": { "codepoints": [10527], "characters": "\u291F" }, "&larr;": { "codepoints": [8592], "characters": "\u2190" }, "&Larr;": { "codepoints": [8606], "characters": "\u219E" }, "&lArr;": { "codepoints": [8656], "characters": "\u21D0" }, "&larrfs;": { "codepoints": [10525], "characters": "\u291D" }, "&larrhk;": { "codepoints": [8617], "characters": "\u21A9" }, "&larrlp;": { "codepoints": [8619], "characters": "\u21AB" }, "&larrpl;": { "codepoints": [10553], "characters": "\u2939" }, "&larrsim;": { "codepoints": [10611], "characters": "\u2973" }, "&larrtl;": { "codepoints": [8610], "characters": "\u21A2" }, "&latail;": { "codepoints": [10521], "characters": "\u2919" }, "&lAtail;": { "codepoints": [10523], "characters": "\u291B" }, "&lat;": { "codepoints": [10923], "characters": "\u2AAB" }, "&late;": { "codepoints": [10925], "characters": "\u2AAD" }, "&lates;": { "codepoints": [10925, 65024], "characters": "\u2AAD\uFE00" }, "&lbarr;": { "codepoints": [10508], "characters": "\u290C" }, "&lBarr;": { "codepoints": [10510], "characters": "\u290E" }, "&lbbrk;": { "codepoints": [10098], "characters": "\u2772" }, "&lbrace;": { "codepoints": [123], "characters": "\u007B" }, "&lbrack;": { "codepoints": [91], "characters": "\u005B" }, "&lbrke;": { "codepoints": [10635], "characters": "\u298B" }, "&lbrksld;": { "codepoints": [10639], "characters": "\u298F" }, "&lbrkslu;": { "codepoints": [10637], "characters": "\u298D" }, "&Lcaron;": { "codepoints": [317], "characters": "\u013D" }, "&lcaron;": { "codepoints": [318], "characters": "\u013E" }, "&Lcedil;": { "codepoints": [315], "characters": "\u013B" }, "&lcedil;": { "codepoints": [316], "characters": "\u013C" }, "&lceil;": { "codepoints": [8968], "characters": "\u2308" }, "&lcub;": { "codepoints": [123], "characters": "\u007B" }, "&Lcy;": { "codepoints": [1051], "characters": "\u041B" }, "&lcy;": { "codepoints": [1083], "characters": "\u043B" }, "&ldca;": { "codepoints": [10550], "characters": "\u2936" }, "&ldquo;": { "codepoints": [8220], "characters": "\u201C" }, "&ldquor;": { "codepoints": [8222], "characters": "\u201E" }, "&ldrdhar;": { "codepoints": [10599], "characters": "\u2967" }, "&ldrushar;": { "codepoints": [10571], "characters": "\u294B" }, "&ldsh;": { "codepoints": [8626], "characters": "\u21B2" }, "&le;": { "codepoints": [8804], "characters": "\u2264" }, "&lE;": { "codepoints": [8806], "characters": "\u2266" }, "&LeftAngleBracket;": { "codepoints": [10216], "characters": "\u27E8" }, "&LeftArrowBar;": { "codepoints": [8676], "characters": "\u21E4" }, "&leftarrow;": { "codepoints": [8592], "characters": "\u2190" }, "&LeftArrow;": { "codepoints": [8592], "characters": "\u2190" }, "&Leftarrow;": { "codepoints": [8656], "characters": "\u21D0" }, "&LeftArrowRightArrow;": { "codepoints": [8646], "characters": "\u21C6" }, "&leftarrowtail;": { "codepoints": [8610], "characters": "\u21A2" }, "&LeftCeiling;": { "codepoints": [8968], "characters": "\u2308" }, "&LeftDoubleBracket;": { "codepoints": [10214], "characters": "\u27E6" }, "&LeftDownTeeVector;": { "codepoints": [10593], "characters": "\u2961" }, "&LeftDownVectorBar;": { "codepoints": [10585], "characters": "\u2959" }, "&LeftDownVector;": { "codepoints": [8643], "characters": "\u21C3" }, "&LeftFloor;": { "codepoints": [8970], "characters": "\u230A" }, "&leftharpoondown;": { "codepoints": [8637], "characters": "\u21BD" }, "&leftharpoonup;": { "codepoints": [8636], "characters": "\u21BC" }, "&leftleftarrows;": { "codepoints": [8647], "characters": "\u21C7" }, "&leftrightarrow;": { "codepoints": [8596], "characters": "\u2194" }, "&LeftRightArrow;": { "codepoints": [8596], "characters": "\u2194" }, "&Leftrightarrow;": { "codepoints": [8660], "characters": "\u21D4" }, "&leftrightarrows;": { "codepoints": [8646], "characters": "\u21C6" }, "&leftrightharpoons;": { "codepoints": [8651], "characters": "\u21CB" }, "&leftrightsquigarrow;": { "codepoints": [8621], "characters": "\u21AD" }, "&LeftRightVector;": { "codepoints": [10574], "characters": "\u294E" }, "&LeftTeeArrow;": { "codepoints": [8612], "characters": "\u21A4" }, "&LeftTee;": { "codepoints": [8867], "characters": "\u22A3" }, "&LeftTeeVector;": { "codepoints": [10586], "characters": "\u295A" }, "&leftthreetimes;": { "codepoints": [8907], "characters": "\u22CB" }, "&LeftTriangleBar;": { "codepoints": [10703], "characters": "\u29CF" }, "&LeftTriangle;": { "codepoints": [8882], "characters": "\u22B2" }, "&LeftTriangleEqual;": { "codepoints": [8884], "characters": "\u22B4" }, "&LeftUpDownVector;": { "codepoints": [10577], "characters": "\u2951" }, "&LeftUpTeeVector;": { "codepoints": [10592], "characters": "\u2960" }, "&LeftUpVectorBar;": { "codepoints": [10584], "characters": "\u2958" }, "&LeftUpVector;": { "codepoints": [8639], "characters": "\u21BF" }, "&LeftVectorBar;": { "codepoints": [10578], "characters": "\u2952" }, "&LeftVector;": { "codepoints": [8636], "characters": "\u21BC" }, "&lEg;": { "codepoints": [10891], "characters": "\u2A8B" }, "&leg;": { "codepoints": [8922], "characters": "\u22DA" }, "&leq;": { "codepoints": [8804], "characters": "\u2264" }, "&leqq;": { "codepoints": [8806], "characters": "\u2266" }, "&leqslant;": { "codepoints": [10877], "characters": "\u2A7D" }, "&lescc;": { "codepoints": [10920], "characters": "\u2AA8" }, "&les;": { "codepoints": [10877], "characters": "\u2A7D" }, "&lesdot;": { "codepoints": [10879], "characters": "\u2A7F" }, "&lesdoto;": { "codepoints": [10881], "characters": "\u2A81" }, "&lesdotor;": { "codepoints": [10883], "characters": "\u2A83" }, "&lesg;": { "codepoints": [8922, 65024], "characters": "\u22DA\uFE00" }, "&lesges;": { "codepoints": [10899], "characters": "\u2A93" }, "&lessapprox;": { "codepoints": [10885], "characters": "\u2A85" }, "&lessdot;": { "codepoints": [8918], "characters": "\u22D6" }, "&lesseqgtr;": { "codepoints": [8922], "characters": "\u22DA" }, "&lesseqqgtr;": { "codepoints": [10891], "characters": "\u2A8B" }, "&LessEqualGreater;": { "codepoints": [8922], "characters": "\u22DA" }, "&LessFullEqual;": { "codepoints": [8806], "characters": "\u2266" }, "&LessGreater;": { "codepoints": [8822], "characters": "\u2276" }, "&lessgtr;": { "codepoints": [8822], "characters": "\u2276" }, "&LessLess;": { "codepoints": [10913], "characters": "\u2AA1" }, "&lesssim;": { "codepoints": [8818], "characters": "\u2272" }, "&LessSlantEqual;": { "codepoints": [10877], "characters": "\u2A7D" }, "&LessTilde;": { "codepoints": [8818], "characters": "\u2272" }, "&lfisht;": { "codepoints": [10620], "characters": "\u297C" }, "&lfloor;": { "codepoints": [8970], "characters": "\u230A" }, "&Lfr;": { "codepoints": [120079], "characters": "\uD835\uDD0F" }, "&lfr;": { "codepoints": [120105], "characters": "\uD835\uDD29" }, "&lg;": { "codepoints": [8822], "characters": "\u2276" }, "&lgE;": { "codepoints": [10897], "characters": "\u2A91" }, "&lHar;": { "codepoints": [10594], "characters": "\u2962" }, "&lhard;": { "codepoints": [8637], "characters": "\u21BD" }, "&lharu;": { "codepoints": [8636], "characters": "\u21BC" }, "&lharul;": { "codepoints": [10602], "characters": "\u296A" }, "&lhblk;": { "codepoints": [9604], "characters": "\u2584" }, "&LJcy;": { "codepoints": [1033], "characters": "\u0409" }, "&ljcy;": { "codepoints": [1113], "characters": "\u0459" }, "&llarr;": { "codepoints": [8647], "characters": "\u21C7" }, "&ll;": { "codepoints": [8810], "characters": "\u226A" }, "&Ll;": { "codepoints": [8920], "characters": "\u22D8" }, "&llcorner;": { "codepoints": [8990], "characters": "\u231E" }, "&Lleftarrow;": { "codepoints": [8666], "characters": "\u21DA" }, "&llhard;": { "codepoints": [10603], "characters": "\u296B" }, "&lltri;": { "codepoints": [9722], "characters": "\u25FA" }, "&Lmidot;": { "codepoints": [319], "characters": "\u013F" }, "&lmidot;": { "codepoints": [320], "characters": "\u0140" }, "&lmoustache;": { "codepoints": [9136], "characters": "\u23B0" }, "&lmoust;": { "codepoints": [9136], "characters": "\u23B0" }, "&lnap;": { "codepoints": [10889], "characters": "\u2A89" }, "&lnapprox;": { "codepoints": [10889], "characters": "\u2A89" }, "&lne;": { "codepoints": [10887], "characters": "\u2A87" }, "&lnE;": { "codepoints": [8808], "characters": "\u2268" }, "&lneq;": { "codepoints": [10887], "characters": "\u2A87" }, "&lneqq;": { "codepoints": [8808], "characters": "\u2268" }, "&lnsim;": { "codepoints": [8934], "characters": "\u22E6" }, "&loang;": { "codepoints": [10220], "characters": "\u27EC" }, "&loarr;": { "codepoints": [8701], "characters": "\u21FD" }, "&lobrk;": { "codepoints": [10214], "characters": "\u27E6" }, "&longleftarrow;": { "codepoints": [10229], "characters": "\u27F5" }, "&LongLeftArrow;": { "codepoints": [10229], "characters": "\u27F5" }, "&Longleftarrow;": { "codepoints": [10232], "characters": "\u27F8" }, "&longleftrightarrow;": { "codepoints": [10231], "characters": "\u27F7" }, "&LongLeftRightArrow;": { "codepoints": [10231], "characters": "\u27F7" }, "&Longleftrightarrow;": { "codepoints": [10234], "characters": "\u27FA" }, "&longmapsto;": { "codepoints": [10236], "characters": "\u27FC" }, "&longrightarrow;": { "codepoints": [10230], "characters": "\u27F6" }, "&LongRightArrow;": { "codepoints": [10230], "characters": "\u27F6" }, "&Longrightarrow;": { "codepoints": [10233], "characters": "\u27F9" }, "&looparrowleft;": { "codepoints": [8619], "characters": "\u21AB" }, "&looparrowright;": { "codepoints": [8620], "characters": "\u21AC" }, "&lopar;": { "codepoints": [10629], "characters": "\u2985" }, "&Lopf;": { "codepoints": [120131], "characters": "\uD835\uDD43" }, "&lopf;": { "codepoints": [120157], "characters": "\uD835\uDD5D" }, "&loplus;": { "codepoints": [10797], "characters": "\u2A2D" }, "&lotimes;": { "codepoints": [10804], "characters": "\u2A34" }, "&lowast;": { "codepoints": [8727], "characters": "\u2217" }, "&lowbar;": { "codepoints": [95], "characters": "\u005F" }, "&LowerLeftArrow;": { "codepoints": [8601], "characters": "\u2199" }, "&LowerRightArrow;": { "codepoints": [8600], "characters": "\u2198" }, "&loz;": { "codepoints": [9674], "characters": "\u25CA" }, "&lozenge;": { "codepoints": [9674], "characters": "\u25CA" }, "&lozf;": { "codepoints": [10731], "characters": "\u29EB" }, "&lpar;": { "codepoints": [40], "characters": "\u0028" }, "&lparlt;": { "codepoints": [10643], "characters": "\u2993" }, "&lrarr;": { "codepoints": [8646], "characters": "\u21C6" }, "&lrcorner;": { "codepoints": [8991], "characters": "\u231F" }, "&lrhar;": { "codepoints": [8651], "characters": "\u21CB" }, "&lrhard;": { "codepoints": [10605], "characters": "\u296D" }, "&lrm;": { "codepoints": [8206], "characters": "\u200E" }, "&lrtri;": { "codepoints": [8895], "characters": "\u22BF" }, "&lsaquo;": { "codepoints": [8249], "characters": "\u2039" }, "&lscr;": { "codepoints": [120001], "characters": "\uD835\uDCC1" }, "&Lscr;": { "codepoints": [8466], "characters": "\u2112" }, "&lsh;": { "codepoints": [8624], "characters": "\u21B0" }, "&Lsh;": { "codepoints": [8624], "characters": "\u21B0" }, "&lsim;": { "codepoints": [8818], "characters": "\u2272" }, "&lsime;": { "codepoints": [10893], "characters": "\u2A8D" }, "&lsimg;": { "codepoints": [10895], "characters": "\u2A8F" }, "&lsqb;": { "codepoints": [91], "characters": "\u005B" }, "&lsquo;": { "codepoints": [8216], "characters": "\u2018" }, "&lsquor;": { "codepoints": [8218], "characters": "\u201A" }, "&Lstrok;": { "codepoints": [321], "characters": "\u0141" }, "&lstrok;": { "codepoints": [322], "characters": "\u0142" }, "&ltcc;": { "codepoints": [10918], "characters": "\u2AA6" }, "&ltcir;": { "codepoints": [10873], "characters": "\u2A79" }, "&lt;": { "codepoints": [60], "characters": "\u003C" }, "&lt": { "codepoints": [60], "characters": "\u003C" }, "&LT;": { "codepoints": [60], "characters": "\u003C" }, "&LT": { "codepoints": [60], "characters": "\u003C" }, "&Lt;": { "codepoints": [8810], "characters": "\u226A" }, "&ltdot;": { "codepoints": [8918], "characters": "\u22D6" }, "&lthree;": { "codepoints": [8907], "characters": "\u22CB" }, "&ltimes;": { "codepoints": [8905], "characters": "\u22C9" }, "&ltlarr;": { "codepoints": [10614], "characters": "\u2976" }, "&ltquest;": { "codepoints": [10875], "characters": "\u2A7B" }, "&ltri;": { "codepoints": [9667], "characters": "\u25C3" }, "&ltrie;": { "codepoints": [8884], "characters": "\u22B4" }, "&ltrif;": { "codepoints": [9666], "characters": "\u25C2" }, "&ltrPar;": { "codepoints": [10646], "characters": "\u2996" }, "&lurdshar;": { "codepoints": [10570], "characters": "\u294A" }, "&luruhar;": { "codepoints": [10598], "characters": "\u2966" }, "&lvertneqq;": { "codepoints": [8808, 65024], "characters": "\u2268\uFE00" }, "&lvnE;": { "codepoints": [8808, 65024], "characters": "\u2268\uFE00" }, "&macr;": { "codepoints": [175], "characters": "\u00AF" }, "&macr": { "codepoints": [175], "characters": "\u00AF" }, "&male;": { "codepoints": [9794], "characters": "\u2642" }, "&malt;": { "codepoints": [10016], "characters": "\u2720" }, "&maltese;": { "codepoints": [10016], "characters": "\u2720" }, "&Map;": { "codepoints": [10501], "characters": "\u2905" }, "&map;": { "codepoints": [8614], "characters": "\u21A6" }, "&mapsto;": { "codepoints": [8614], "characters": "\u21A6" }, "&mapstodown;": { "codepoints": [8615], "characters": "\u21A7" }, "&mapstoleft;": { "codepoints": [8612], "characters": "\u21A4" }, "&mapstoup;": { "codepoints": [8613], "characters": "\u21A5" }, "&marker;": { "codepoints": [9646], "characters": "\u25AE" }, "&mcomma;": { "codepoints": [10793], "characters": "\u2A29" }, "&Mcy;": { "codepoints": [1052], "characters": "\u041C" }, "&mcy;": { "codepoints": [1084], "characters": "\u043C" }, "&mdash;": { "codepoints": [8212], "characters": "\u2014" }, "&mDDot;": { "codepoints": [8762], "characters": "\u223A" }, "&measuredangle;": { "codepoints": [8737], "characters": "\u2221" }, "&MediumSpace;": { "codepoints": [8287], "characters": "\u205F" }, "&Mellintrf;": { "codepoints": [8499], "characters": "\u2133" }, "&Mfr;": { "codepoints": [120080], "characters": "\uD835\uDD10" }, "&mfr;": { "codepoints": [120106], "characters": "\uD835\uDD2A" }, "&mho;": { "codepoints": [8487], "characters": "\u2127" }, "&micro;": { "codepoints": [181], "characters": "\u00B5" }, "&micro": { "codepoints": [181], "characters": "\u00B5" }, "&midast;": { "codepoints": [42], "characters": "\u002A" }, "&midcir;": { "codepoints": [10992], "characters": "\u2AF0" }, "&mid;": { "codepoints": [8739], "characters": "\u2223" }, "&middot;": { "codepoints": [183], "characters": "\u00B7" }, "&middot": { "codepoints": [183], "characters": "\u00B7" }, "&minusb;": { "codepoints": [8863], "characters": "\u229F" }, "&minus;": { "codepoints": [8722], "characters": "\u2212" }, "&minusd;": { "codepoints": [8760], "characters": "\u2238" }, "&minusdu;": { "codepoints": [10794], "characters": "\u2A2A" }, "&MinusPlus;": { "codepoints": [8723], "characters": "\u2213" }, "&mlcp;": { "codepoints": [10971], "characters": "\u2ADB" }, "&mldr;": { "codepoints": [8230], "characters": "\u2026" }, "&mnplus;": { "codepoints": [8723], "characters": "\u2213" }, "&models;": { "codepoints": [8871], "characters": "\u22A7" }, "&Mopf;": { "codepoints": [120132], "characters": "\uD835\uDD44" }, "&mopf;": { "codepoints": [120158], "characters": "\uD835\uDD5E" }, "&mp;": { "codepoints": [8723], "characters": "\u2213" }, "&mscr;": { "codepoints": [120002], "characters": "\uD835\uDCC2" }, "&Mscr;": { "codepoints": [8499], "characters": "\u2133" }, "&mstpos;": { "codepoints": [8766], "characters": "\u223E" }, "&Mu;": { "codepoints": [924], "characters": "\u039C" }, "&mu;": { "codepoints": [956], "characters": "\u03BC" }, "&multimap;": { "codepoints": [8888], "characters": "\u22B8" }, "&mumap;": { "codepoints": [8888], "characters": "\u22B8" }, "&nabla;": { "codepoints": [8711], "characters": "\u2207" }, "&Nacute;": { "codepoints": [323], "characters": "\u0143" }, "&nacute;": { "codepoints": [324], "characters": "\u0144" }, "&nang;": { "codepoints": [8736, 8402], "characters": "\u2220\u20D2" }, "&nap;": { "codepoints": [8777], "characters": "\u2249" }, "&napE;": { "codepoints": [10864, 824], "characters": "\u2A70\u0338" }, "&napid;": { "codepoints": [8779, 824], "characters": "\u224B\u0338" }, "&napos;": { "codepoints": [329], "characters": "\u0149" }, "&napprox;": { "codepoints": [8777], "characters": "\u2249" }, "&natural;": { "codepoints": [9838], "characters": "\u266E" }, "&naturals;": { "codepoints": [8469], "characters": "\u2115" }, "&natur;": { "codepoints": [9838], "characters": "\u266E" }, "&nbsp;": { "codepoints": [160], "characters": "\u00A0" }, "&nbsp": { "codepoints": [160], "characters": "\u00A0" }, "&nbump;": { "codepoints": [8782, 824], "characters": "\u224E\u0338" }, "&nbumpe;": { "codepoints": [8783, 824], "characters": "\u224F\u0338" }, "&ncap;": { "codepoints": [10819], "characters": "\u2A43" }, "&Ncaron;": { "codepoints": [327], "characters": "\u0147" }, "&ncaron;": { "codepoints": [328], "characters": "\u0148" }, "&Ncedil;": { "codepoints": [325], "characters": "\u0145" }, "&ncedil;": { "codepoints": [326], "characters": "\u0146" }, "&ncong;": { "codepoints": [8775], "characters": "\u2247" }, "&ncongdot;": { "codepoints": [10861, 824], "characters": "\u2A6D\u0338" }, "&ncup;": { "codepoints": [10818], "characters": "\u2A42" }, "&Ncy;": { "codepoints": [1053], "characters": "\u041D" }, "&ncy;": { "codepoints": [1085], "characters": "\u043D" }, "&ndash;": { "codepoints": [8211], "characters": "\u2013" }, "&nearhk;": { "codepoints": [10532], "characters": "\u2924" }, "&nearr;": { "codepoints": [8599], "characters": "\u2197" }, "&neArr;": { "codepoints": [8663], "characters": "\u21D7" }, "&nearrow;": { "codepoints": [8599], "characters": "\u2197" }, "&ne;": { "codepoints": [8800], "characters": "\u2260" }, "&nedot;": { "codepoints": [8784, 824], "characters": "\u2250\u0338" }, "&NegativeMediumSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&NegativeThickSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&NegativeThinSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&NegativeVeryThinSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&nequiv;": { "codepoints": [8802], "characters": "\u2262" }, "&nesear;": { "codepoints": [10536], "characters": "\u2928" }, "&nesim;": { "codepoints": [8770, 824], "characters": "\u2242\u0338" }, "&NestedGreaterGreater;": { "codepoints": [8811], "characters": "\u226B" }, "&NestedLessLess;": { "codepoints": [8810], "characters": "\u226A" }, "&NewLine;": { "codepoints": [10], "characters": "\u000A" }, "&nexist;": { "codepoints": [8708], "characters": "\u2204" }, "&nexists;": { "codepoints": [8708], "characters": "\u2204" }, "&Nfr;": { "codepoints": [120081], "characters": "\uD835\uDD11" }, "&nfr;": { "codepoints": [120107], "characters": "\uD835\uDD2B" }, "&ngE;": { "codepoints": [8807, 824], "characters": "\u2267\u0338" }, "&nge;": { "codepoints": [8817], "characters": "\u2271" }, "&ngeq;": { "codepoints": [8817], "characters": "\u2271" }, "&ngeqq;": { "codepoints": [8807, 824], "characters": "\u2267\u0338" }, "&ngeqslant;": { "codepoints": [10878, 824], "characters": "\u2A7E\u0338" }, "&nges;": { "codepoints": [10878, 824], "characters": "\u2A7E\u0338" }, "&nGg;": { "codepoints": [8921, 824], "characters": "\u22D9\u0338" }, "&ngsim;": { "codepoints": [8821], "characters": "\u2275" }, "&nGt;": { "codepoints": [8811, 8402], "characters": "\u226B\u20D2" }, "&ngt;": { "codepoints": [8815], "characters": "\u226F" }, "&ngtr;": { "codepoints": [8815], "characters": "\u226F" }, "&nGtv;": { "codepoints": [8811, 824], "characters": "\u226B\u0338" }, "&nharr;": { "codepoints": [8622], "characters": "\u21AE" }, "&nhArr;": { "codepoints": [8654], "characters": "\u21CE" }, "&nhpar;": { "codepoints": [10994], "characters": "\u2AF2" }, "&ni;": { "codepoints": [8715], "characters": "\u220B" }, "&nis;": { "codepoints": [8956], "characters": "\u22FC" }, "&nisd;": { "codepoints": [8954], "characters": "\u22FA" }, "&niv;": { "codepoints": [8715], "characters": "\u220B" }, "&NJcy;": { "codepoints": [1034], "characters": "\u040A" }, "&njcy;": { "codepoints": [1114], "characters": "\u045A" }, "&nlarr;": { "codepoints": [8602], "characters": "\u219A" }, "&nlArr;": { "codepoints": [8653], "characters": "\u21CD" }, "&nldr;": { "codepoints": [8229], "characters": "\u2025" }, "&nlE;": { "codepoints": [8806, 824], "characters": "\u2266\u0338" }, "&nle;": { "codepoints": [8816], "characters": "\u2270" }, "&nleftarrow;": { "codepoints": [8602], "characters": "\u219A" }, "&nLeftarrow;": { "codepoints": [8653], "characters": "\u21CD" }, "&nleftrightarrow;": { "codepoints": [8622], "characters": "\u21AE" }, "&nLeftrightarrow;": { "codepoints": [8654], "characters": "\u21CE" }, "&nleq;": { "codepoints": [8816], "characters": "\u2270" }, "&nleqq;": { "codepoints": [8806, 824], "characters": "\u2266\u0338" }, "&nleqslant;": { "codepoints": [10877, 824], "characters": "\u2A7D\u0338" }, "&nles;": { "codepoints": [10877, 824], "characters": "\u2A7D\u0338" }, "&nless;": { "codepoints": [8814], "characters": "\u226E" }, "&nLl;": { "codepoints": [8920, 824], "characters": "\u22D8\u0338" }, "&nlsim;": { "codepoints": [8820], "characters": "\u2274" }, "&nLt;": { "codepoints": [8810, 8402], "characters": "\u226A\u20D2" }, "&nlt;": { "codepoints": [8814], "characters": "\u226E" }, "&nltri;": { "codepoints": [8938], "characters": "\u22EA" }, "&nltrie;": { "codepoints": [8940], "characters": "\u22EC" }, "&nLtv;": { "codepoints": [8810, 824], "characters": "\u226A\u0338" }, "&nmid;": { "codepoints": [8740], "characters": "\u2224" }, "&NoBreak;": { "codepoints": [8288], "characters": "\u2060" }, "&NonBreakingSpace;": { "codepoints": [160], "characters": "\u00A0" }, "&nopf;": { "codepoints": [120159], "characters": "\uD835\uDD5F" }, "&Nopf;": { "codepoints": [8469], "characters": "\u2115" }, "&Not;": { "codepoints": [10988], "characters": "\u2AEC" }, "&not;": { "codepoints": [172], "characters": "\u00AC" }, "&not": { "codepoints": [172], "characters": "\u00AC" }, "&NotCongruent;": { "codepoints": [8802], "characters": "\u2262" }, "&NotCupCap;": { "codepoints": [8813], "characters": "\u226D" }, "&NotDoubleVerticalBar;": { "codepoints": [8742], "characters": "\u2226" }, "&NotElement;": { "codepoints": [8713], "characters": "\u2209" }, "&NotEqual;": { "codepoints": [8800], "characters": "\u2260" }, "&NotEqualTilde;": { "codepoints": [8770, 824], "characters": "\u2242\u0338" }, "&NotExists;": { "codepoints": [8708], "characters": "\u2204" }, "&NotGreater;": { "codepoints": [8815], "characters": "\u226F" }, "&NotGreaterEqual;": { "codepoints": [8817], "characters": "\u2271" }, "&NotGreaterFullEqual;": { "codepoints": [8807, 824], "characters": "\u2267\u0338" }, "&NotGreaterGreater;": { "codepoints": [8811, 824], "characters": "\u226B\u0338" }, "&NotGreaterLess;": { "codepoints": [8825], "characters": "\u2279" }, "&NotGreaterSlantEqual;": { "codepoints": [10878, 824], "characters": "\u2A7E\u0338" }, "&NotGreaterTilde;": { "codepoints": [8821], "characters": "\u2275" }, "&NotHumpDownHump;": { "codepoints": [8782, 824], "characters": "\u224E\u0338" }, "&NotHumpEqual;": { "codepoints": [8783, 824], "characters": "\u224F\u0338" }, "&notin;": { "codepoints": [8713], "characters": "\u2209" }, "&notindot;": { "codepoints": [8949, 824], "characters": "\u22F5\u0338" }, "&notinE;": { "codepoints": [8953, 824], "characters": "\u22F9\u0338" }, "&notinva;": { "codepoints": [8713], "characters": "\u2209" }, "&notinvb;": { "codepoints": [8951], "characters": "\u22F7" }, "&notinvc;": { "codepoints": [8950], "characters": "\u22F6" }, "&NotLeftTriangleBar;": { "codepoints": [10703, 824], "characters": "\u29CF\u0338" }, "&NotLeftTriangle;": { "codepoints": [8938], "characters": "\u22EA" }, "&NotLeftTriangleEqual;": { "codepoints": [8940], "characters": "\u22EC" }, "&NotLess;": { "codepoints": [8814], "characters": "\u226E" }, "&NotLessEqual;": { "codepoints": [8816], "characters": "\u2270" }, "&NotLessGreater;": { "codepoints": [8824], "characters": "\u2278" }, "&NotLessLess;": { "codepoints": [8810, 824], "characters": "\u226A\u0338" }, "&NotLessSlantEqual;": { "codepoints": [10877, 824], "characters": "\u2A7D\u0338" }, "&NotLessTilde;": { "codepoints": [8820], "characters": "\u2274" }, "&NotNestedGreaterGreater;": { "codepoints": [10914, 824], "characters": "\u2AA2\u0338" }, "&NotNestedLessLess;": { "codepoints": [10913, 824], "characters": "\u2AA1\u0338" }, "&notni;": { "codepoints": [8716], "characters": "\u220C" }, "&notniva;": { "codepoints": [8716], "characters": "\u220C" }, "&notnivb;": { "codepoints": [8958], "characters": "\u22FE" }, "&notnivc;": { "codepoints": [8957], "characters": "\u22FD" }, "&NotPrecedes;": { "codepoints": [8832], "characters": "\u2280" }, "&NotPrecedesEqual;": { "codepoints": [10927, 824], "characters": "\u2AAF\u0338" }, "&NotPrecedesSlantEqual;": { "codepoints": [8928], "characters": "\u22E0" }, "&NotReverseElement;": { "codepoints": [8716], "characters": "\u220C" }, "&NotRightTriangleBar;": { "codepoints": [10704, 824], "characters": "\u29D0\u0338" }, "&NotRightTriangle;": { "codepoints": [8939], "characters": "\u22EB" }, "&NotRightTriangleEqual;": { "codepoints": [8941], "characters": "\u22ED" }, "&NotSquareSubset;": { "codepoints": [8847, 824], "characters": "\u228F\u0338" }, "&NotSquareSubsetEqual;": { "codepoints": [8930], "characters": "\u22E2" }, "&NotSquareSuperset;": { "codepoints": [8848, 824], "characters": "\u2290\u0338" }, "&NotSquareSupersetEqual;": { "codepoints": [8931], "characters": "\u22E3" }, "&NotSubset;": { "codepoints": [8834, 8402], "characters": "\u2282\u20D2" }, "&NotSubsetEqual;": { "codepoints": [8840], "characters": "\u2288" }, "&NotSucceeds;": { "codepoints": [8833], "characters": "\u2281" }, "&NotSucceedsEqual;": { "codepoints": [10928, 824], "characters": "\u2AB0\u0338" }, "&NotSucceedsSlantEqual;": { "codepoints": [8929], "characters": "\u22E1" }, "&NotSucceedsTilde;": { "codepoints": [8831, 824], "characters": "\u227F\u0338" }, "&NotSuperset;": { "codepoints": [8835, 8402], "characters": "\u2283\u20D2" }, "&NotSupersetEqual;": { "codepoints": [8841], "characters": "\u2289" }, "&NotTilde;": { "codepoints": [8769], "characters": "\u2241" }, "&NotTildeEqual;": { "codepoints": [8772], "characters": "\u2244" }, "&NotTildeFullEqual;": { "codepoints": [8775], "characters": "\u2247" }, "&NotTildeTilde;": { "codepoints": [8777], "characters": "\u2249" }, "&NotVerticalBar;": { "codepoints": [8740], "characters": "\u2224" }, "&nparallel;": { "codepoints": [8742], "characters": "\u2226" }, "&npar;": { "codepoints": [8742], "characters": "\u2226" }, "&nparsl;": { "codepoints": [11005, 8421], "characters": "\u2AFD\u20E5" }, "&npart;": { "codepoints": [8706, 824], "characters": "\u2202\u0338" }, "&npolint;": { "codepoints": [10772], "characters": "\u2A14" }, "&npr;": { "codepoints": [8832], "characters": "\u2280" }, "&nprcue;": { "codepoints": [8928], "characters": "\u22E0" }, "&nprec;": { "codepoints": [8832], "characters": "\u2280" }, "&npreceq;": { "codepoints": [10927, 824], "characters": "\u2AAF\u0338" }, "&npre;": { "codepoints": [10927, 824], "characters": "\u2AAF\u0338" }, "&nrarrc;": { "codepoints": [10547, 824], "characters": "\u2933\u0338" }, "&nrarr;": { "codepoints": [8603], "characters": "\u219B" }, "&nrArr;": { "codepoints": [8655], "characters": "\u21CF" }, "&nrarrw;": { "codepoints": [8605, 824], "characters": "\u219D\u0338" }, "&nrightarrow;": { "codepoints": [8603], "characters": "\u219B" }, "&nRightarrow;": { "codepoints": [8655], "characters": "\u21CF" }, "&nrtri;": { "codepoints": [8939], "characters": "\u22EB" }, "&nrtrie;": { "codepoints": [8941], "characters": "\u22ED" }, "&nsc;": { "codepoints": [8833], "characters": "\u2281" }, "&nsccue;": { "codepoints": [8929], "characters": "\u22E1" }, "&nsce;": { "codepoints": [10928, 824], "characters": "\u2AB0\u0338" }, "&Nscr;": { "codepoints": [119977], "characters": "\uD835\uDCA9" }, "&nscr;": { "codepoints": [120003], "characters": "\uD835\uDCC3" }, "&nshortmid;": { "codepoints": [8740], "characters": "\u2224" }, "&nshortparallel;": { "codepoints": [8742], "characters": "\u2226" }, "&nsim;": { "codepoints": [8769], "characters": "\u2241" }, "&nsime;": { "codepoints": [8772], "characters": "\u2244" }, "&nsimeq;": { "codepoints": [8772], "characters": "\u2244" }, "&nsmid;": { "codepoints": [8740], "characters": "\u2224" }, "&nspar;": { "codepoints": [8742], "characters": "\u2226" }, "&nsqsube;": { "codepoints": [8930], "characters": "\u22E2" }, "&nsqsupe;": { "codepoints": [8931], "characters": "\u22E3" }, "&nsub;": { "codepoints": [8836], "characters": "\u2284" }, "&nsubE;": { "codepoints": [10949, 824], "characters": "\u2AC5\u0338" }, "&nsube;": { "codepoints": [8840], "characters": "\u2288" }, "&nsubset;": { "codepoints": [8834, 8402], "characters": "\u2282\u20D2" }, "&nsubseteq;": { "codepoints": [8840], "characters": "\u2288" }, "&nsubseteqq;": { "codepoints": [10949, 824], "characters": "\u2AC5\u0338" }, "&nsucc;": { "codepoints": [8833], "characters": "\u2281" }, "&nsucceq;": { "codepoints": [10928, 824], "characters": "\u2AB0\u0338" }, "&nsup;": { "codepoints": [8837], "characters": "\u2285" }, "&nsupE;": { "codepoints": [10950, 824], "characters": "\u2AC6\u0338" }, "&nsupe;": { "codepoints": [8841], "characters": "\u2289" }, "&nsupset;": { "codepoints": [8835, 8402], "characters": "\u2283\u20D2" }, "&nsupseteq;": { "codepoints": [8841], "characters": "\u2289" }, "&nsupseteqq;": { "codepoints": [10950, 824], "characters": "\u2AC6\u0338" }, "&ntgl;": { "codepoints": [8825], "characters": "\u2279" }, "&Ntilde;": { "codepoints": [209], "characters": "\u00D1" }, "&Ntilde": { "codepoints": [209], "characters": "\u00D1" }, "&ntilde;": { "codepoints": [241], "characters": "\u00F1" }, "&ntilde": { "codepoints": [241], "characters": "\u00F1" }, "&ntlg;": { "codepoints": [8824], "characters": "\u2278" }, "&ntriangleleft;": { "codepoints": [8938], "characters": "\u22EA" }, "&ntrianglelefteq;": { "codepoints": [8940], "characters": "\u22EC" }, "&ntriangleright;": { "codepoints": [8939], "characters": "\u22EB" }, "&ntrianglerighteq;": { "codepoints": [8941], "characters": "\u22ED" }, "&Nu;": { "codepoints": [925], "characters": "\u039D" }, "&nu;": { "codepoints": [957], "characters": "\u03BD" }, "&num;": { "codepoints": [35], "characters": "\u0023" }, "&numero;": { "codepoints": [8470], "characters": "\u2116" }, "&numsp;": { "codepoints": [8199], "characters": "\u2007" }, "&nvap;": { "codepoints": [8781, 8402], "characters": "\u224D\u20D2" }, "&nvdash;": { "codepoints": [8876], "characters": "\u22AC" }, "&nvDash;": { "codepoints": [8877], "characters": "\u22AD" }, "&nVdash;": { "codepoints": [8878], "characters": "\u22AE" }, "&nVDash;": { "codepoints": [8879], "characters": "\u22AF" }, "&nvge;": { "codepoints": [8805, 8402], "characters": "\u2265\u20D2" }, "&nvgt;": { "codepoints": [62, 8402], "characters": "\u003E\u20D2" }, "&nvHarr;": { "codepoints": [10500], "characters": "\u2904" }, "&nvinfin;": { "codepoints": [10718], "characters": "\u29DE" }, "&nvlArr;": { "codepoints": [10498], "characters": "\u2902" }, "&nvle;": { "codepoints": [8804, 8402], "characters": "\u2264\u20D2" }, "&nvlt;": { "codepoints": [60, 8402], "characters": "\u003C\u20D2" }, "&nvltrie;": { "codepoints": [8884, 8402], "characters": "\u22B4\u20D2" }, "&nvrArr;": { "codepoints": [10499], "characters": "\u2903" }, "&nvrtrie;": { "codepoints": [8885, 8402], "characters": "\u22B5\u20D2" }, "&nvsim;": { "codepoints": [8764, 8402], "characters": "\u223C\u20D2" }, "&nwarhk;": { "codepoints": [10531], "characters": "\u2923" }, "&nwarr;": { "codepoints": [8598], "characters": "\u2196" }, "&nwArr;": { "codepoints": [8662], "characters": "\u21D6" }, "&nwarrow;": { "codepoints": [8598], "characters": "\u2196" }, "&nwnear;": { "codepoints": [10535], "characters": "\u2927" }, "&Oacute;": { "codepoints": [211], "characters": "\u00D3" }, "&Oacute": { "codepoints": [211], "characters": "\u00D3" }, "&oacute;": { "codepoints": [243], "characters": "\u00F3" }, "&oacute": { "codepoints": [243], "characters": "\u00F3" }, "&oast;": { "codepoints": [8859], "characters": "\u229B" }, "&Ocirc;": { "codepoints": [212], "characters": "\u00D4" }, "&Ocirc": { "codepoints": [212], "characters": "\u00D4" }, "&ocirc;": { "codepoints": [244], "characters": "\u00F4" }, "&ocirc": { "codepoints": [244], "characters": "\u00F4" }, "&ocir;": { "codepoints": [8858], "characters": "\u229A" }, "&Ocy;": { "codepoints": [1054], "characters": "\u041E" }, "&ocy;": { "codepoints": [1086], "characters": "\u043E" }, "&odash;": { "codepoints": [8861], "characters": "\u229D" }, "&Odblac;": { "codepoints": [336], "characters": "\u0150" }, "&odblac;": { "codepoints": [337], "characters": "\u0151" }, "&odiv;": { "codepoints": [10808], "characters": "\u2A38" }, "&odot;": { "codepoints": [8857], "characters": "\u2299" }, "&odsold;": { "codepoints": [10684], "characters": "\u29BC" }, "&OElig;": { "codepoints": [338], "characters": "\u0152" }, "&oelig;": { "codepoints": [339], "characters": "\u0153" }, "&ofcir;": { "codepoints": [10687], "characters": "\u29BF" }, "&Ofr;": { "codepoints": [120082], "characters": "\uD835\uDD12" }, "&ofr;": { "codepoints": [120108], "characters": "\uD835\uDD2C" }, "&ogon;": { "codepoints": [731], "characters": "\u02DB" }, "&Ograve;": { "codepoints": [210], "characters": "\u00D2" }, "&Ograve": { "codepoints": [210], "characters": "\u00D2" }, "&ograve;": { "codepoints": [242], "characters": "\u00F2" }, "&ograve": { "codepoints": [242], "characters": "\u00F2" }, "&ogt;": { "codepoints": [10689], "characters": "\u29C1" }, "&ohbar;": { "codepoints": [10677], "characters": "\u29B5" }, "&ohm;": { "codepoints": [937], "characters": "\u03A9" }, "&oint;": { "codepoints": [8750], "characters": "\u222E" }, "&olarr;": { "codepoints": [8634], "characters": "\u21BA" }, "&olcir;": { "codepoints": [10686], "characters": "\u29BE" }, "&olcross;": { "codepoints": [10683], "characters": "\u29BB" }, "&oline;": { "codepoints": [8254], "characters": "\u203E" }, "&olt;": { "codepoints": [10688], "characters": "\u29C0" }, "&Omacr;": { "codepoints": [332], "characters": "\u014C" }, "&omacr;": { "codepoints": [333], "characters": "\u014D" }, "&Omega;": { "codepoints": [937], "characters": "\u03A9" }, "&omega;": { "codepoints": [969], "characters": "\u03C9" }, "&Omicron;": { "codepoints": [927], "characters": "\u039F" }, "&omicron;": { "codepoints": [959], "characters": "\u03BF" }, "&omid;": { "codepoints": [10678], "characters": "\u29B6" }, "&ominus;": { "codepoints": [8854], "characters": "\u2296" }, "&Oopf;": { "codepoints": [120134], "characters": "\uD835\uDD46" }, "&oopf;": { "codepoints": [120160], "characters": "\uD835\uDD60" }, "&opar;": { "codepoints": [10679], "characters": "\u29B7" }, "&OpenCurlyDoubleQuote;": { "codepoints": [8220], "characters": "\u201C" }, "&OpenCurlyQuote;": { "codepoints": [8216], "characters": "\u2018" }, "&operp;": { "codepoints": [10681], "characters": "\u29B9" }, "&oplus;": { "codepoints": [8853], "characters": "\u2295" }, "&orarr;": { "codepoints": [8635], "characters": "\u21BB" }, "&Or;": { "codepoints": [10836], "characters": "\u2A54" }, "&or;": { "codepoints": [8744], "characters": "\u2228" }, "&ord;": { "codepoints": [10845], "characters": "\u2A5D" }, "&order;": { "codepoints": [8500], "characters": "\u2134" }, "&orderof;": { "codepoints": [8500], "characters": "\u2134" }, "&ordf;": { "codepoints": [170], "characters": "\u00AA" }, "&ordf": { "codepoints": [170], "characters": "\u00AA" }, "&ordm;": { "codepoints": [186], "characters": "\u00BA" }, "&ordm": { "codepoints": [186], "characters": "\u00BA" }, "&origof;": { "codepoints": [8886], "characters": "\u22B6" }, "&oror;": { "codepoints": [10838], "characters": "\u2A56" }, "&orslope;": { "codepoints": [10839], "characters": "\u2A57" }, "&orv;": { "codepoints": [10843], "characters": "\u2A5B" }, "&oS;": { "codepoints": [9416], "characters": "\u24C8" }, "&Oscr;": { "codepoints": [119978], "characters": "\uD835\uDCAA" }, "&oscr;": { "codepoints": [8500], "characters": "\u2134" }, "&Oslash;": { "codepoints": [216], "characters": "\u00D8" }, "&Oslash": { "codepoints": [216], "characters": "\u00D8" }, "&oslash;": { "codepoints": [248], "characters": "\u00F8" }, "&oslash": { "codepoints": [248], "characters": "\u00F8" }, "&osol;": { "codepoints": [8856], "characters": "\u2298" }, "&Otilde;": { "codepoints": [213], "characters": "\u00D5" }, "&Otilde": { "codepoints": [213], "characters": "\u00D5" }, "&otilde;": { "codepoints": [245], "characters": "\u00F5" }, "&otilde": { "codepoints": [245], "characters": "\u00F5" }, "&otimesas;": { "codepoints": [10806], "characters": "\u2A36" }, "&Otimes;": { "codepoints": [10807], "characters": "\u2A37" }, "&otimes;": { "codepoints": [8855], "characters": "\u2297" }, "&Ouml;": { "codepoints": [214], "characters": "\u00D6" }, "&Ouml": { "codepoints": [214], "characters": "\u00D6" }, "&ouml;": { "codepoints": [246], "characters": "\u00F6" }, "&ouml": { "codepoints": [246], "characters": "\u00F6" }, "&ovbar;": { "codepoints": [9021], "characters": "\u233D" }, "&OverBar;": { "codepoints": [8254], "characters": "\u203E" }, "&OverBrace;": { "codepoints": [9182], "characters": "\u23DE" }, "&OverBracket;": { "codepoints": [9140], "characters": "\u23B4" }, "&OverParenthesis;": { "codepoints": [9180], "characters": "\u23DC" }, "&para;": { "codepoints": [182], "characters": "\u00B6" }, "&para": { "codepoints": [182], "characters": "\u00B6" }, "&parallel;": { "codepoints": [8741], "characters": "\u2225" }, "&par;": { "codepoints": [8741], "characters": "\u2225" }, "&parsim;": { "codepoints": [10995], "characters": "\u2AF3" }, "&parsl;": { "codepoints": [11005], "characters": "\u2AFD" }, "&part;": { "codepoints": [8706], "characters": "\u2202" }, "&PartialD;": { "codepoints": [8706], "characters": "\u2202" }, "&Pcy;": { "codepoints": [1055], "characters": "\u041F" }, "&pcy;": { "codepoints": [1087], "characters": "\u043F" }, "&percnt;": { "codepoints": [37], "characters": "\u0025" }, "&period;": { "codepoints": [46], "characters": "\u002E" }, "&permil;": { "codepoints": [8240], "characters": "\u2030" }, "&perp;": { "codepoints": [8869], "characters": "\u22A5" }, "&pertenk;": { "codepoints": [8241], "characters": "\u2031" }, "&Pfr;": { "codepoints": [120083], "characters": "\uD835\uDD13" }, "&pfr;": { "codepoints": [120109], "characters": "\uD835\uDD2D" }, "&Phi;": { "codepoints": [934], "characters": "\u03A6" }, "&phi;": { "codepoints": [966], "characters": "\u03C6" }, "&phiv;": { "codepoints": [981], "characters": "\u03D5" }, "&phmmat;": { "codepoints": [8499], "characters": "\u2133" }, "&phone;": { "codepoints": [9742], "characters": "\u260E" }, "&Pi;": { "codepoints": [928], "characters": "\u03A0" }, "&pi;": { "codepoints": [960], "characters": "\u03C0" }, "&pitchfork;": { "codepoints": [8916], "characters": "\u22D4" }, "&piv;": { "codepoints": [982], "characters": "\u03D6" }, "&planck;": { "codepoints": [8463], "characters": "\u210F" }, "&planckh;": { "codepoints": [8462], "characters": "\u210E" }, "&plankv;": { "codepoints": [8463], "characters": "\u210F" }, "&plusacir;": { "codepoints": [10787], "characters": "\u2A23" }, "&plusb;": { "codepoints": [8862], "characters": "\u229E" }, "&pluscir;": { "codepoints": [10786], "characters": "\u2A22" }, "&plus;": { "codepoints": [43], "characters": "\u002B" }, "&plusdo;": { "codepoints": [8724], "characters": "\u2214" }, "&plusdu;": { "codepoints": [10789], "characters": "\u2A25" }, "&pluse;": { "codepoints": [10866], "characters": "\u2A72" }, "&PlusMinus;": { "codepoints": [177], "characters": "\u00B1" }, "&plusmn;": { "codepoints": [177], "characters": "\u00B1" }, "&plusmn": { "codepoints": [177], "characters": "\u00B1" }, "&plussim;": { "codepoints": [10790], "characters": "\u2A26" }, "&plustwo;": { "codepoints": [10791], "characters": "\u2A27" }, "&pm;": { "codepoints": [177], "characters": "\u00B1" }, "&Poincareplane;": { "codepoints": [8460], "characters": "\u210C" }, "&pointint;": { "codepoints": [10773], "characters": "\u2A15" }, "&popf;": { "codepoints": [120161], "characters": "\uD835\uDD61" }, "&Popf;": { "codepoints": [8473], "characters": "\u2119" }, "&pound;": { "codepoints": [163], "characters": "\u00A3" }, "&pound": { "codepoints": [163], "characters": "\u00A3" }, "&prap;": { "codepoints": [10935], "characters": "\u2AB7" }, "&Pr;": { "codepoints": [10939], "characters": "\u2ABB" }, "&pr;": { "codepoints": [8826], "characters": "\u227A" }, "&prcue;": { "codepoints": [8828], "characters": "\u227C" }, "&precapprox;": { "codepoints": [10935], "characters": "\u2AB7" }, "&prec;": { "codepoints": [8826], "characters": "\u227A" }, "&preccurlyeq;": { "codepoints": [8828], "characters": "\u227C" }, "&Precedes;": { "codepoints": [8826], "characters": "\u227A" }, "&PrecedesEqual;": { "codepoints": [10927], "characters": "\u2AAF" }, "&PrecedesSlantEqual;": { "codepoints": [8828], "characters": "\u227C" }, "&PrecedesTilde;": { "codepoints": [8830], "characters": "\u227E" }, "&preceq;": { "codepoints": [10927], "characters": "\u2AAF" }, "&precnapprox;": { "codepoints": [10937], "characters": "\u2AB9" }, "&precneqq;": { "codepoints": [10933], "characters": "\u2AB5" }, "&precnsim;": { "codepoints": [8936], "characters": "\u22E8" }, "&pre;": { "codepoints": [10927], "characters": "\u2AAF" }, "&prE;": { "codepoints": [10931], "characters": "\u2AB3" }, "&precsim;": { "codepoints": [8830], "characters": "\u227E" }, "&prime;": { "codepoints": [8242], "characters": "\u2032" }, "&Prime;": { "codepoints": [8243], "characters": "\u2033" }, "&primes;": { "codepoints": [8473], "characters": "\u2119" }, "&prnap;": { "codepoints": [10937], "characters": "\u2AB9" }, "&prnE;": { "codepoints": [10933], "characters": "\u2AB5" }, "&prnsim;": { "codepoints": [8936], "characters": "\u22E8" }, "&prod;": { "codepoints": [8719], "characters": "\u220F" }, "&Product;": { "codepoints": [8719], "characters": "\u220F" }, "&profalar;": { "codepoints": [9006], "characters": "\u232E" }, "&profline;": { "codepoints": [8978], "characters": "\u2312" }, "&profsurf;": { "codepoints": [8979], "characters": "\u2313" }, "&prop;": { "codepoints": [8733], "characters": "\u221D" }, "&Proportional;": { "codepoints": [8733], "characters": "\u221D" }, "&Proportion;": { "codepoints": [8759], "characters": "\u2237" }, "&propto;": { "codepoints": [8733], "characters": "\u221D" }, "&prsim;": { "codepoints": [8830], "characters": "\u227E" }, "&prurel;": { "codepoints": [8880], "characters": "\u22B0" }, "&Pscr;": { "codepoints": [119979], "characters": "\uD835\uDCAB" }, "&pscr;": { "codepoints": [120005], "characters": "\uD835\uDCC5" }, "&Psi;": { "codepoints": [936], "characters": "\u03A8" }, "&psi;": { "codepoints": [968], "characters": "\u03C8" }, "&puncsp;": { "codepoints": [8200], "characters": "\u2008" }, "&Qfr;": { "codepoints": [120084], "characters": "\uD835\uDD14" }, "&qfr;": { "codepoints": [120110], "characters": "\uD835\uDD2E" }, "&qint;": { "codepoints": [10764], "characters": "\u2A0C" }, "&qopf;": { "codepoints": [120162], "characters": "\uD835\uDD62" }, "&Qopf;": { "codepoints": [8474], "characters": "\u211A" }, "&qprime;": { "codepoints": [8279], "characters": "\u2057" }, "&Qscr;": { "codepoints": [119980], "characters": "\uD835\uDCAC" }, "&qscr;": { "codepoints": [120006], "characters": "\uD835\uDCC6" }, "&quaternions;": { "codepoints": [8461], "characters": "\u210D" }, "&quatint;": { "codepoints": [10774], "characters": "\u2A16" }, "&quest;": { "codepoints": [63], "characters": "\u003F" }, "&questeq;": { "codepoints": [8799], "characters": "\u225F" }, "&quot;": { "codepoints": [34], "characters": "\u0022" }, "&quot": { "codepoints": [34], "characters": "\u0022" }, "&QUOT;": { "codepoints": [34], "characters": "\u0022" }, "&QUOT": { "codepoints": [34], "characters": "\u0022" }, "&rAarr;": { "codepoints": [8667], "characters": "\u21DB" }, "&race;": { "codepoints": [8765, 817], "characters": "\u223D\u0331" }, "&Racute;": { "codepoints": [340], "characters": "\u0154" }, "&racute;": { "codepoints": [341], "characters": "\u0155" }, "&radic;": { "codepoints": [8730], "characters": "\u221A" }, "&raemptyv;": { "codepoints": [10675], "characters": "\u29B3" }, "&rang;": { "codepoints": [10217], "characters": "\u27E9" }, "&Rang;": { "codepoints": [10219], "characters": "\u27EB" }, "&rangd;": { "codepoints": [10642], "characters": "\u2992" }, "&range;": { "codepoints": [10661], "characters": "\u29A5" }, "&rangle;": { "codepoints": [10217], "characters": "\u27E9" }, "&raquo;": { "codepoints": [187], "characters": "\u00BB" }, "&raquo": { "codepoints": [187], "characters": "\u00BB" }, "&rarrap;": { "codepoints": [10613], "characters": "\u2975" }, "&rarrb;": { "codepoints": [8677], "characters": "\u21E5" }, "&rarrbfs;": { "codepoints": [10528], "characters": "\u2920" }, "&rarrc;": { "codepoints": [10547], "characters": "\u2933" }, "&rarr;": { "codepoints": [8594], "characters": "\u2192" }, "&Rarr;": { "codepoints": [8608], "characters": "\u21A0" }, "&rArr;": { "codepoints": [8658], "characters": "\u21D2" }, "&rarrfs;": { "codepoints": [10526], "characters": "\u291E" }, "&rarrhk;": { "codepoints": [8618], "characters": "\u21AA" }, "&rarrlp;": { "codepoints": [8620], "characters": "\u21AC" }, "&rarrpl;": { "codepoints": [10565], "characters": "\u2945" }, "&rarrsim;": { "codepoints": [10612], "characters": "\u2974" }, "&Rarrtl;": { "codepoints": [10518], "characters": "\u2916" }, "&rarrtl;": { "codepoints": [8611], "characters": "\u21A3" }, "&rarrw;": { "codepoints": [8605], "characters": "\u219D" }, "&ratail;": { "codepoints": [10522], "characters": "\u291A" }, "&rAtail;": { "codepoints": [10524], "characters": "\u291C" }, "&ratio;": { "codepoints": [8758], "characters": "\u2236" }, "&rationals;": { "codepoints": [8474], "characters": "\u211A" }, "&rbarr;": { "codepoints": [10509], "characters": "\u290D" }, "&rBarr;": { "codepoints": [10511], "characters": "\u290F" }, "&RBarr;": { "codepoints": [10512], "characters": "\u2910" }, "&rbbrk;": { "codepoints": [10099], "characters": "\u2773" }, "&rbrace;": { "codepoints": [125], "characters": "\u007D" }, "&rbrack;": { "codepoints": [93], "characters": "\u005D" }, "&rbrke;": { "codepoints": [10636], "characters": "\u298C" }, "&rbrksld;": { "codepoints": [10638], "characters": "\u298E" }, "&rbrkslu;": { "codepoints": [10640], "characters": "\u2990" }, "&Rcaron;": { "codepoints": [344], "characters": "\u0158" }, "&rcaron;": { "codepoints": [345], "characters": "\u0159" }, "&Rcedil;": { "codepoints": [342], "characters": "\u0156" }, "&rcedil;": { "codepoints": [343], "characters": "\u0157" }, "&rceil;": { "codepoints": [8969], "characters": "\u2309" }, "&rcub;": { "codepoints": [125], "characters": "\u007D" }, "&Rcy;": { "codepoints": [1056], "characters": "\u0420" }, "&rcy;": { "codepoints": [1088], "characters": "\u0440" }, "&rdca;": { "codepoints": [10551], "characters": "\u2937" }, "&rdldhar;": { "codepoints": [10601], "characters": "\u2969" }, "&rdquo;": { "codepoints": [8221], "characters": "\u201D" }, "&rdquor;": { "codepoints": [8221], "characters": "\u201D" }, "&rdsh;": { "codepoints": [8627], "characters": "\u21B3" }, "&real;": { "codepoints": [8476], "characters": "\u211C" }, "&realine;": { "codepoints": [8475], "characters": "\u211B" }, "&realpart;": { "codepoints": [8476], "characters": "\u211C" }, "&reals;": { "codepoints": [8477], "characters": "\u211D" }, "&Re;": { "codepoints": [8476], "characters": "\u211C" }, "&rect;": { "codepoints": [9645], "characters": "\u25AD" }, "&reg;": { "codepoints": [174], "characters": "\u00AE" }, "&reg": { "codepoints": [174], "characters": "\u00AE" }, "&REG;": { "codepoints": [174], "characters": "\u00AE" }, "&REG": { "codepoints": [174], "characters": "\u00AE" }, "&ReverseElement;": { "codepoints": [8715], "characters": "\u220B" }, "&ReverseEquilibrium;": { "codepoints": [8651], "characters": "\u21CB" }, "&ReverseUpEquilibrium;": { "codepoints": [10607], "characters": "\u296F" }, "&rfisht;": { "codepoints": [10621], "characters": "\u297D" }, "&rfloor;": { "codepoints": [8971], "characters": "\u230B" }, "&rfr;": { "codepoints": [120111], "characters": "\uD835\uDD2F" }, "&Rfr;": { "codepoints": [8476], "characters": "\u211C" }, "&rHar;": { "codepoints": [10596], "characters": "\u2964" }, "&rhard;": { "codepoints": [8641], "characters": "\u21C1" }, "&rharu;": { "codepoints": [8640], "characters": "\u21C0" }, "&rharul;": { "codepoints": [10604], "characters": "\u296C" }, "&Rho;": { "codepoints": [929], "characters": "\u03A1" }, "&rho;": { "codepoints": [961], "characters": "\u03C1" }, "&rhov;": { "codepoints": [1009], "characters": "\u03F1" }, "&RightAngleBracket;": { "codepoints": [10217], "characters": "\u27E9" }, "&RightArrowBar;": { "codepoints": [8677], "characters": "\u21E5" }, "&rightarrow;": { "codepoints": [8594], "characters": "\u2192" }, "&RightArrow;": { "codepoints": [8594], "characters": "\u2192" }, "&Rightarrow;": { "codepoints": [8658], "characters": "\u21D2" }, "&RightArrowLeftArrow;": { "codepoints": [8644], "characters": "\u21C4" }, "&rightarrowtail;": { "codepoints": [8611], "characters": "\u21A3" }, "&RightCeiling;": { "codepoints": [8969], "characters": "\u2309" }, "&RightDoubleBracket;": { "codepoints": [10215], "characters": "\u27E7" }, "&RightDownTeeVector;": { "codepoints": [10589], "characters": "\u295D" }, "&RightDownVectorBar;": { "codepoints": [10581], "characters": "\u2955" }, "&RightDownVector;": { "codepoints": [8642], "characters": "\u21C2" }, "&RightFloor;": { "codepoints": [8971], "characters": "\u230B" }, "&rightharpoondown;": { "codepoints": [8641], "characters": "\u21C1" }, "&rightharpoonup;": { "codepoints": [8640], "characters": "\u21C0" }, "&rightleftarrows;": { "codepoints": [8644], "characters": "\u21C4" }, "&rightleftharpoons;": { "codepoints": [8652], "characters": "\u21CC" }, "&rightrightarrows;": { "codepoints": [8649], "characters": "\u21C9" }, "&rightsquigarrow;": { "codepoints": [8605], "characters": "\u219D" }, "&RightTeeArrow;": { "codepoints": [8614], "characters": "\u21A6" }, "&RightTee;": { "codepoints": [8866], "characters": "\u22A2" }, "&RightTeeVector;": { "codepoints": [10587], "characters": "\u295B" }, "&rightthreetimes;": { "codepoints": [8908], "characters": "\u22CC" }, "&RightTriangleBar;": { "codepoints": [10704], "characters": "\u29D0" }, "&RightTriangle;": { "codepoints": [8883], "characters": "\u22B3" }, "&RightTriangleEqual;": { "codepoints": [8885], "characters": "\u22B5" }, "&RightUpDownVector;": { "codepoints": [10575], "characters": "\u294F" }, "&RightUpTeeVector;": { "codepoints": [10588], "characters": "\u295C" }, "&RightUpVectorBar;": { "codepoints": [10580], "characters": "\u2954" }, "&RightUpVector;": { "codepoints": [8638], "characters": "\u21BE" }, "&RightVectorBar;": { "codepoints": [10579], "characters": "\u2953" }, "&RightVector;": { "codepoints": [8640], "characters": "\u21C0" }, "&ring;": { "codepoints": [730], "characters": "\u02DA" }, "&risingdotseq;": { "codepoints": [8787], "characters": "\u2253" }, "&rlarr;": { "codepoints": [8644], "characters": "\u21C4" }, "&rlhar;": { "codepoints": [8652], "characters": "\u21CC" }, "&rlm;": { "codepoints": [8207], "characters": "\u200F" }, "&rmoustache;": { "codepoints": [9137], "characters": "\u23B1" }, "&rmoust;": { "codepoints": [9137], "characters": "\u23B1" }, "&rnmid;": { "codepoints": [10990], "characters": "\u2AEE" }, "&roang;": { "codepoints": [10221], "characters": "\u27ED" }, "&roarr;": { "codepoints": [8702], "characters": "\u21FE" }, "&robrk;": { "codepoints": [10215], "characters": "\u27E7" }, "&ropar;": { "codepoints": [10630], "characters": "\u2986" }, "&ropf;": { "codepoints": [120163], "characters": "\uD835\uDD63" }, "&Ropf;": { "codepoints": [8477], "characters": "\u211D" }, "&roplus;": { "codepoints": [10798], "characters": "\u2A2E" }, "&rotimes;": { "codepoints": [10805], "characters": "\u2A35" }, "&RoundImplies;": { "codepoints": [10608], "characters": "\u2970" }, "&rpar;": { "codepoints": [41], "characters": "\u0029" }, "&rpargt;": { "codepoints": [10644], "characters": "\u2994" }, "&rppolint;": { "codepoints": [10770], "characters": "\u2A12" }, "&rrarr;": { "codepoints": [8649], "characters": "\u21C9" }, "&Rrightarrow;": { "codepoints": [8667], "characters": "\u21DB" }, "&rsaquo;": { "codepoints": [8250], "characters": "\u203A" }, "&rscr;": { "codepoints": [120007], "characters": "\uD835\uDCC7" }, "&Rscr;": { "codepoints": [8475], "characters": "\u211B" }, "&rsh;": { "codepoints": [8625], "characters": "\u21B1" }, "&Rsh;": { "codepoints": [8625], "characters": "\u21B1" }, "&rsqb;": { "codepoints": [93], "characters": "\u005D" }, "&rsquo;": { "codepoints": [8217], "characters": "\u2019" }, "&rsquor;": { "codepoints": [8217], "characters": "\u2019" }, "&rthree;": { "codepoints": [8908], "characters": "\u22CC" }, "&rtimes;": { "codepoints": [8906], "characters": "\u22CA" }, "&rtri;": { "codepoints": [9657], "characters": "\u25B9" }, "&rtrie;": { "codepoints": [8885], "characters": "\u22B5" }, "&rtrif;": { "codepoints": [9656], "characters": "\u25B8" }, "&rtriltri;": { "codepoints": [10702], "characters": "\u29CE" }, "&RuleDelayed;": { "codepoints": [10740], "characters": "\u29F4" }, "&ruluhar;": { "codepoints": [10600], "characters": "\u2968" }, "&rx;": { "codepoints": [8478], "characters": "\u211E" }, "&Sacute;": { "codepoints": [346], "characters": "\u015A" }, "&sacute;": { "codepoints": [347], "characters": "\u015B" }, "&sbquo;": { "codepoints": [8218], "characters": "\u201A" }, "&scap;": { "codepoints": [10936], "characters": "\u2AB8" }, "&Scaron;": { "codepoints": [352], "characters": "\u0160" }, "&scaron;": { "codepoints": [353], "characters": "\u0161" }, "&Sc;": { "codepoints": [10940], "characters": "\u2ABC" }, "&sc;": { "codepoints": [8827], "characters": "\u227B" }, "&sccue;": { "codepoints": [8829], "characters": "\u227D" }, "&sce;": { "codepoints": [10928], "characters": "\u2AB0" }, "&scE;": { "codepoints": [10932], "characters": "\u2AB4" }, "&Scedil;": { "codepoints": [350], "characters": "\u015E" }, "&scedil;": { "codepoints": [351], "characters": "\u015F" }, "&Scirc;": { "codepoints": [348], "characters": "\u015C" }, "&scirc;": { "codepoints": [349], "characters": "\u015D" }, "&scnap;": { "codepoints": [10938], "characters": "\u2ABA" }, "&scnE;": { "codepoints": [10934], "characters": "\u2AB6" }, "&scnsim;": { "codepoints": [8937], "characters": "\u22E9" }, "&scpolint;": { "codepoints": [10771], "characters": "\u2A13" }, "&scsim;": { "codepoints": [8831], "characters": "\u227F" }, "&Scy;": { "codepoints": [1057], "characters": "\u0421" }, "&scy;": { "codepoints": [1089], "characters": "\u0441" }, "&sdotb;": { "codepoints": [8865], "characters": "\u22A1" }, "&sdot;": { "codepoints": [8901], "characters": "\u22C5" }, "&sdote;": { "codepoints": [10854], "characters": "\u2A66" }, "&searhk;": { "codepoints": [10533], "characters": "\u2925" }, "&searr;": { "codepoints": [8600], "characters": "\u2198" }, "&seArr;": { "codepoints": [8664], "characters": "\u21D8" }, "&searrow;": { "codepoints": [8600], "characters": "\u2198" }, "&sect;": { "codepoints": [167], "characters": "\u00A7" }, "&sect": { "codepoints": [167], "characters": "\u00A7" }, "&semi;": { "codepoints": [59], "characters": "\u003B" }, "&seswar;": { "codepoints": [10537], "characters": "\u2929" }, "&setminus;": { "codepoints": [8726], "characters": "\u2216" }, "&setmn;": { "codepoints": [8726], "characters": "\u2216" }, "&sext;": { "codepoints": [10038], "characters": "\u2736" }, "&Sfr;": { "codepoints": [120086], "characters": "\uD835\uDD16" }, "&sfr;": { "codepoints": [120112], "characters": "\uD835\uDD30" }, "&sfrown;": { "codepoints": [8994], "characters": "\u2322" }, "&sharp;": { "codepoints": [9839], "characters": "\u266F" }, "&SHCHcy;": { "codepoints": [1065], "characters": "\u0429" }, "&shchcy;": { "codepoints": [1097], "characters": "\u0449" }, "&SHcy;": { "codepoints": [1064], "characters": "\u0428" }, "&shcy;": { "codepoints": [1096], "characters": "\u0448" }, "&ShortDownArrow;": { "codepoints": [8595], "characters": "\u2193" }, "&ShortLeftArrow;": { "codepoints": [8592], "characters": "\u2190" }, "&shortmid;": { "codepoints": [8739], "characters": "\u2223" }, "&shortparallel;": { "codepoints": [8741], "characters": "\u2225" }, "&ShortRightArrow;": { "codepoints": [8594], "characters": "\u2192" }, "&ShortUpArrow;": { "codepoints": [8593], "characters": "\u2191" }, "&shy;": { "codepoints": [173], "characters": "\u00AD" }, "&shy": { "codepoints": [173], "characters": "\u00AD" }, "&Sigma;": { "codepoints": [931], "characters": "\u03A3" }, "&sigma;": { "codepoints": [963], "characters": "\u03C3" }, "&sigmaf;": { "codepoints": [962], "characters": "\u03C2" }, "&sigmav;": { "codepoints": [962], "characters": "\u03C2" }, "&sim;": { "codepoints": [8764], "characters": "\u223C" }, "&simdot;": { "codepoints": [10858], "characters": "\u2A6A" }, "&sime;": { "codepoints": [8771], "characters": "\u2243" }, "&simeq;": { "codepoints": [8771], "characters": "\u2243" }, "&simg;": { "codepoints": [10910], "characters": "\u2A9E" }, "&simgE;": { "codepoints": [10912], "characters": "\u2AA0" }, "&siml;": { "codepoints": [10909], "characters": "\u2A9D" }, "&simlE;": { "codepoints": [10911], "characters": "\u2A9F" }, "&simne;": { "codepoints": [8774], "characters": "\u2246" }, "&simplus;": { "codepoints": [10788], "characters": "\u2A24" }, "&simrarr;": { "codepoints": [10610], "characters": "\u2972" }, "&slarr;": { "codepoints": [8592], "characters": "\u2190" }, "&SmallCircle;": { "codepoints": [8728], "characters": "\u2218" }, "&smallsetminus;": { "codepoints": [8726], "characters": "\u2216" }, "&smashp;": { "codepoints": [10803], "characters": "\u2A33" }, "&smeparsl;": { "codepoints": [10724], "characters": "\u29E4" }, "&smid;": { "codepoints": [8739], "characters": "\u2223" }, "&smile;": { "codepoints": [8995], "characters": "\u2323" }, "&smt;": { "codepoints": [10922], "characters": "\u2AAA" }, "&smte;": { "codepoints": [10924], "characters": "\u2AAC" }, "&smtes;": { "codepoints": [10924, 65024], "characters": "\u2AAC\uFE00" }, "&SOFTcy;": { "codepoints": [1068], "characters": "\u042C" }, "&softcy;": { "codepoints": [1100], "characters": "\u044C" }, "&solbar;": { "codepoints": [9023], "characters": "\u233F" }, "&solb;": { "codepoints": [10692], "characters": "\u29C4" }, "&sol;": { "codepoints": [47], "characters": "\u002F" }, "&Sopf;": { "codepoints": [120138], "characters": "\uD835\uDD4A" }, "&sopf;": { "codepoints": [120164], "characters": "\uD835\uDD64" }, "&spades;": { "codepoints": [9824], "characters": "\u2660" }, "&spadesuit;": { "codepoints": [9824], "characters": "\u2660" }, "&spar;": { "codepoints": [8741], "characters": "\u2225" }, "&sqcap;": { "codepoints": [8851], "characters": "\u2293" }, "&sqcaps;": { "codepoints": [8851, 65024], "characters": "\u2293\uFE00" }, "&sqcup;": { "codepoints": [8852], "characters": "\u2294" }, "&sqcups;": { "codepoints": [8852, 65024], "characters": "\u2294\uFE00" }, "&Sqrt;": { "codepoints": [8730], "characters": "\u221A" }, "&sqsub;": { "codepoints": [8847], "characters": "\u228F" }, "&sqsube;": { "codepoints": [8849], "characters": "\u2291" }, "&sqsubset;": { "codepoints": [8847], "characters": "\u228F" }, "&sqsubseteq;": { "codepoints": [8849], "characters": "\u2291" }, "&sqsup;": { "codepoints": [8848], "characters": "\u2290" }, "&sqsupe;": { "codepoints": [8850], "characters": "\u2292" }, "&sqsupset;": { "codepoints": [8848], "characters": "\u2290" }, "&sqsupseteq;": { "codepoints": [8850], "characters": "\u2292" }, "&square;": { "codepoints": [9633], "characters": "\u25A1" }, "&Square;": { "codepoints": [9633], "characters": "\u25A1" }, "&SquareIntersection;": { "codepoints": [8851], "characters": "\u2293" }, "&SquareSubset;": { "codepoints": [8847], "characters": "\u228F" }, "&SquareSubsetEqual;": { "codepoints": [8849], "characters": "\u2291" }, "&SquareSuperset;": { "codepoints": [8848], "characters": "\u2290" }, "&SquareSupersetEqual;": { "codepoints": [8850], "characters": "\u2292" }, "&SquareUnion;": { "codepoints": [8852], "characters": "\u2294" }, "&squarf;": { "codepoints": [9642], "characters": "\u25AA" }, "&squ;": { "codepoints": [9633], "characters": "\u25A1" }, "&squf;": { "codepoints": [9642], "characters": "\u25AA" }, "&srarr;": { "codepoints": [8594], "characters": "\u2192" }, "&Sscr;": { "codepoints": [119982], "characters": "\uD835\uDCAE" }, "&sscr;": { "codepoints": [120008], "characters": "\uD835\uDCC8" }, "&ssetmn;": { "codepoints": [8726], "characters": "\u2216" }, "&ssmile;": { "codepoints": [8995], "characters": "\u2323" }, "&sstarf;": { "codepoints": [8902], "characters": "\u22C6" }, "&Star;": { "codepoints": [8902], "characters": "\u22C6" }, "&star;": { "codepoints": [9734], "characters": "\u2606" }, "&starf;": { "codepoints": [9733], "characters": "\u2605" }, "&straightepsilon;": { "codepoints": [1013], "characters": "\u03F5" }, "&straightphi;": { "codepoints": [981], "characters": "\u03D5" }, "&strns;": { "codepoints": [175], "characters": "\u00AF" }, "&sub;": { "codepoints": [8834], "characters": "\u2282" }, "&Sub;": { "codepoints": [8912], "characters": "\u22D0" }, "&subdot;": { "codepoints": [10941], "characters": "\u2ABD" }, "&subE;": { "codepoints": [10949], "characters": "\u2AC5" }, "&sube;": { "codepoints": [8838], "characters": "\u2286" }, "&subedot;": { "codepoints": [10947], "characters": "\u2AC3" }, "&submult;": { "codepoints": [10945], "characters": "\u2AC1" }, "&subnE;": { "codepoints": [10955], "characters": "\u2ACB" }, "&subne;": { "codepoints": [8842], "characters": "\u228A" }, "&subplus;": { "codepoints": [10943], "characters": "\u2ABF" }, "&subrarr;": { "codepoints": [10617], "characters": "\u2979" }, "&subset;": { "codepoints": [8834], "characters": "\u2282" }, "&Subset;": { "codepoints": [8912], "characters": "\u22D0" }, "&subseteq;": { "codepoints": [8838], "characters": "\u2286" }, "&subseteqq;": { "codepoints": [10949], "characters": "\u2AC5" }, "&SubsetEqual;": { "codepoints": [8838], "characters": "\u2286" }, "&subsetneq;": { "codepoints": [8842], "characters": "\u228A" }, "&subsetneqq;": { "codepoints": [10955], "characters": "\u2ACB" }, "&subsim;": { "codepoints": [10951], "characters": "\u2AC7" }, "&subsub;": { "codepoints": [10965], "characters": "\u2AD5" }, "&subsup;": { "codepoints": [10963], "characters": "\u2AD3" }, "&succapprox;": { "codepoints": [10936], "characters": "\u2AB8" }, "&succ;": { "codepoints": [8827], "characters": "\u227B" }, "&succcurlyeq;": { "codepoints": [8829], "characters": "\u227D" }, "&Succeeds;": { "codepoints": [8827], "characters": "\u227B" }, "&SucceedsEqual;": { "codepoints": [10928], "characters": "\u2AB0" }, "&SucceedsSlantEqual;": { "codepoints": [8829], "characters": "\u227D" }, "&SucceedsTilde;": { "codepoints": [8831], "characters": "\u227F" }, "&succeq;": { "codepoints": [10928], "characters": "\u2AB0" }, "&succnapprox;": { "codepoints": [10938], "characters": "\u2ABA" }, "&succneqq;": { "codepoints": [10934], "characters": "\u2AB6" }, "&succnsim;": { "codepoints": [8937], "characters": "\u22E9" }, "&succsim;": { "codepoints": [8831], "characters": "\u227F" }, "&SuchThat;": { "codepoints": [8715], "characters": "\u220B" }, "&sum;": { "codepoints": [8721], "characters": "\u2211" }, "&Sum;": { "codepoints": [8721], "characters": "\u2211" }, "&sung;": { "codepoints": [9834], "characters": "\u266A" }, "&sup1;": { "codepoints": [185], "characters": "\u00B9" }, "&sup1": { "codepoints": [185], "characters": "\u00B9" }, "&sup2;": { "codepoints": [178], "characters": "\u00B2" }, "&sup2": { "codepoints": [178], "characters": "\u00B2" }, "&sup3;": { "codepoints": [179], "characters": "\u00B3" }, "&sup3": { "codepoints": [179], "characters": "\u00B3" }, "&sup;": { "codepoints": [8835], "characters": "\u2283" }, "&Sup;": { "codepoints": [8913], "characters": "\u22D1" }, "&supdot;": { "codepoints": [10942], "characters": "\u2ABE" }, "&supdsub;": { "codepoints": [10968], "characters": "\u2AD8" }, "&supE;": { "codepoints": [10950], "characters": "\u2AC6" }, "&supe;": { "codepoints": [8839], "characters": "\u2287" }, "&supedot;": { "codepoints": [10948], "characters": "\u2AC4" }, "&Superset;": { "codepoints": [8835], "characters": "\u2283" }, "&SupersetEqual;": { "codepoints": [8839], "characters": "\u2287" }, "&suphsol;": { "codepoints": [10185], "characters": "\u27C9" }, "&suphsub;": { "codepoints": [10967], "characters": "\u2AD7" }, "&suplarr;": { "codepoints": [10619], "characters": "\u297B" }, "&supmult;": { "codepoints": [10946], "characters": "\u2AC2" }, "&supnE;": { "codepoints": [10956], "characters": "\u2ACC" }, "&supne;": { "codepoints": [8843], "characters": "\u228B" }, "&supplus;": { "codepoints": [10944], "characters": "\u2AC0" }, "&supset;": { "codepoints": [8835], "characters": "\u2283" }, "&Supset;": { "codepoints": [8913], "characters": "\u22D1" }, "&supseteq;": { "codepoints": [8839], "characters": "\u2287" }, "&supseteqq;": { "codepoints": [10950], "characters": "\u2AC6" }, "&supsetneq;": { "codepoints": [8843], "characters": "\u228B" }, "&supsetneqq;": { "codepoints": [10956], "characters": "\u2ACC" }, "&supsim;": { "codepoints": [10952], "characters": "\u2AC8" }, "&supsub;": { "codepoints": [10964], "characters": "\u2AD4" }, "&supsup;": { "codepoints": [10966], "characters": "\u2AD6" }, "&swarhk;": { "codepoints": [10534], "characters": "\u2926" }, "&swarr;": { "codepoints": [8601], "characters": "\u2199" }, "&swArr;": { "codepoints": [8665], "characters": "\u21D9" }, "&swarrow;": { "codepoints": [8601], "characters": "\u2199" }, "&swnwar;": { "codepoints": [10538], "characters": "\u292A" }, "&szlig;": { "codepoints": [223], "characters": "\u00DF" }, "&szlig": { "codepoints": [223], "characters": "\u00DF" }, "&Tab;": { "codepoints": [9], "characters": "\u0009" }, "&target;": { "codepoints": [8982], "characters": "\u2316" }, "&Tau;": { "codepoints": [932], "characters": "\u03A4" }, "&tau;": { "codepoints": [964], "characters": "\u03C4" }, "&tbrk;": { "codepoints": [9140], "characters": "\u23B4" }, "&Tcaron;": { "codepoints": [356], "characters": "\u0164" }, "&tcaron;": { "codepoints": [357], "characters": "\u0165" }, "&Tcedil;": { "codepoints": [354], "characters": "\u0162" }, "&tcedil;": { "codepoints": [355], "characters": "\u0163" }, "&Tcy;": { "codepoints": [1058], "characters": "\u0422" }, "&tcy;": { "codepoints": [1090], "characters": "\u0442" }, "&tdot;": { "codepoints": [8411], "characters": "\u20DB" }, "&telrec;": { "codepoints": [8981], "characters": "\u2315" }, "&Tfr;": { "codepoints": [120087], "characters": "\uD835\uDD17" }, "&tfr;": { "codepoints": [120113], "characters": "\uD835\uDD31" }, "&there4;": { "codepoints": [8756], "characters": "\u2234" }, "&therefore;": { "codepoints": [8756], "characters": "\u2234" }, "&Therefore;": { "codepoints": [8756], "characters": "\u2234" }, "&Theta;": { "codepoints": [920], "characters": "\u0398" }, "&theta;": { "codepoints": [952], "characters": "\u03B8" }, "&thetasym;": { "codepoints": [977], "characters": "\u03D1" }, "&thetav;": { "codepoints": [977], "characters": "\u03D1" }, "&thickapprox;": { "codepoints": [8776], "characters": "\u2248" }, "&thicksim;": { "codepoints": [8764], "characters": "\u223C" }, "&ThickSpace;": { "codepoints": [8287, 8202], "characters": "\u205F\u200A" }, "&ThinSpace;": { "codepoints": [8201], "characters": "\u2009" }, "&thinsp;": { "codepoints": [8201], "characters": "\u2009" }, "&thkap;": { "codepoints": [8776], "characters": "\u2248" }, "&thksim;": { "codepoints": [8764], "characters": "\u223C" }, "&THORN;": { "codepoints": [222], "characters": "\u00DE" }, "&THORN": { "codepoints": [222], "characters": "\u00DE" }, "&thorn;": { "codepoints": [254], "characters": "\u00FE" }, "&thorn": { "codepoints": [254], "characters": "\u00FE" }, "&tilde;": { "codepoints": [732], "characters": "\u02DC" }, "&Tilde;": { "codepoints": [8764], "characters": "\u223C" }, "&TildeEqual;": { "codepoints": [8771], "characters": "\u2243" }, "&TildeFullEqual;": { "codepoints": [8773], "characters": "\u2245" }, "&TildeTilde;": { "codepoints": [8776], "characters": "\u2248" }, "&timesbar;": { "codepoints": [10801], "characters": "\u2A31" }, "&timesb;": { "codepoints": [8864], "characters": "\u22A0" }, "&times;": { "codepoints": [215], "characters": "\u00D7" }, "&times": { "codepoints": [215], "characters": "\u00D7" }, "&timesd;": { "codepoints": [10800], "characters": "\u2A30" }, "&tint;": { "codepoints": [8749], "characters": "\u222D" }, "&toea;": { "codepoints": [10536], "characters": "\u2928" }, "&topbot;": { "codepoints": [9014], "characters": "\u2336" }, "&topcir;": { "codepoints": [10993], "characters": "\u2AF1" }, "&top;": { "codepoints": [8868], "characters": "\u22A4" }, "&Topf;": { "codepoints": [120139], "characters": "\uD835\uDD4B" }, "&topf;": { "codepoints": [120165], "characters": "\uD835\uDD65" }, "&topfork;": { "codepoints": [10970], "characters": "\u2ADA" }, "&tosa;": { "codepoints": [10537], "characters": "\u2929" }, "&tprime;": { "codepoints": [8244], "characters": "\u2034" }, "&trade;": { "codepoints": [8482], "characters": "\u2122" }, "&TRADE;": { "codepoints": [8482], "characters": "\u2122" }, "&triangle;": { "codepoints": [9653], "characters": "\u25B5" }, "&triangledown;": { "codepoints": [9663], "characters": "\u25BF" }, "&triangleleft;": { "codepoints": [9667], "characters": "\u25C3" }, "&trianglelefteq;": { "codepoints": [8884], "characters": "\u22B4" }, "&triangleq;": { "codepoints": [8796], "characters": "\u225C" }, "&triangleright;": { "codepoints": [9657], "characters": "\u25B9" }, "&trianglerighteq;": { "codepoints": [8885], "characters": "\u22B5" }, "&tridot;": { "codepoints": [9708], "characters": "\u25EC" }, "&trie;": { "codepoints": [8796], "characters": "\u225C" }, "&triminus;": { "codepoints": [10810], "characters": "\u2A3A" }, "&TripleDot;": { "codepoints": [8411], "characters": "\u20DB" }, "&triplus;": { "codepoints": [10809], "characters": "\u2A39" }, "&trisb;": { "codepoints": [10701], "characters": "\u29CD" }, "&tritime;": { "codepoints": [10811], "characters": "\u2A3B" }, "&trpezium;": { "codepoints": [9186], "characters": "\u23E2" }, "&Tscr;": { "codepoints": [119983], "characters": "\uD835\uDCAF" }, "&tscr;": { "codepoints": [120009], "characters": "\uD835\uDCC9" }, "&TScy;": { "codepoints": [1062], "characters": "\u0426" }, "&tscy;": { "codepoints": [1094], "characters": "\u0446" }, "&TSHcy;": { "codepoints": [1035], "characters": "\u040B" }, "&tshcy;": { "codepoints": [1115], "characters": "\u045B" }, "&Tstrok;": { "codepoints": [358], "characters": "\u0166" }, "&tstrok;": { "codepoints": [359], "characters": "\u0167" }, "&twixt;": { "codepoints": [8812], "characters": "\u226C" }, "&twoheadleftarrow;": { "codepoints": [8606], "characters": "\u219E" }, "&twoheadrightarrow;": { "codepoints": [8608], "characters": "\u21A0" }, "&Uacute;": { "codepoints": [218], "characters": "\u00DA" }, "&Uacute": { "codepoints": [218], "characters": "\u00DA" }, "&uacute;": { "codepoints": [250], "characters": "\u00FA" }, "&uacute": { "codepoints": [250], "characters": "\u00FA" }, "&uarr;": { "codepoints": [8593], "characters": "\u2191" }, "&Uarr;": { "codepoints": [8607], "characters": "\u219F" }, "&uArr;": { "codepoints": [8657], "characters": "\u21D1" }, "&Uarrocir;": { "codepoints": [10569], "characters": "\u2949" }, "&Ubrcy;": { "codepoints": [1038], "characters": "\u040E" }, "&ubrcy;": { "codepoints": [1118], "characters": "\u045E" }, "&Ubreve;": { "codepoints": [364], "characters": "\u016C" }, "&ubreve;": { "codepoints": [365], "characters": "\u016D" }, "&Ucirc;": { "codepoints": [219], "characters": "\u00DB" }, "&Ucirc": { "codepoints": [219], "characters": "\u00DB" }, "&ucirc;": { "codepoints": [251], "characters": "\u00FB" }, "&ucirc": { "codepoints": [251], "characters": "\u00FB" }, "&Ucy;": { "codepoints": [1059], "characters": "\u0423" }, "&ucy;": { "codepoints": [1091], "characters": "\u0443" }, "&udarr;": { "codepoints": [8645], "characters": "\u21C5" }, "&Udblac;": { "codepoints": [368], "characters": "\u0170" }, "&udblac;": { "codepoints": [369], "characters": "\u0171" }, "&udhar;": { "codepoints": [10606], "characters": "\u296E" }, "&ufisht;": { "codepoints": [10622], "characters": "\u297E" }, "&Ufr;": { "codepoints": [120088], "characters": "\uD835\uDD18" }, "&ufr;": { "codepoints": [120114], "characters": "\uD835\uDD32" }, "&Ugrave;": { "codepoints": [217], "characters": "\u00D9" }, "&Ugrave": { "codepoints": [217], "characters": "\u00D9" }, "&ugrave;": { "codepoints": [249], "characters": "\u00F9" }, "&ugrave": { "codepoints": [249], "characters": "\u00F9" }, "&uHar;": { "codepoints": [10595], "characters": "\u2963" }, "&uharl;": { "codepoints": [8639], "characters": "\u21BF" }, "&uharr;": { "codepoints": [8638], "characters": "\u21BE" }, "&uhblk;": { "codepoints": [9600], "characters": "\u2580" }, "&ulcorn;": { "codepoints": [8988], "characters": "\u231C" }, "&ulcorner;": { "codepoints": [8988], "characters": "\u231C" }, "&ulcrop;": { "codepoints": [8975], "characters": "\u230F" }, "&ultri;": { "codepoints": [9720], "characters": "\u25F8" }, "&Umacr;": { "codepoints": [362], "characters": "\u016A" }, "&umacr;": { "codepoints": [363], "characters": "\u016B" }, "&uml;": { "codepoints": [168], "characters": "\u00A8" }, "&uml": { "codepoints": [168], "characters": "\u00A8" }, "&UnderBar;": { "codepoints": [95], "characters": "\u005F" }, "&UnderBrace;": { "codepoints": [9183], "characters": "\u23DF" }, "&UnderBracket;": { "codepoints": [9141], "characters": "\u23B5" }, "&UnderParenthesis;": { "codepoints": [9181], "characters": "\u23DD" }, "&Union;": { "codepoints": [8899], "characters": "\u22C3" }, "&UnionPlus;": { "codepoints": [8846], "characters": "\u228E" }, "&Uogon;": { "codepoints": [370], "characters": "\u0172" }, "&uogon;": { "codepoints": [371], "characters": "\u0173" }, "&Uopf;": { "codepoints": [120140], "characters": "\uD835\uDD4C" }, "&uopf;": { "codepoints": [120166], "characters": "\uD835\uDD66" }, "&UpArrowBar;": { "codepoints": [10514], "characters": "\u2912" }, "&uparrow;": { "codepoints": [8593], "characters": "\u2191" }, "&UpArrow;": { "codepoints": [8593], "characters": "\u2191" }, "&Uparrow;": { "codepoints": [8657], "characters": "\u21D1" }, "&UpArrowDownArrow;": { "codepoints": [8645], "characters": "\u21C5" }, "&updownarrow;": { "codepoints": [8597], "characters": "\u2195" }, "&UpDownArrow;": { "codepoints": [8597], "characters": "\u2195" }, "&Updownarrow;": { "codepoints": [8661], "characters": "\u21D5" }, "&UpEquilibrium;": { "codepoints": [10606], "characters": "\u296E" }, "&upharpoonleft;": { "codepoints": [8639], "characters": "\u21BF" }, "&upharpoonright;": { "codepoints": [8638], "characters": "\u21BE" }, "&uplus;": { "codepoints": [8846], "characters": "\u228E" }, "&UpperLeftArrow;": { "codepoints": [8598], "characters": "\u2196" }, "&UpperRightArrow;": { "codepoints": [8599], "characters": "\u2197" }, "&upsi;": { "codepoints": [965], "characters": "\u03C5" }, "&Upsi;": { "codepoints": [978], "characters": "\u03D2" }, "&upsih;": { "codepoints": [978], "characters": "\u03D2" }, "&Upsilon;": { "codepoints": [933], "characters": "\u03A5" }, "&upsilon;": { "codepoints": [965], "characters": "\u03C5" }, "&UpTeeArrow;": { "codepoints": [8613], "characters": "\u21A5" }, "&UpTee;": { "codepoints": [8869], "characters": "\u22A5" }, "&upuparrows;": { "codepoints": [8648], "characters": "\u21C8" }, "&urcorn;": { "codepoints": [8989], "characters": "\u231D" }, "&urcorner;": { "codepoints": [8989], "characters": "\u231D" }, "&urcrop;": { "codepoints": [8974], "characters": "\u230E" }, "&Uring;": { "codepoints": [366], "characters": "\u016E" }, "&uring;": { "codepoints": [367], "characters": "\u016F" }, "&urtri;": { "codepoints": [9721], "characters": "\u25F9" }, "&Uscr;": { "codepoints": [119984], "characters": "\uD835\uDCB0" }, "&uscr;": { "codepoints": [120010], "characters": "\uD835\uDCCA" }, "&utdot;": { "codepoints": [8944], "characters": "\u22F0" }, "&Utilde;": { "codepoints": [360], "characters": "\u0168" }, "&utilde;": { "codepoints": [361], "characters": "\u0169" }, "&utri;": { "codepoints": [9653], "characters": "\u25B5" }, "&utrif;": { "codepoints": [9652], "characters": "\u25B4" }, "&uuarr;": { "codepoints": [8648], "characters": "\u21C8" }, "&Uuml;": { "codepoints": [220], "characters": "\u00DC" }, "&Uuml": { "codepoints": [220], "characters": "\u00DC" }, "&uuml;": { "codepoints": [252], "characters": "\u00FC" }, "&uuml": { "codepoints": [252], "characters": "\u00FC" }, "&uwangle;": { "codepoints": [10663], "characters": "\u29A7" }, "&vangrt;": { "codepoints": [10652], "characters": "\u299C" }, "&varepsilon;": { "codepoints": [1013], "characters": "\u03F5" }, "&varkappa;": { "codepoints": [1008], "characters": "\u03F0" }, "&varnothing;": { "codepoints": [8709], "characters": "\u2205" }, "&varphi;": { "codepoints": [981], "characters": "\u03D5" }, "&varpi;": { "codepoints": [982], "characters": "\u03D6" }, "&varpropto;": { "codepoints": [8733], "characters": "\u221D" }, "&varr;": { "codepoints": [8597], "characters": "\u2195" }, "&vArr;": { "codepoints": [8661], "characters": "\u21D5" }, "&varrho;": { "codepoints": [1009], "characters": "\u03F1" }, "&varsigma;": { "codepoints": [962], "characters": "\u03C2" }, "&varsubsetneq;": { "codepoints": [8842, 65024], "characters": "\u228A\uFE00" }, "&varsubsetneqq;": { "codepoints": [10955, 65024], "characters": "\u2ACB\uFE00" }, "&varsupsetneq;": { "codepoints": [8843, 65024], "characters": "\u228B\uFE00" }, "&varsupsetneqq;": { "codepoints": [10956, 65024], "characters": "\u2ACC\uFE00" }, "&vartheta;": { "codepoints": [977], "characters": "\u03D1" }, "&vartriangleleft;": { "codepoints": [8882], "characters": "\u22B2" }, "&vartriangleright;": { "codepoints": [8883], "characters": "\u22B3" }, "&vBar;": { "codepoints": [10984], "characters": "\u2AE8" }, "&Vbar;": { "codepoints": [10987], "characters": "\u2AEB" }, "&vBarv;": { "codepoints": [10985], "characters": "\u2AE9" }, "&Vcy;": { "codepoints": [1042], "characters": "\u0412" }, "&vcy;": { "codepoints": [1074], "characters": "\u0432" }, "&vdash;": { "codepoints": [8866], "characters": "\u22A2" }, "&vDash;": { "codepoints": [8872], "characters": "\u22A8" }, "&Vdash;": { "codepoints": [8873], "characters": "\u22A9" }, "&VDash;": { "codepoints": [8875], "characters": "\u22AB" }, "&Vdashl;": { "codepoints": [10982], "characters": "\u2AE6" }, "&veebar;": { "codepoints": [8891], "characters": "\u22BB" }, "&vee;": { "codepoints": [8744], "characters": "\u2228" }, "&Vee;": { "codepoints": [8897], "characters": "\u22C1" }, "&veeeq;": { "codepoints": [8794], "characters": "\u225A" }, "&vellip;": { "codepoints": [8942], "characters": "\u22EE" }, "&verbar;": { "codepoints": [124], "characters": "\u007C" }, "&Verbar;": { "codepoints": [8214], "characters": "\u2016" }, "&vert;": { "codepoints": [124], "characters": "\u007C" }, "&Vert;": { "codepoints": [8214], "characters": "\u2016" }, "&VerticalBar;": { "codepoints": [8739], "characters": "\u2223" }, "&VerticalLine;": { "codepoints": [124], "characters": "\u007C" }, "&VerticalSeparator;": { "codepoints": [10072], "characters": "\u2758" }, "&VerticalTilde;": { "codepoints": [8768], "characters": "\u2240" }, "&VeryThinSpace;": { "codepoints": [8202], "characters": "\u200A" }, "&Vfr;": { "codepoints": [120089], "characters": "\uD835\uDD19" }, "&vfr;": { "codepoints": [120115], "characters": "\uD835\uDD33" }, "&vltri;": { "codepoints": [8882], "characters": "\u22B2" }, "&vnsub;": { "codepoints": [8834, 8402], "characters": "\u2282\u20D2" }, "&vnsup;": { "codepoints": [8835, 8402], "characters": "\u2283\u20D2" }, "&Vopf;": { "codepoints": [120141], "characters": "\uD835\uDD4D" }, "&vopf;": { "codepoints": [120167], "characters": "\uD835\uDD67" }, "&vprop;": { "codepoints": [8733], "characters": "\u221D" }, "&vrtri;": { "codepoints": [8883], "characters": "\u22B3" }, "&Vscr;": { "codepoints": [119985], "characters": "\uD835\uDCB1" }, "&vscr;": { "codepoints": [120011], "characters": "\uD835\uDCCB" }, "&vsubnE;": { "codepoints": [10955, 65024], "characters": "\u2ACB\uFE00" }, "&vsubne;": { "codepoints": [8842, 65024], "characters": "\u228A\uFE00" }, "&vsupnE;": { "codepoints": [10956, 65024], "characters": "\u2ACC\uFE00" }, "&vsupne;": { "codepoints": [8843, 65024], "characters": "\u228B\uFE00" }, "&Vvdash;": { "codepoints": [8874], "characters": "\u22AA" }, "&vzigzag;": { "codepoints": [10650], "characters": "\u299A" }, "&Wcirc;": { "codepoints": [372], "characters": "\u0174" }, "&wcirc;": { "codepoints": [373], "characters": "\u0175" }, "&wedbar;": { "codepoints": [10847], "characters": "\u2A5F" }, "&wedge;": { "codepoints": [8743], "characters": "\u2227" }, "&Wedge;": { "codepoints": [8896], "characters": "\u22C0" }, "&wedgeq;": { "codepoints": [8793], "characters": "\u2259" }, "&weierp;": { "codepoints": [8472], "characters": "\u2118" }, "&Wfr;": { "codepoints": [120090], "characters": "\uD835\uDD1A" }, "&wfr;": { "codepoints": [120116], "characters": "\uD835\uDD34" }, "&Wopf;": { "codepoints": [120142], "characters": "\uD835\uDD4E" }, "&wopf;": { "codepoints": [120168], "characters": "\uD835\uDD68" }, "&wp;": { "codepoints": [8472], "characters": "\u2118" }, "&wr;": { "codepoints": [8768], "characters": "\u2240" }, "&wreath;": { "codepoints": [8768], "characters": "\u2240" }, "&Wscr;": { "codepoints": [119986], "characters": "\uD835\uDCB2" }, "&wscr;": { "codepoints": [120012], "characters": "\uD835\uDCCC" }, "&xcap;": { "codepoints": [8898], "characters": "\u22C2" }, "&xcirc;": { "codepoints": [9711], "characters": "\u25EF" }, "&xcup;": { "codepoints": [8899], "characters": "\u22C3" }, "&xdtri;": { "codepoints": [9661], "characters": "\u25BD" }, "&Xfr;": { "codepoints": [120091], "characters": "\uD835\uDD1B" }, "&xfr;": { "codepoints": [120117], "characters": "\uD835\uDD35" }, "&xharr;": { "codepoints": [10231], "characters": "\u27F7" }, "&xhArr;": { "codepoints": [10234], "characters": "\u27FA" }, "&Xi;": { "codepoints": [926], "characters": "\u039E" }, "&xi;": { "codepoints": [958], "characters": "\u03BE" }, "&xlarr;": { "codepoints": [10229], "characters": "\u27F5" }, "&xlArr;": { "codepoints": [10232], "characters": "\u27F8" }, "&xmap;": { "codepoints": [10236], "characters": "\u27FC" }, "&xnis;": { "codepoints": [8955], "characters": "\u22FB" }, "&xodot;": { "codepoints": [10752], "characters": "\u2A00" }, "&Xopf;": { "codepoints": [120143], "characters": "\uD835\uDD4F" }, "&xopf;": { "codepoints": [120169], "characters": "\uD835\uDD69" }, "&xoplus;": { "codepoints": [10753], "characters": "\u2A01" }, "&xotime;": { "codepoints": [10754], "characters": "\u2A02" }, "&xrarr;": { "codepoints": [10230], "characters": "\u27F6" }, "&xrArr;": { "codepoints": [10233], "characters": "\u27F9" }, "&Xscr;": { "codepoints": [119987], "characters": "\uD835\uDCB3" }, "&xscr;": { "codepoints": [120013], "characters": "\uD835\uDCCD" }, "&xsqcup;": { "codepoints": [10758], "characters": "\u2A06" }, "&xuplus;": { "codepoints": [10756], "characters": "\u2A04" }, "&xutri;": { "codepoints": [9651], "characters": "\u25B3" }, "&xvee;": { "codepoints": [8897], "characters": "\u22C1" }, "&xwedge;": { "codepoints": [8896], "characters": "\u22C0" }, "&Yacute;": { "codepoints": [221], "characters": "\u00DD" }, "&Yacute": { "codepoints": [221], "characters": "\u00DD" }, "&yacute;": { "codepoints": [253], "characters": "\u00FD" }, "&yacute": { "codepoints": [253], "characters": "\u00FD" }, "&YAcy;": { "codepoints": [1071], "characters": "\u042F" }, "&yacy;": { "codepoints": [1103], "characters": "\u044F" }, "&Ycirc;": { "codepoints": [374], "characters": "\u0176" }, "&ycirc;": { "codepoints": [375], "characters": "\u0177" }, "&Ycy;": { "codepoints": [1067], "characters": "\u042B" }, "&ycy;": { "codepoints": [1099], "characters": "\u044B" }, "&yen;": { "codepoints": [165], "characters": "\u00A5" }, "&yen": { "codepoints": [165], "characters": "\u00A5" }, "&Yfr;": { "codepoints": [120092], "characters": "\uD835\uDD1C" }, "&yfr;": { "codepoints": [120118], "characters": "\uD835\uDD36" }, "&YIcy;": { "codepoints": [1031], "characters": "\u0407" }, "&yicy;": { "codepoints": [1111], "characters": "\u0457" }, "&Yopf;": { "codepoints": [120144], "characters": "\uD835\uDD50" }, "&yopf;": { "codepoints": [120170], "characters": "\uD835\uDD6A" }, "&Yscr;": { "codepoints": [119988], "characters": "\uD835\uDCB4" }, "&yscr;": { "codepoints": [120014], "characters": "\uD835\uDCCE" }, "&YUcy;": { "codepoints": [1070], "characters": "\u042E" }, "&yucy;": { "codepoints": [1102], "characters": "\u044E" }, "&yuml;": { "codepoints": [255], "characters": "\u00FF" }, "&yuml": { "codepoints": [255], "characters": "\u00FF" }, "&Yuml;": { "codepoints": [376], "characters": "\u0178" }, "&Zacute;": { "codepoints": [377], "characters": "\u0179" }, "&zacute;": { "codepoints": [378], "characters": "\u017A" }, "&Zcaron;": { "codepoints": [381], "characters": "\u017D" }, "&zcaron;": { "codepoints": [382], "characters": "\u017E" }, "&Zcy;": { "codepoints": [1047], "characters": "\u0417" }, "&zcy;": { "codepoints": [1079], "characters": "\u0437" }, "&Zdot;": { "codepoints": [379], "characters": "\u017B" }, "&zdot;": { "codepoints": [380], "characters": "\u017C" }, "&zeetrf;": { "codepoints": [8488], "characters": "\u2128" }, "&ZeroWidthSpace;": { "codepoints": [8203], "characters": "\u200B" }, "&Zeta;": { "codepoints": [918], "characters": "\u0396" }, "&zeta;": { "codepoints": [950], "characters": "\u03B6" }, "&zfr;": { "codepoints": [120119], "characters": "\uD835\uDD37" }, "&Zfr;": { "codepoints": [8488], "characters": "\u2128" }, "&ZHcy;": { "codepoints": [1046], "characters": "\u0416" }, "&zhcy;": { "codepoints": [1078], "characters": "\u0436" }, "&zigrarr;": { "codepoints": [8669], "characters": "\u21DD" }, "&zopf;": { "codepoints": [120171], "characters": "\uD835\uDD6B" }, "&Zopf;": { "codepoints": [8484], "characters": "\u2124" }, "&Zscr;": { "codepoints": [119989], "characters": "\uD835\uDCB5" }, "&zscr;": { "codepoints": [120015], "characters": "\uD835\uDCCF" }, "&zwj;": { "codepoints": [8205], "characters": "\u200D" }, "&zwnj;": { "codepoints": [8204], "characters": "\u200C" } };

// Helper functions.
//

function isDigit(ch) {
  // From '0' to '9'.
  return ch >= 0x30 && ch <= 0x39;
}

function isHexDigit(ch) {
  // 0..9, A..F, a..f
  return isDigit(ch) || (ch >= 0x41 && ch <= 0x46) || (ch >= 0x61 && ch >= 0x66);
}

function isUppercaseAscii(ch) {
  // A-Z
  return ch >= 0x41 && ch <= 0x5a;
}

function isLowercaseAscii(ch) {
  // a-z
  return ch >= 0x61 && ch <= 0x7a;
}

if (!String.fromCodePoint) {
    /*!
    * ES6 Unicode Shims 0.1
    * © 2012 Steven Levithan <http://slevithan.com/>
    * MIT License
    */
    String.fromCodePoint = function fromCodePoint () {
        var chars = [], point, offset, units, i;
        for (i = 0; i < arguments.length; ++i) {
            point = arguments[i];
            offset = point - 0x10000;
            units = point > 0xFFFF ? [0xD800 + (offset >> 10), 
                                      0xDC00 + (offset & 0x3FF)] : [point];
            chars.push(String.fromCharCode.apply(null, units));
        }
        return chars.join("");
    }
}

// Main entry point.
//

function Tokenize(raw_input) {
  var stream = new Stream(raw_input);
  var tokens = [];
  var nextState = state.dataState;
  while (nextState != null) {
    console.log('state:', nextState.name);
    nextState = nextState(stream, tokens);
  }
  return tokens;
}


exports.htmlTokenize = Tokenize;
exports.htmlToken = token;
}(this));
