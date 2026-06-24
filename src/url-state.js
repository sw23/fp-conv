// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS */
// URL state serialization for shareable/bookmarkable conversions.
// Pure (DOM-free) helpers so they can be unit tested under Node.
// Requires FloatingPoint, Integer, and FORMATS from floating-point.js.

// In Node.js (testing), import from the library; in browser, rely on globals.
let _FloatingPoint, _Integer, _FORMATS;
if (typeof require !== 'undefined') {
    const lib = require('../lib/floating-point.js');
    _FloatingPoint = lib.FloatingPoint;
    _Integer = lib.Integer;
    _FORMATS = lib.FORMATS;
} else {
    /* istanbul ignore next */
    _FloatingPoint = FloatingPoint;
    /* istanbul ignore next */
    _Integer = Integer;
    /* istanbul ignore next */
    _FORMATS = FORMATS;
}

const ROUNDING_MODE_VALUES = [
    'tiesToEven',
    'tiesToAway',
    'towardZero',
    'towardPositive',
    'towardNegative',
];
const DEFAULT_ROUNDING_MODE = 'tiesToEven';

/**
 * Find the preset key whose bit signature matches a floating-point format,
 * or null if the format is custom.
 */
function findFloatPresetKey(format) {
    const signBits = format.signBits ? 1 : 0;
    for (const [key, f] of Object.entries(_FORMATS)) {
        if (f.isInteger) continue;
        if (
            f.sign === signBits &&
            f.exponent === format.exponentBits &&
            f.mantissa === format.mantissaBits &&
            (f.hasInfinity !== false) === !!format.hasInfinity &&
            (f.hasNaN !== false) === !!format.hasNaN
        ) {
            return key;
        }
    }
    return null;
}

/**
 * Find the preset key whose bit width and signedness match an integer format,
 * or null if the format is custom.
 */
function findIntPresetKey(format) {
    for (const [key, f] of Object.entries(_FORMATS)) {
        if (!f.isInteger) continue;
        if (f.bits === format.bits && !!f.signed === !!format.signed) {
            return key;
        }
    }
    return null;
}

/**
 * Serialize a FloatingPoint or Integer instance to a compact URL parameter.
 * Uses the preset key when one matches; otherwise a compact custom spec:
 *   - floating-point: "s1e8m23" (+ "i0"/"n0" when infinity/NaN are disabled)
 *   - integer: "i8" (signed) / "u8" (unsigned)
 */
function formatToParam(format) {
    if (format.isInteger) {
        const key = findIntPresetKey(format);
        if (key) return key;
        return (format.signed ? 'i' : 'u') + format.bits;
    }

    const key = findFloatPresetKey(format);
    if (key) return key;

    let spec = 's' + (format.signBits ? 1 : 0) +
        'e' + format.exponentBits +
        'm' + format.mantissaBits;
    if (!format.hasInfinity) spec += 'i0';
    if (!format.hasNaN) spec += 'n0';
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
    if (_FORMATS[lower]) return { presetKey: lower };
    const normalized = lower.replace(/-/g, '_');
    if (_FORMATS[normalized]) return { presetKey: normalized };

    // Custom integer: i<bits> (signed) or u<bits> (unsigned).
    let m = /^([iu])(\d+)$/.exec(lower);
    if (m) {
        const bits = parseInt(m[2], 10);
        if (bits >= 1 && bits <= 64) {
            return { kind: 'int', bits, signed: m[1] === 'i' };
        }
        return null;
    }

    // Custom floating-point: s<0|1>e<exp>m<mant> with optional i0/i1 and n0/n1.
    m = /^s([01])e(\d+)m(\d+)(?:i([01]))?(?:n([01]))?$/.exec(lower);
    if (m) {
        const signBits = parseInt(m[1], 10);
        const exponentBits = parseInt(m[2], 10);
        const mantissaBits = parseInt(m[3], 10);
        if (exponentBits > 15 || mantissaBits > 112) return null;
        const hasInfinity = m[4] === undefined ? true : m[4] === '1';
        const hasNaN = m[5] === undefined ? true : m[5] === '1';
        return { kind: 'fp', signBits, exponentBits, mantissaBits, hasInfinity, hasNaN };
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
        const preset = _FORMATS[desc.presetKey];
        if (!preset) return null;
        if (preset.isInteger) return new _Integer(preset.bits, preset.signed);
        return new _FloatingPoint(preset.sign, preset.exponent, preset.mantissa, {
            bias: preset.bias,
            hasInfinity: preset.hasInfinity,
            hasNaN: preset.hasNaN,
        });
    }
    if (desc.kind === 'int') {
        return new _Integer(desc.bits, desc.signed);
    }
    if (desc.kind === 'fp') {
        return new _FloatingPoint(desc.signBits, desc.exponentBits, desc.mantissaBits, {
            hasInfinity: desc.hasInfinity,
            hasNaN: desc.hasNaN,
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
    if (lower === 'nan') return NaN;
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
function valueToParam(format, currentValue, currentEncoded, roundingMode) {
    let faithful;
    try {
        const reEncoded = format.encode(currentValue, { roundingMode });
        faithful =
            reEncoded.sign === currentEncoded.sign &&
            reEncoded.exponent === currentEncoded.exponent &&
            reEncoded.mantissa === currentEncoded.mantissa;
    } catch {
        faithful = false;
    }

    if (faithful) {
        return { key: 'val', value: decimalToString(currentValue) };
    }
    return {
        key: 'hex',
        value: format.toHexString(currentEncoded.sign, currentEncoded.exponent, currentEncoded.mantissa),
    };
}

/**
 * Build the query string (without leading "?") describing the current state.
 *
 * @param {object} state - { inputFormat, outputFormat, currentValue, currentEncoded, roundingMode }
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
        state.roundingMode
    );
    params.set(value.key, value.value);

    if (state.roundingMode && state.roundingMode !== DEFAULT_ROUNDING_MODE) {
        params.set('rm', state.roundingMode);
    }

    return params.toString();
}

/**
 * Parse a location.search string into a structured state intent, or null when
 * no recognized parameters are present. Unrecognized/malformed values are
 * ignored rather than throwing.
 *
 * @returns {null | { input, output, value, roundingMode }}
 */
function parseSearchParams(search) {
    const params = new URLSearchParams(search || '');

    const result = { input: null, output: null, value: null, roundingMode: null };

    if (params.has('in')) result.input = parseFormatParam(params.get('in'));
    if (params.has('out')) result.output = parseFormatParam(params.get('out'));

    if (params.has('hex')) {
        const hex = params.get('hex').trim();
        if (/^0x[0-9a-f]+$/i.test(hex)) {
            result.value = { hex };
        }
    } else if (params.has('val')) {
        const decimal = parseDecimal(params.get('val'));
        if (decimal !== null) {
            result.value = { decimal };
        }
    }

    if (params.has('rm')) {
        const rm = params.get('rm');
        if (ROUNDING_MODE_VALUES.includes(rm)) {
            result.roundingMode = rm;
        }
    }

    const hasAny = result.input || result.output || result.value || result.roundingMode;
    return hasAny ? result : null;
}

// Export for Node.js (testing).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROUNDING_MODE_VALUES,
        DEFAULT_ROUNDING_MODE,
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
