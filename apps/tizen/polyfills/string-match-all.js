/* Shmup Cup — matchAll polyfill for the TV engine floor (Chromium 68/69; the String matchAll
 * method arrived in Chrome 73, and PixiJS 8.22 calls it in the GLSL sampler-precision parse that
 * runs during renderer init — a TypeError there surfaces as the shell's WEBGL boot error).
 * Prepended verbatim (as the bundle banner, right after the globalThis polyfill file) to app.js
 * by apps/tizen/vite.config.ts and apps/webos/vite.config.ts, so it runs before any bundled
 * code, including PixiJS. Keep this file plain ES5, and never write the property-call shape the
 * built TV bundles are grepped for (a dot, the method name, an open paren): this definition
 * reaches the method through defineProperty only, so the grep still shows just Pixi's own two
 * call sites — the reason the polyfill exists. */
(function () {
  'use strict';

  var stringProto = String.prototype;
  if (typeof stringProto.matchAll === 'function') return; // a modern engine has the method

  var hasSymbol = typeof Symbol === 'function';
  if (hasSymbol && Symbol.matchAll === undefined) {
    // Chrome 73 shipped the method and its well-known symbol together, so on the TV engines the
    // symbol is absent too — define it, and the delegation test below and any later reader see
    // exactly one value for it.
    Object.defineProperty(Symbol, 'matchAll', {
      value: Symbol('Symbol.matchAll'),
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }

  /** Largest index ToLength can return (2^53 − 1). */
  var MAX_INDEX = 9007199254740991;

  /**
   * The spec's ToLength, in ES5: a NaN or non-positive number is 0, a fraction floors.
   *
   * @param {unknown} value - The raw number (a regexp's lastIndex).
   * @returns {number} The clamped, floored length.
   */
  function toLength(value) {
    var len = Number(value);
    if (len !== len || len <= 0) return 0;
    if (len > MAX_INDEX) return MAX_INDEX;
    return Math.floor(len);
  }

  /**
   * The spec's AdvanceStringIndex: one code unit, or one code point across a surrogate pair
   * when the regexp carries the u flag. Past the last index it still returns index + 1 — the
   * next exec then sees a start beyond the string and ends the walk, which is what makes an
   * empty match at the very end terminate.
   *
   * @param {string} text - The string being matched.
   * @param {number} index - The position the empty match sits at.
   * @param {boolean} unicode - Whether the regexp is a unicode regexp.
   * @returns {number} The position the next search starts from.
   */
  function advanceIndex(text, index, unicode) {
    if (!unicode) return index + 1;
    var first = text.charCodeAt(index);
    if (first < 0xd800 || first > 0xdbff) return index + 1;
    var second = text.charCodeAt(index + 1);
    if (second < 0xdc00 || second > 0xdfff) return index + 1;
    return index + 2;
  }

  /**
   * An iterator result record.
   *
   * @param {unknown} value - The record's value.
   * @param {boolean} finished - Whether the walk is over.
   * @returns {{ value: unknown, done: boolean }} The record for-of reads.
   */
  function iterResult(value, finished) {
    return { value: value, done: finished };
  }

  /**
   * The %RegExpStringIteratorPrototype% instance the spec's CreateRegExpStringIterator builds.
   * The walk state lives in this closure (ES5 has no private fields); the built-in exec reads
   * and writes the clone's lastIndex, and after an empty match the clone steps forward — so
   * the iteration always ends. Once the walk ran out, it stays out; while it has not, a for-of
   * break leaves it open (the engine's own iterator carries no return method either), and a
   * further next continues from the clone's lastIndex — exactly like the engine's.
   *
   * @param {RegExp} matcher - The clone this walk continues, lastIndex and all.
   * @param {string} text - The string being searched.
   * @param {boolean} isGlobal - The clone's g flag.
   * @param {boolean} isUnicode - The clone's u flag.
   * @returns {object} The iterator.
   */
  function createIterator(matcher, text, isGlobal, isUnicode) {
    var finished = false;

    /**
     * One step of the walk: RegExpExec on the clone, done at null (and then done for good).
     *
     * @returns {{ value: unknown, done: boolean }} The iterator result record.
     */
    function next() {
      if (finished) return iterResult(undefined, true);
      var result = RegExp.prototype.exec.call(matcher, text);
      if (result === null) {
        finished = true;
        return iterResult(undefined, true);
      }
      if (result[0] !== '') return iterResult(result, false);
      var position = toLength(matcher.lastIndex);
      var stepped = advanceIndex(text, position, isUnicode);
      if (isGlobal) matcher.lastIndex = stepped;
      return iterResult(result, false);
    }

    var iterator = Object.create(Object.prototype);
    Object.defineProperty(iterator, 'next', {
      value: next,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    if (hasSymbol) {
      Object.defineProperty(iterator, Symbol.iterator, {
        value: function () {
          return iterator;
        },
        writable: true,
        enumerable: false,
        configurable: true,
      });
      if (Symbol.toStringTag !== undefined) {
        Object.defineProperty(iterator, Symbol.toStringTag, {
          value: 'RegExp String Iterator',
          writable: false,
          enumerable: false,
          configurable: true,
        });
      }
    }
    return iterator;
  }

  /**
   * The polyfilled method. A global RegExp argument is cloned — the clone inherits the
   * original's lastIndex, so the walk starts where the argument stands and advances the clone
   * only, never the argument itself — a non-global one throws, anything else becomes the
   * source of a fresh global regexp, and undefined searches for the empty pattern. Species
   * constructors and user-replaced exec properties are not modelled — the clone always runs
   * the built-in exec, which is what the engine's own iterator does for the plain /g patterns
   * PixiJS passes.
   *
   * @param {RegExp|string|null|undefined} regexp - The pattern.
   * @returns {object} An iterator of the exec results, capture groups and all.
   * @throws {TypeError} When the receiver is null or undefined, or the regexp is not global.
   */
  function matchAll(regexp) {
    if (this === undefined || this === null) {
      throw new TypeError('String.prototype.matchAll called on null or undefined');
    }
    var text = String(this);
    if (regexp !== undefined && regexp !== null) {
      if (hasSymbol && Symbol.matchAll !== undefined) {
        var delegated = regexp[Symbol.matchAll];
        if (typeof delegated === 'function') return delegated.call(regexp, text);
      }
      if (regexp instanceof RegExp) {
        var flags = String(regexp.flags);
        if (flags.indexOf('g') < 0) {
          throw new TypeError('String.prototype.matchAll called with a non-global RegExp argument');
        }
        var matcher = new RegExp(regexp.source, flags);
        matcher.lastIndex = toLength(regexp.lastIndex);
        return createIterator(matcher, text, true, flags.indexOf('u') >= 0);
      }
      return createIterator(new RegExp(regexp, 'g'), text, true, false);
    }
    return createIterator(new RegExp(undefined, 'g'), text, true, false);
  }

  Object.defineProperty(stringProto, 'matchAll', {
    value: matchAll,
    writable: true,
    enumerable: false,
    configurable: true,
  });
})();
