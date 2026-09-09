const SPECIAL = /[.^${}()|\\]/;

function escapeChar(char: string): string {
  return SPECIAL.test(char) ? `\\${char}` : char;
}

/**
 * Translates a GitHub Actions filter pattern into a regular expression.
 *
 * GitHub's syntax (used by `branches`, `tags`, and `paths`):
 *   *   zero or more characters, never crossing a `/`
 *   **  zero or more characters, including `/`
 *   ?   exactly one character, never a `/`
 *   +   one or more of the preceding character
 *   []  character range, `!` negates
 *   \   escapes the next character
 */
export function globToRegExpSource(pattern: string): string {
  let out = "";
  let quantifiable = false;

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;

    if (char === "\\") {
      const next = pattern[++index];
      if (next !== undefined) {
        out += escapeChar(next);
        quantifiable = true;
      }
      continue;
    }

    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index++;
        out += ".*";
      } else {
        out += "[^/]*";
      }
      quantifiable = false;
      continue;
    }

    if (char === "?") {
      out += "[^/]";
      quantifiable = true;
      continue;
    }

    if (char === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close === -1) {
        out += "\\[";
        quantifiable = true;
        continue;
      }
      let body = pattern.slice(index + 1, close);
      if (body.startsWith("!")) body = `^${body.slice(1)}`;
      out += `[${body}]`;
      index = close;
      quantifiable = true;
      continue;
    }

    if (char === "+") {
      // A quantifier is only legal after something quantifiable; otherwise the
      // author meant a literal plus (JS would throw on `[^/]*+`).
      out += quantifiable ? "+" : "\\+";
      quantifiable = false;
      continue;
    }

    out += escapeChar(char);
    quantifiable = true;
  }

  return out;
}

export function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${globToRegExpSource(pattern)}$`);
}

export function matchesGlob(value: string, pattern: string): boolean {
  return globToRegExp(pattern).test(value);
}

export function matchesAnyGlob(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlob(value, pattern));
}

export interface GlobLiterals {
  prefix: string;
  suffix: string;
  hasWildcard: boolean;
}

/** Splits a pattern into the fixed text around its wildcard region. */
export function globLiterals(pattern: string): GlobLiterals {
  let first = pattern.length;
  let last = -1;

  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]!;

    if (char === "\\") {
      index++;
      continue;
    }

    if (char === "*" || char === "?" || char === "+") {
      first = Math.min(first, index);
      last = Math.max(last, index);
      continue;
    }

    if (char === "[") {
      const close = pattern.indexOf("]", index + 1);
      if (close === -1) continue;
      first = Math.min(first, index);
      last = Math.max(last, close);
      index = close;
    }
  }

  if (last === -1) {
    return { prefix: pattern, suffix: "", hasWildcard: false };
  }

  return {
    prefix: pattern.slice(0, first),
    suffix: pattern.slice(last + 1),
    hasWildcard: true,
  };
}
