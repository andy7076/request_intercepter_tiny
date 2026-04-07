!function(mod) {
  if (typeof exports == "object" && typeof module == "object") {
    mod(require("../codemirror"));
  } else if (typeof define == "function" && define.amd) {
    define(["../codemirror"], mod);
  } else {
    mod(CodeMirror);
  }
}(function(CodeMirror) {
  "use strict";

  CodeMirror.defineMode("request-interceptor-markup", function() {
    function readUntil(stream, pattern) {
      while (!stream.eol()) {
        if (stream.match(pattern, false)) {
          break;
        }
        stream.next();
      }
    }

    return {
      startState: function() {
        return {
          inTag: false,
          inString: null,
          inComment: false
        };
      },
      token: function(stream, state) {
        if (state.inComment) {
          if (stream.match(/.*?-->/)) {
            state.inComment = false;
          } else {
            stream.skipToEnd();
          }
          return "comment";
        }

        if (state.inString) {
          const quote = state.inString;
          let escaped = false;
          while (!stream.eol()) {
            const ch = stream.next();
            if (ch === quote && !escaped) {
              state.inString = null;
              break;
            }
            escaped = !escaped && ch === "\\";
          }
          return "string";
        }

        if (state.inTag) {
          if (stream.eatSpace()) return null;

          if (stream.match("/>")) {
            state.inTag = false;
            return "tag";
          }

          if (stream.eat(">")) {
            state.inTag = false;
            return "tag";
          }

          if (stream.peek() === '"' || stream.peek() === "'") {
            state.inString = stream.next();
            return "string";
          }

          if (stream.eat("=")) {
            return null;
          }

          if (stream.eat("/")) {
            return "tag";
          }

          if (stream.match(/^[A-Za-z_:][\w:.-]*/)) {
            return "attribute";
          }

          stream.next();
          return null;
        }

        if (stream.match("<!--")) {
          state.inComment = true;
          return "comment";
        }

        if (stream.match(/^<!DOCTYPE/i)) {
          readUntil(stream, />/);
          stream.eat(">");
          return "meta";
        }

        if (stream.match(/^<\?[\w:-]*/)) {
          state.inTag = true;
          return "meta";
        }

        if (stream.match(/^<\/?[\w:-]+/)) {
          state.inTag = true;
          return "tag";
        }

        if (stream.match(/^&[#\w]+;/)) {
          return "atom";
        }

        readUntil(stream, /<|&[#\w]+;/);
        if (stream.pos === stream.start) {
          stream.next();
        }
        return null;
      }
    };
  });
});
