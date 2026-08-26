// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS */
// URL state serialization for shareable/bookmarkable conversions.
// Pure (DOM-free) helpers so they can be unit tested under Node.
// Requires FloatingPoint, Integer, and FORMATS from floating-point.js.

// In Node.js (testing), import from the library; in browser, rely on globals.
//
// The alias names carry a per-file prefix on purpose. index.html loads this and
// src/webmcp.js as CLASSIC scripts, which share one global lexical environment,
// so a top-level `let`/`const`/`class` of the same name in two of them is a
// redeclaration and throws SyntaxError before the second file runs at all.
// tests/browser-scripts.test.js enforces that the names stay disjoint.
let _usFloatingPoint, _usInteger, _usFORMATS;
if (typeof require !== 'undefined') {
    const lib = require('../lib/floating-point.js');
    _usFloatingPoint = lib.FloatingPoint;
    _usInteger = lib.Integer;
    _usFORMATS = lib.FORMATS;
} else {
    /* istanbul ignore next */
    _usFloatingPoint = FloatingPoint;
    /* istanbul ignore next */
    _usInteger = Integer;
    /* istanbul ignore next */
    _usFORMATS = FORMATS;
}

const ROUNDING_MODE_VALUES = [
    'tiesToEven',
    'tiesToAway',
    'towardZero',
    'towardPositive',
    'towardNegative',
];
const DEFAULT_ROUNDING_MODE = 'tiesToEven';

// Overflow behavior. There is deliberately NO default constant: the default is
// per-format, and "unset" (null) is a distinct third state meaning "leave it to
// the format". That is what keeps every pre-existing share link byte-identical
// in meaning.
const OVERFLOW_MODE_VALUES = [
    'saturate',
    'overflow',
];

/**
 * Find the preset key whose bit signature matches a floating-point format,
 * or null if the format is custom.
 */
function findFloatPresetKey(format) {
    const signBits = format.signBits ? 1 : 0;
    for (const [key, f] of Object.entries(_usFORMATS)) {
        if (f.isInteger) continue;
        if (
            f.sign === signBits &&
            f.exponent === format.exponentBits &&
            f.mantissa === format.mantissaBits &&
            (f.hasInfinity !== false) === !!format.hasInfinity &&
            (f.hasNaN !== false) === !!format.hasNaN &&
            (f.hasSubnormals !== false) === !!format.hasSubnormals
        ) {
            return key;
        }
    }
    return null;
}

/**
 * Find the preset key whose bit width, signedness and implicit scale match an
 * integer format, or null if the format is custom.
 *
 * The scale comparison is load-bearing, not cosmetic: `mxint8` is also an
 * 8-bit signed integer and is reached FIRST by Object.entries(FORMATS), so
 * without it every existing `int8` link would silently become `mxint8`.
 */
function findIntPresetKey(format) {
    const fractionBits = format.fractionBits || 0;
    for (const [key, f] of Object.entries(_usFORMATS)) {
        if (!f.isInteger) continue;
        if (f.bits === format.bits &&
            !!f.signed === !!format.signed &&
            (f.fractionBits || 0) === fractionBits &&
            !!f.symmetric === !!format.symmetric) {
            return key;
        }
    }
    return null;
}

/**
 * Serialize a FloatingPoint or Integer instance to a compact URL parameter.
 * Uses the preset key when one matches; otherwise a compact custom spec:
 *   - floating-point: "s1e8m23" (+ "i0"/"n0"/"d0" when infinity/NaN/subnormals
 *     are disabled)
 *   - integer: "i8" (signed) / "u8" (unsigned), + "q6" for an implicit 2^-6 scale
 */
function formatToParam(format) {
    if (format.isInteger) {
        const key = findIntPresetKey(format);
        if (key) return key;
        let spec = (format.signed ? 'i' : 'u') + format.bits;
        if (format.fractionBits) spec += 'q' + format.fractionBits;
        return spec;
    }

    const key = findFloatPresetKey(format);
    if (key) return key;

    let spec = 's' + (format.signBits ? 1 : 0) +
        'e' + format.exponentBits +
        'm' + format.mantissaBits;
    if (!format.hasInfinity) spec += 'i0';
    if (!format.hasNaN) spec += 'n0';
    // "d" for denormal - "s" is already taken by the sign bit.
    if (!format.hasSubnormals) spec += 'd0';
    return spec;
}

/**
 * Parse a format URL parameter into a descriptor:
 *   { presetKey } | { kind: 'fp', ... } | { kind: 'int', bits, signed } | null
 */
function parseFormatParam(str) {
    if (!str || typeof str !== 'string') return null;
    const lower = str.toLowerCase().trim();

    // Preset key (direct or hyphen/underscore normalized).
    if (_usFORMATS[lower]) return { presetKey: lower };
    const normalized = lower.replace(/-/g, '_');
    if (_usFORMATS[normalized]) return { presetKey: normalized };

    // Custom integer: i<bits> (signed) or u<bits> (unsigned), with an optional
    // q<fractionBits> implicit scale (Q-format notation).
    let m = /^([iu])(\d+)(?:q(\d+))?$/.exec(lower);
    if (m) {
        const bits = parseInt(m[2], 10);
        const fractionBits = m[3] === undefined ? 0 : parseInt(m[3], 10);
        if (bits >= 1 && bits <= 64 && fractionBits <= bits - 1) {
            const desc = { kind: 'int', bits, signed: m[1] === 'i' };
            // Only carried when non-default, so descriptors for plain integers
            // keep exactly the shape they have always had.
            if (fractionBits) desc.fractionBits = fractionBits;
            return desc;
        }
        return null;
    }

    // Custom floating-point: s<0|1>e<exp>m<mant> with optional i0/i1, n0/n1, d0/d1.
    m = /^s([01])e(\d+)m(\d+)(?:i([01]))?(?:n([01]))?(?:d([01]))?$/.exec(lower);
    if (m) {
        const signBits = parseInt(m[1], 10);
        const exponentBits = parseInt(m[2], 10);
        const mantissaBits = parseInt(m[3], 10);
        if (exponentBits > 15 || mantissaBits > 112) return null;
        const hasInfinity = m[4] === undefined ? true : m[4] === '1';
        const hasNaN = m[5] === undefined ? true : m[5] === '1';
        const desc = { kind: 'fp', signBits, exponentBits, mantissaBits, hasInfinity, hasNaN };
        if (m[6] === '0') desc.hasSubnormals = false;
        return desc;
    }

    return null;
}

/**
 * Build a FloatingPoint or Integer instance from a parsed format descriptor.
 * Returns null for a null/preset descriptor (presets are applied via the UI).
 */
function descriptorToFormat(desc) {
    if (!desc) return null;
    if (desc.presetKey) {
        const preset = _usFORMATS[desc.presetKey];
        if (!preset) return null;
        if (preset.isInteger) {
            return new _usInteger(preset.bits, preset.signed, {
                fractionBits: preset.fractionBits,
                symmetric: preset.symmetric,
            });
        }
        return new _usFloatingPoint(preset.sign, preset.exponent, preset.mantissa, {
            bias: preset.bias,
            hasInfinity: preset.hasInfinity,
            hasNaN: preset.hasNaN,
            hasSubnormals: preset.hasSubnormals,
        });
    }
    if (desc.kind === 'int') {
        return new _usInteger(desc.bits, desc.signed, { fractionBits: desc.fractionBits });
    }
    if (desc.kind === 'fp') {
        return new _usFloatingPoint(desc.signBits, desc.exponentBits, desc.mantissaBits, {
            hasInfinity: desc.hasInfinity,
            hasNaN: desc.hasNaN,
            hasSubnormals: desc.hasSubnormals,
        });
    }
    return null;
}

/**
 * Convert a numeric value to its URL string form, using keywords for the
 * non-finite cases that survive a round trip.
 */
function decimalToString(value) {
    if (value === Infinity) return 'inf';
    if (value === -Infinity) return '-inf';
    if (typeof value === 'number' && Number.isNaN(value)) return 'nan';
    // String(-0) === "0", which would silently drop the sign on a shared link.
    if (Object.is(value, -0)) return '-0';
    return String(value);
}

/**
 * Parse a decimal URL value, returning a number or null when unparseable.
 */
function parseDecimal(str) {
    if (typeof str !== 'string') return null;
    const lower = str.toLowerCase().trim();
    if (lower === 'inf' || lower === '+inf' || lower === 'infinity' || lower === '+infinity') return Infinity;
    if (lower === '-inf' || lower === '-infinity') return -Infinity;
    if (lower === 'nan' || lower === '-nan' || lower === '+nan') return NaN;
    if (lower === '') return null;
    const n = Number(str);
    return Number.isNaN(n) ? null : n;
}

/**
 * Decide how to serialize the current input value. Prefer the human-friendly
 * decimal; fall back to the exact hex bit pattern when re-encoding the decimal
 * would not reproduce the current bits (manual bit edits, NaN payloads, etc.).
 *
 * @returns {{ key: 'val'|'hex', value: string }}
 */
function valueToParam(format, currentValue, currentEncoded, currentValueText = null) {
    let faithful;
    const sourceValue = currentValueText !== null ? currentValueText : currentValue;
    try {
        const reEncoded = format.encode(sourceValue);
        faithful =
            reEncoded.sign === currentEncoded.sign &&
            reEncoded.exponent === currentEncoded.exponent &&
            reEncoded.mantissa === currentEncoded.mantissa;
    } catch {
        faithful = false;
    }

    if (faithful) {
        return {
            key: 'val',
            value: currentValueText !== null
                ? currentValueText
                : decimalToString(currentValue),
        };
    }
    return {
        key: 'hex',
        value: format.toHexString(currentEncoded.sign, currentEncoded.exponent, currentEncoded.mantissa),
    };
}

/**
 * Build the query string (without leading "?") describing the current state.
 *
 * @param {object} state - { inputFormat, outputFormat, currentValue, currentEncoded, roundingMode, overflowMode }
 * @returns {string}
 */
function buildSearchParams(state) {
    const params = new URLSearchParams();
    params.set('in', formatToParam(state.inputFormat));
    params.set('out', formatToParam(state.outputFormat));

    const value = valueToParam(
        state.inputFormat,
        state.currentValue,
        state.currentEncoded,
        state.currentValueText
    );
    params.set(value.key, value.value);

    if (state.roundingMode && state.roundingMode !== DEFAULT_ROUNDING_MODE) {
        params.set('rm', state.roundingMode);
    }

    // Emitted only on an explicit choice; "format default" leaves it out.
    if (state.overflowMode) {
        params.set('om', state.overflowMode);
    }

    return params.toString();
}

/**
 * Parse a location.search string into a structured state intent, or null when
 * no recognized parameters are present. Unrecognized/malformed values are
 * ignored rather than throwing.
 *
 * @returns {null | { input, output, value, roundingMode, overflowMode }}
 */
function parseSearchParams(search) {
    const params = new URLSearchParams(search || '');

    const result = { input: null, output: null, value: null, roundingMode: null, overflowMode: null };

    if (params.has('in')) result.input = parseFormatParam(params.get('in'));
    if (params.has('out')) result.output = parseFormatParam(params.get('out'));

    if (params.has('hex')) {
        const hex = params.get('hex').trim();
        // Bound the length so a crafted link cannot smuggle a pathologically
        // wide bit pattern; the widest supported format is 128 bits
        // (sign + 15 exponent + 112 mantissa = 32 hex digits).
        if (/^0x[0-9a-f]+$/i.test(hex) && hex.length - 2 <= 32) {
            result.value = { hex };
        }
    } else if (params.has('val')) {
        const raw = params.get('val');
        const decimal = parseDecimal(raw);
        if (decimal !== null) {
            // Keep the raw text alongside the number so the encoder can round the
            // original decimal exactly instead of via the intermediate double.
            result.value = { decimal, text: raw };
        }
    }

    if (params.has('rm')) {
        const rm = params.get('rm');
        if (ROUNDING_MODE_VALUES.includes(rm)) {
            result.roundingMode = rm;
        }
    }

    if (params.has('om')) {
        const om = params.get('om');
        if (OVERFLOW_MODE_VALUES.includes(om)) {
            result.overflowMode = om;
        }
    }

    const hasAny = result.input || result.output || result.value ||
        result.roundingMode || result.overflowMode;
    return hasAny ? result : null;
}

// Export for Node.js (testing).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROUNDING_MODE_VALUES,
        DEFAULT_ROUNDING_MODE,
        OVERFLOW_MODE_VALUES,
        findFloatPresetKey,
        findIntPresetKey,
        formatToParam,
        parseFormatParam,
        descriptorToFormat,
        decimalToString,
        parseDecimal,
        valueToParam,
        buildSearchParams,
        parseSearchParams,
    };
}
