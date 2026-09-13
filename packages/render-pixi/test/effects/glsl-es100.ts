/**
 * A small **GLSL ES 1.0** (WebGL1, `#version 100`) syntax check for the tests (plan M2-08: "shader
 * source compiles under a GLSL ES 1.0 syntax check"). It tokenises a shader and reports what a
 * GLSL ES 1.0 compiler would reject or what WebGL1 does not guarantee:
 *
 * - unbalanced `()`, `[]`, `{}`; a missing `void main`;
 * - GLSL ES 3.00 syntax: a `#version` other than 100, `in` / `out` declarations at global scope,
 *   `layout`, `flat`, `smooth`, `centroid`, `uint` / `uvec*`, `switch`, `texture()`,
 *   `texelFetch`, `textureSize`, user `out` colours instead of `gl_FragColor`;
 * - the operators GLSL ES 1.0 reserves (`%`, `<<`, `>>`, `&`, `|` — not `&&` / `||` —, `^`, `~`,
 *   and their assignments);
 * - float literals with an `f` suffix, and hex / unsigned integer literals;
 * - a fragment shader without a default float precision, a fragment shader that never writes
 *   `gl_FragColor`, a vertex shader that never writes `gl_Position`;
 * - `while` / `do` loops, and `for` loops outside the Appendix A form WebGL1 guarantees
 *   (`for (int i = <const>; i <op> <const>; i++ / i-- / i += <const>)`);
 * - identifiers that are neither declared in the shader nor GLSL ES 1.0 keywords, types or
 *   built-ins (catches ES 3.00 built-ins and typos).
 *
 * Not a full parser — the browser smoke test (`test/e2e/raster.spec.ts`) compiles the real sources
 * in a WebGL1 context as well.
 *
 * @module
 */

/** Keywords, types and qualifiers of GLSL ES 1.0. */
const KEYWORDS = new Set([
  'attribute',
  'const',
  'uniform',
  'varying',
  'break',
  'continue',
  'do',
  'for',
  'while',
  'if',
  'else',
  'in',
  'out',
  'inout',
  'float',
  'int',
  'void',
  'bool',
  'true',
  'false',
  'lowp',
  'mediump',
  'highp',
  'precision',
  'invariant',
  'discard',
  'return',
  'mat2',
  'mat3',
  'mat4',
  'vec2',
  'vec3',
  'vec4',
  'ivec2',
  'ivec3',
  'ivec4',
  'bvec2',
  'bvec3',
  'bvec4',
  'sampler2D',
  'samplerCube',
  'struct',
]);

/** Built-in variables and functions of GLSL ES 1.0 (both stages). */
const BUILTINS = new Set([
  'gl_Position',
  'gl_PointSize',
  'gl_FragCoord',
  'gl_FrontFacing',
  'gl_FragColor',
  'gl_FragData',
  'gl_PointCoord',
  'radians',
  'degrees',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'pow',
  'exp',
  'log',
  'exp2',
  'log2',
  'sqrt',
  'inversesqrt',
  'abs',
  'sign',
  'floor',
  'ceil',
  'fract',
  'mod',
  'min',
  'max',
  'clamp',
  'mix',
  'step',
  'smoothstep',
  'length',
  'distance',
  'dot',
  'cross',
  'normalize',
  'faceforward',
  'reflect',
  'refract',
  'matrixCompMult',
  'lessThan',
  'lessThanEqual',
  'greaterThan',
  'greaterThanEqual',
  'equal',
  'notEqual',
  'any',
  'all',
  'not',
  'texture2D',
  'texture2DProj',
  'texture2DLod',
  'texture2DProjLod',
  'textureCube',
  'textureCubeLod',
  // Swizzle-free member names are checked separately; these are the vector components.
]);

/** Words GLSL ES 3.00 introduced (an error in a GLSL ES 1.0 shader). */
const ES3_ONLY = new Set([
  'layout',
  'flat',
  'smooth',
  'centroid',
  'uint',
  'uvec2',
  'uvec3',
  'uvec4',
  'switch',
  'case',
  'default',
  'texture',
  'texelFetch',
  'textureSize',
  'textureLod',
  'sampler3D',
  'sampler2DArray',
  'isampler2D',
  'usampler2D',
]);

/** Operators GLSL ES 1.0 reserves. */
const RESERVED_OPERATORS = ['%=', '<<=', '>>=', '&=', '|=', '^=', '<<', '>>', '%', '~', '^'];

/** A token of the source. */
interface Token {
  /** `word`, `number`, `punct` or `directive`. */
  readonly kind: 'word' | 'number' | 'punct' | 'directive';
  /** Its text. */
  readonly text: string;
  /** 1-based line. */
  readonly line: number;
}

/**
 * Splits a shader into tokens (comments dropped, preprocessor lines kept whole).
 *
 * @param source - The shader source.
 * @returns The tokens.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const lines = text.split('\n');
  for (let l = 0; l < lines.length; l++) {
    const line = lines[l];
    if (line.trim().startsWith('#')) {
      tokens.push({ kind: 'directive', text: line.trim(), line: l + 1 });
      continue;
    }
    const re =
      /([A-Za-z_][A-Za-z0-9_]*)|(\d+\.\d*(?:[eE][+-]?\d+)?[fF]?|\.\d+(?:[eE][+-]?\d+)?[fF]?|\d+[eE][+-]?\d+[fF]?|0[xX][0-9a-fA-F]+[uU]?|\d+[uU]?)|(<<=|>>=|\+\+|--|&&|\|\||\^\^|<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|[-+*/%<>=!&|^~?:;,.(){}[\]])|(\S)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      if (match[1] !== undefined) tokens.push({ kind: 'word', text: match[1], line: l + 1 });
      else if (match[2] !== undefined) tokens.push({ kind: 'number', text: match[2], line: l + 1 });
      else if (match[3] !== undefined) tokens.push({ kind: 'punct', text: match[3], line: l + 1 });
      else tokens.push({ kind: 'punct', text: match[4], line: l + 1 });
    }
  }
  return tokens;
}

/**
 * Checks a GLSL ES 1.0 shader.
 *
 * @param source - The shader source.
 * @param stage - `vertex` or `fragment`.
 * @param predeclared - Names declared outside the source (Pixi-injected macros, none here).
 * @returns The problems found (`line: message`); empty when the shader passes.
 *
 * @example
 * ```ts
 * expect(checkGlslEs100(LAYER_EFFECT_FRAGMENT, 'fragment')).toEqual([]);
 * ```
 */
export function checkGlslEs100(
  source: string,
  stage: 'vertex' | 'fragment',
  predeclared: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  const report = (line: number, message: string): void => {
    problems.push(`${line}: ${message}`);
  };
  const tokens = tokenize(source);

  // Preprocessor.
  let precision = stage === 'vertex';
  for (const token of tokens) {
    if (token.kind !== 'directive') continue;
    const version = /^#\s*version\s+(\d+)/.exec(token.text);
    if (version !== null && version[1] !== '100') {
      report(token.line, `#version ${version[1]} is not GLSL ES 1.0`);
    }
  }

  // Brackets.
  const stack: Token[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const token of tokens) {
    if (token.kind !== 'punct') continue;
    if (token.text === '(' || token.text === '[' || token.text === '{') stack.push(token);
    else if (token.text in pairs) {
      const open = stack.pop();
      if (open === undefined || open.text !== pairs[token.text]) {
        report(token.line, `unbalanced "${token.text}"`);
      }
    }
  }
  for (const open of stack) report(open.line, `unclosed "${open.text}"`);

  // Declarations, word by word.
  const declared = new Set<string>(predeclared);
  const code = tokens.filter((t) => t.kind !== 'directive');
  let depth = 0;
  let mainFound = false;
  let writesOutput = false;
  for (let i = 0; i < code.length; i++) {
    const token = code[i];
    const next = code[i + 1];
    const prev = code[i - 1];
    if (token.text === '{') depth++;
    else if (token.text === '}') depth--;
    if (token.kind === 'punct') {
      for (const op of RESERVED_OPERATORS) {
        if (token.text === op) report(token.line, `operator "${op}" is reserved in GLSL ES 1.0`);
      }
      if (token.text === '&' || token.text === '|') {
        report(token.line, `bitwise operator "${token.text}" is reserved in GLSL ES 1.0`);
      }
      continue;
    }
    if (token.kind === 'number') {
      if (/[fF]$/.test(token.text)) report(token.line, `float suffix in "${token.text}"`);
      if (/^0[xX]|[uU]$/.test(token.text)) {
        report(token.line, `literal "${token.text}" is not GLSL ES 1.0`);
      }
      continue;
    }
    const word = token.text;
    if (ES3_ONLY.has(word)) {
      report(token.line, `"${word}" is GLSL ES 3.00`);
      continue;
    }
    if (
      (word === 'in' || word === 'out') &&
      depth === 0 &&
      prev?.text !== '(' &&
      prev?.text !== ','
    ) {
      report(
        token.line,
        `global "${word}" declarations are GLSL ES 3.00 (use attribute / varying)`,
      );
    }
    if (word === 'precision' && next?.kind === 'word' && code[i + 2]?.text === 'float') {
      precision = true;
    }
    if (word === 'while' || word === 'do') {
      report(token.line, `"${word}" loops are not guaranteed by WebGL1 (Appendix A)`);
    }
    if (word === 'for') checkFor(code, i, report);
    if (word === 'main' && prev?.text === 'void') mainFound = true;
    if (word === 'gl_FragColor' || word === 'gl_FragData') writesOutput = stage === 'fragment';
    if (word === 'gl_Position') writesOutput = writesOutput || stage === 'vertex';
    // A declaration: a type (or qualifier + type) followed by a name.
    if (
      KEYWORDS.has(word) &&
      /^(float|int|bool|void|[bi]?vec[234]|mat[234]|sampler2D|samplerCube)$/.test(word) &&
      next?.kind === 'word' &&
      !KEYWORDS.has(next.text)
    ) {
      declared.add(next.text);
      // `vec3 a, b;` — names after commas at the same statement.
      for (let j = i + 2; j < code.length && code[j].text !== ';' && code[j].text !== '{'; j++) {
        if (code[j].text === ',' && code[j + 1]?.kind === 'word') declared.add(code[j + 1].text);
        if (code[j].text === '(' || code[j].text === '=') break;
      }
    }
  }
  // Unknown identifiers (after the declarations are known; members after `.` are swizzles).
  for (let i = 0; i < code.length; i++) {
    const token = code[i];
    if (token.kind !== 'word' || code[i - 1]?.text === '.') continue;
    const word = token.text;
    if (KEYWORDS.has(word) || BUILTINS.has(word) || declared.has(word) || ES3_ONLY.has(word))
      continue;
    report(token.line, `unknown identifier "${word}"`);
  }
  // Swizzles and members: only xyzw / rgba / stpq letters, up to four.
  for (let i = 1; i < code.length; i++) {
    if (code[i - 1].text !== '.' || code[i].kind !== 'word') continue;
    if (!/^([xyzw]{1,4}|[rgba]{1,4}|[stpq]{1,4})$/.test(code[i].text)) {
      report(code[i].line, `bad swizzle ".${code[i].text}"`);
    }
  }
  if (!mainFound) report(1, 'no "void main"');
  if (!precision) report(1, 'a fragment shader needs a default float precision');
  if (!writesOutput) {
    report(1, stage === 'fragment' ? 'never writes gl_FragColor' : 'never writes gl_Position');
  }
  return problems;
}

/**
 * Checks one `for` loop header against WebGL1's Appendix A form.
 *
 * @param code - The tokens (no directives).
 * @param at - Index of the `for` token.
 * @param report - Problem sink.
 */
function checkFor(
  code: Token[],
  at: number,
  report: (line: number, message: string) => void,
): void {
  const header: string[] = [];
  let depth = 0;
  for (let j = at + 1; j < code.length; j++) {
    const text = code[j].text;
    if (text === '(') depth++;
    if (text === ')') depth--;
    header.push(text);
    if (depth === 0) break;
  }
  const joined = header.join(' ');
  const form =
    /^\( int ([A-Za-z_]\w*) = [-\d.]+ ; \1 (<|<=|>|>=|==|!=) [-\w.]+ ; (\1 \+\+|\1 --|\+\+ \1|-- \1|\1 (\+=|-=) [\d.]+) \)$/;
  if (!form.test(joined)) {
    report(code[at].line, `for loop "${joined}" is not the Appendix A form`);
  }
}
