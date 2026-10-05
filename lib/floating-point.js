// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Floating Point Format Presets.
// Key order defines the display order used by list_formats (largest-first
// within each category), so keep it stable.
const FORMATS = {
    fp64: { sign: 1, exponent: 11, mantissa: 52, category: 'ieee', name: 'FP64 (IEEE 754 Double)' },
    fp32: { sign: 1, exponent: 8, mantissa: 23, category: 'ieee', name: 'FP32 (IEEE 754 Single)' },
    fp16: { sign: 1, exponent: 5, mantissa: 10, category: 'ieee', name: 'FP16 (Half Precision)' },
    // ML Formats
    bf16: { sign: 1, exponent: 8, mantissa: 7, category: 'ml', name: 'BF16 (Brain Float 16)' },
    tf32: { sign: 1, exponent: 8, mantissa: 10, category: 'ml', name: 'TF32 (TensorFloat-32)' },
    // OCP (Open Compute Project) Formats
    fp8_e5m2: { sign: 1, exponent: 5, mantissa: 2, bias: 15, hasInfinity: true, hasNaN: true, category: 'ocp', name: 'FP8 E5M2' },
    fp8_e4m3: { sign: 1, exponent: 4, mantissa: 3, bias: 7, hasInfinity: false, hasNaN: true, category: 'ocp', name: 'FP8 E4M3' },
    fp6_e3m2: { sign: 1, exponent: 3, mantissa: 2, bias: 3, hasInfinity: false, hasNaN: false, category: 'ocp', name: 'FP6 E3M2' },
    fp6_e2m3: { sign: 1, exponent: 2, mantissa: 3, bias: 1, hasInfinity: false, hasNaN: false, category: 'ocp', name: 'FP6 E2M3' },
    fp4_e2m1: { sign: 1, exponent: 2, mantissa: 1, bias: 1, hasInfinity: false, hasNaN: false, category: 'ocp', name: 'FP4 E2M1' },
    e8m0: { sign: 0, exponent: 8, mantissa: 0, bias: 127, hasInfinity: false, hasNaN: true, hasSubnormals: false, category: 'ocp', name: 'E8M0 (MX Scale)' },
    mxint8: { bits: 8, signed: true, fractionBits: 6, symmetric: true, isInteger: true, category: 'ocp', name: 'MXINT8' },
    // Integer Formats
    int32: { bits: 32, signed: true, isInteger: true, category: 'integer', name: 'INT32' },
    uint32: { bits: 32, signed: false, isInteger: true, category: 'integer', name: 'UINT32' },
    int16: { bits: 16, signed: true, isInteger: true, category: 'integer', name: 'INT16' },
    uint16: { bits: 16, signed: false, isInteger: true, category: 'integer', name: 'UINT16' },
    int8: { bits: 8, signed: true, isInteger: true, category: 'integer', name: 'INT8' },
    uint8: { bits: 8, signed: false, isInteger: true, category: 'integer', name: 'UINT8' },
    int4: { bits: 4, signed: true, isInteger: true, category: 'integer', name: 'INT4' },
    uint4: { bits: 4, signed: false, isInteger: true, category: 'integer', name: 'UINT4' }
};

// IEEE 754 Rounding Modes
const ROUNDING_MODES = Object.freeze({
    tiesToEven: 'tiesToEven',
    tiesToAway: 'tiesToAway',
    towardZero: 'towardZero',
    towardPositive: 'towardPositive',
    towardNegative: 'towardNegative'
});

function unknownRoundingMode(roundingMode) {
    return new Error(`Unknown rounding mode: "${roundingMode}". ` +
        'Valid modes: tiesToEven, tiesToAway, towardZero, towardPositive, towardNegative.');
}

// Resolve and validate the rounding mode for one encode call.
//
// This has to happen at the entry point rather than inside the rounding helpers:
// an exact value, a zero, or a special value never reaches a helper at all, so
// validating there would accept a bogus mode for some inputs and reject it for
// others.
function resolveRoundingMode(options) {
    const roundingMode = options.roundingMode || ROUNDING_MODES.tiesToEven;
    if (!Object.prototype.hasOwnProperty.call(ROUNDING_MODES, roundingMode)) {
        throw unknownRoundingMode(roundingMode);
    }
    return roundingMode;
}

// Conversion overflow behavior. OCP OFP8 calls these SAT/NONSAT and
// requires both; OCP MX calls them SAT/OVF. Supported for all formats.
const OVERFLOW_MODES = Object.freeze({
    saturate: 'saturate',   // clamp to the largest finite magnitude
    overflow: 'overflow'    // produce Infinity, or NaN, or clamp if neither exists
});

function unknownOverflowMode(overflowMode) {
    return new Error(`Unknown overflow mode: "${overflowMode}". ` +
        'Valid modes: saturate, overflow.');
}

// Resolve and validate the overflow mode for one encode call. Unlike rounding,
// the DEFAULT is per-format, so the format has to be passed in. Validation
// happens at the entry point for the same reason as resolveRoundingMode(): a
// value that never overflows would otherwise accept a bogus mode, making
// validation depend on the input rather than the call.
function resolveOverflowMode(options, format) {
    const overflowMode = options.overflowMode || format.defaultOverflowMode;
    if (!Object.prototype.hasOwnProperty.call(OVERFLOW_MODES, overflowMode)) {
        throw unknownOverflowMode(overflowMode);
    }
    return overflowMode;
}

// Convert a binary string to an upper-case hex string (with 0x prefix).
// Shared by Integer and FloatingPoint to avoid duplicated logic.
function binaryToHexString(binary) {
    const paddedBinary = binary.padStart(Math.ceil(binary.length / 4) * 4, '0');
    let hex = '';
    for (let i = 0; i < paddedBinary.length; i += 4) {
        hex += parseInt(paddedBinary.substring(i, i + 4), 2).toString(16).toUpperCase();
    }
    return '0x' + hex;
}

// Read one field out of a binary string, exactly: BigInt because parseInt
// rounds a field wider than 53 bits. An empty slice is 0.
function binaryFieldValue(binary) {
    return binary === '' ? 0n : BigInt('0b' + binary);
}

// Guard for fromBinaryString(). A bit pattern of the wrong width is not padded
// or truncated here - each surface decides what that input means first.
const BINARY_DIGITS = /^[01]*$/;
function validateBinaryString(binary, totalBits) {
    if (typeof binary !== 'string' || binary.length !== totalBits || !BINARY_DIGITS.test(binary)) {
        throw new RangeError(
            `bit pattern must be exactly ${totalBits} binary digits, got "${binary}"`);
    }
}

// The bits a hex pattern spells at a given width, for fromHexString(). Leading
// zero digits are fine ("0x03C00" is fp16's 0x3C00), but a pattern whose bits
// do not fit is refused rather than sliced or read at a fixed offset: sliced,
// its top bits would vanish silently; read at an offset, they would become the
// sign and exponent. Every surface reads hex through this one rule, so the
// converter, the format pages and the decode tool accept and refuse the same
// input.
const HEX_PATTERN = /^(?:0x)?([0-9a-f]+)$/i;
function hexToBinaryString(hex, totalBits) {
    const match = typeof hex === 'string' ? HEX_PATTERN.exec(hex.trim()) : null;
    if (!match) {
        throw new RangeError(
            `hex pattern must be hex digits with an optional 0x prefix, got "${hex}"`);
    }
    const bits = BigInt('0x' + match[1]).toString(2);
    if (bits.length > totalBits) {
        throw new RangeError(
            `hex pattern "${hex}" has ${bits.length} significant bits, ` +
            `which does not fit the ${totalBits}-bit format`);
    }
    return bits.padStart(totalBits, '0');
}

// Round a scaled mantissa value according to the specified rounding mode.
// `scaledMantissa` is the real-valued mantissa × 2^mantissaBits (may have a fractional part).
// It must be non-negative — the sign is handled by the caller, and `towardZero`
// relies on `Math.floor` behaving as truncation for non-negative inputs.
// `sign` is 0 for positive, 1 for negative.
// `tieBreaksAway`, when not null, replaces the parity test at an exact tie: pass
// true when the round-down candidate's ENCODING has an odd least significant
// bit. Callers need this when mantissaBits === 0, where the stored field is
// empty and the encoding's LSB is the biased exponent's.
// Returns the rounded integer mantissa.
function roundMantissa(scaledMantissa, sign, roundingMode, tieBreaksAway = null) {
    switch (roundingMode) {
        case ROUNDING_MODES.tiesToEven: {
            const floor = Math.floor(scaledMantissa);
            const frac = scaledMantissa - floor;
            if (frac > 0.5) return floor + 1;
            if (frac < 0.5) return floor;
            // Exactly 0.5: round to even
            return (tieBreaksAway === null ? floor % 2 !== 0 : tieBreaksAway) ? floor + 1 : floor;
        }
        case ROUNDING_MODES.tiesToAway:
            return Math.round(scaledMantissa);
        case ROUNDING_MODES.towardZero:
            return Math.floor(scaledMantissa);
        case ROUNDING_MODES.towardPositive:
            return sign ? Math.floor(scaledMantissa) : Math.ceil(scaledMantissa);
        case ROUNDING_MODES.towardNegative:
            return sign ? Math.ceil(scaledMantissa) : Math.floor(scaledMantissa);
        /* istanbul ignore next -- defensive: resolveRoundingMode() validates at the entry point */
        default:
            throw unknownRoundingMode(roundingMode);
    }
}

// Round a real number to an integer according to the specified rounding mode.
function roundInteger(value, roundingMode) {
    switch (roundingMode) {
        case ROUNDING_MODES.tiesToEven: {
            const floor = Math.floor(value);
            const frac = value - floor;
            if (frac > 0.5) return floor + 1;
            if (frac < 0.5) return floor;
            return (floor % 2 === 0) ? floor : floor + 1;
        }
        case ROUNDING_MODES.tiesToAway: {
            // Math.round uses "round half toward +∞", but tiesToAway needs "round half away from zero"
            const absRounded = Math.round(Math.abs(value));
            return value < 0 ? -absRounded : absRounded;
        }
        case ROUNDING_MODES.towardZero:
            return Math.trunc(value);
        case ROUNDING_MODES.towardPositive:
            return Math.ceil(value);
        case ROUNDING_MODES.towardNegative:
            return Math.floor(value);
        /* istanbul ignore next -- defensive: resolveRoundingMode() validates at the entry point */
        default:
            throw unknownRoundingMode(roundingMode);
    }
}

// ---------------------------------------------------------------------------
// Exact decimal-string handling.
//
// Going through Number() first (decimal -> fp64 -> target) double-rounds: a
// decimal that sits just off a *target-format* midpoint can land exactly on that
// midpoint as a double, after which ties-to-even picks the even neighbour
// instead of the side the original decimal was actually on. The helpers below
// keep the decimal exact (as a BigInt rational) so the target format is reached
// with a single, correctly-rounded step.
// ---------------------------------------------------------------------------

// Past this the value is unambiguously an overflow/underflow for every
// supported format, and building the power of ten would cost megabytes of
// BigInt for no added accuracy.
//
// The widest layout the library allows (15 exponent bits, 112 mantissa bits,
// default bias) is IEEE binary128: max normal ~1e4932, min subnormal ~1e-4966.
// So ~5000 is all the range that is strictly needed with the default bias; the
// limit covers every custom bias too, since MAX_BIAS_MAGNITUDE below keeps
// every layout within 10^±19729.
// Past the limit the digits can no longer change the answer - only the sign and
// the rounding mode can, which is what _encodeOutOfRange() applies.
const MAX_DECIMAL_EXPONENT = 20000;

// Separate cost guard on pathologically long input. This deliberately is NOT
// folded into the magnitude bound above: a number of ordinary size written with
// a very long fraction (0.749...9) must still take the exact path, or it would
// fall back to Number() and be silently double-rounded.
const MAX_DECIMAL_DIGITS = 100000;

// Bound on a custom exponent bias. Every exact path (toExactDecimalString,
// conversionLoss, the encoders) shifts BigInts by the bias, so an unbounded one
// lets a single call build megabytes of digits: bias 1e7 makes an fp32-shaped
// layout's max normal a 10-million-digit decimal. At this bound the widest
// layout (15 exponent bits, 112 mantissa bits) spans at most 2^±65535, about
// 10^±19729, which keeps every format inside MAX_DECIMAL_EXPONENT, so a decimal
// past that limit really is out of range for any format the library builds.
// It is twice binary128's bias, so any real or proposed format fits.
const MAX_BIAS_MAGNITUDE = 32767;

const DECIMAL_LITERAL = /^([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

// Parse a plain decimal literal into an exact rational magnitude.
// Returns { sign, num, den } with magnitude === num/den, or
// { sign, outOfRange: 1 | -1 } when the magnitude is too extreme to be worth
// building exactly (+1 overflow, -1 a nonzero underflow), or null when the
// input is not a plain decimal at all (Infinity, NaN, hex, garbage) so callers
// can fall back to Number().
function parseDecimalLiteral(str) {
    if (typeof str !== 'string') return null;
    const match = DECIMAL_LITERAL.exec(str.trim());
    if (!match) return null;

    const intDigits = match[2] || '';
    const fracDigits = match[3] || '';
    // Reject inputs with no digits at all ("", ".", "e5", "-").
    if (intDigits === '' && fracDigits === '') return null;
    if (intDigits.length + fracDigits.length > MAX_DECIMAL_DIGITS) return null;

    const sign = match[1] === '-' ? 1 : 0;
    const allDigits = intDigits + fracDigits;
    const significant = allDigits.replace(/^0+/, '');
    // An all-zero digit string is zero whatever the exponent claims, and must
    // not build a power of ten for it ("0e999999999").
    if (significant === '') return { sign, num: 0n, den: 1n };

    const exp10 = match[4] ? Number(match[4]) : 0;
    const scale = exp10 - fracDigits.length;
    // Bound the VALUE's magnitude (~10^(significant.length + scale)), not the
    // precision it was written with. Beyond the bound the exact digits cannot
    // affect the result, but the sign and the rounding mode still can, so report
    // which end it fell off rather than discarding the parse.
    const decExponent = significant.length + scale;
    if (Math.abs(decExponent) > MAX_DECIMAL_EXPONENT) {
        return { sign, outOfRange: decExponent > 0 ? 1 : -1 };
    }

    const digits = BigInt(allDigits);
    const pow10 = 10n ** BigInt(Math.abs(scale));
    return {
        sign,
        num: scale >= 0 ? digits * pow10 : digits,
        den: scale >= 0 ? 1n : pow10
    };
}

// The non-finite spellings every surface accepts ("inf", "-nan", ...).
// parseDecimalLiteral() rejects them and Number() knows only "Infinity" and
// "NaN", so this is the one list. Returns the value, or null for anything
// else - test against null, since NaN is falsy.
function valueKeyword(str) {
    if (typeof str !== 'string') return null;
    switch (str.trim().toLowerCase()) {
        case 'inf': case '+inf': case 'infinity': case '+infinity':
            return Infinity;
        case '-inf': case '-infinity':
            return -Infinity;
        case 'nan': case '+nan': case '-nan':
            return NaN;
        default:
            return null;
    }
}

// The number a string that is not a plain decimal denotes: a keyword if it is
// one, otherwise whatever Number() makes of it (hex, "1e5", garbage -> NaN).
function numberFromString(str) {
    const keyword = valueKeyword(str);
    return keyword === null ? Number(str) : keyword;
}

// Number of bits in a positive BigInt.
function bigIntBitLength(value) {
    return value.toString(2).length;
}

function bigIntGcd(a, b) {
    while (b !== 0n) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

// Compare a parsed decimal rational to a signed dyadic value
// `significand * 2^exponent`. Reducing both to an odd significand avoids
// constructing enormous powers of two for custom formats with extreme biases.
function decimalEqualsDyadic(parsed, sign, significand, exponent) {
    if (parsed === null || parsed.outOfRange !== undefined) return false;
    // A zero's sign counts too: "-0" into a format with no sign bit comes
    // back as +0, which conversionLoss() reports as a reflected sign.
    if (parsed.num === 0n) return significand === 0n && parsed.sign === sign;
    if (significand === 0n || parsed.sign !== sign) return false;

    const divisor = bigIntGcd(parsed.num, parsed.den);
    let decimalSignificand = parsed.num / divisor;
    const reducedDenominator = parsed.den / divisor;
    if ((reducedDenominator & (reducedDenominator - 1n)) !== 0n) return false;

    let decimalExponent = -(bigIntBitLength(reducedDenominator) - 1);
    while ((decimalSignificand & 1n) === 0n) {
        decimalSignificand >>= 1n;
        decimalExponent++;
    }

    while ((significand & 1n) === 0n) {
        significand >>= 1n;
        exponent++;
    }

    return decimalSignificand === significand && decimalExponent === exponent;
}

function dyadicToExactDecimal(sign, significand, exponent) {
    if (significand === 0n) return sign ? '-0' : '0';

    while ((significand & 1n) === 0n) {
        significand >>= 1n;
        exponent++;
    }

    let digits;
    if (exponent >= 0) {
        digits = (significand << BigInt(exponent)).toString();
    } else {
        const places = -exponent;
        const scaled = (significand * 5n ** BigInt(places))
            .toString().padStart(places + 1, '0');
        digits = scaled.slice(0, scaled.length - places) + '.' +
            scaled.slice(scaled.length - places);
    }
    return (sign ? '-' : '') + digits;
}

// True when the rounding mode carries a magnitude away from zero. That is the
// only way a nonzero value too small to represent escapes rounding to zero.
function roundsAwayFromZero(sign, roundingMode) {
    return (roundingMode === ROUNDING_MODES.towardPositive && sign === 0) ||
        (roundingMode === ROUNDING_MODES.towardNegative && sign === 1);
}

// Round the exact positive rational numer/denom to a BigInt using the given
// rounding mode. `sign` is 0 for positive, 1 for negative — matching
// roundMantissa, the directed modes act on the magnitude. `tieBreaksAway` has
// the same meaning as in roundMantissa.
function roundQuotient(numer, denom, sign, roundingMode, tieBreaksAway = null) {
    const quotient = numer / denom;
    const remainder = numer % denom;
    if (remainder === 0n) return quotient;

    const twiceRemainder = remainder * 2n;
    switch (roundingMode) {
        case ROUNDING_MODES.tiesToEven:
            if (twiceRemainder > denom) return quotient + 1n;
            if (twiceRemainder < denom) return quotient;
            return (tieBreaksAway === null ? quotient % 2n !== 0n : tieBreaksAway)
                ? quotient + 1n : quotient;
        case ROUNDING_MODES.tiesToAway:
            return twiceRemainder >= denom ? quotient + 1n : quotient;
        case ROUNDING_MODES.towardZero:
            return quotient;
        case ROUNDING_MODES.towardPositive:
            return sign ? quotient : quotient + 1n;
        case ROUNDING_MODES.towardNegative:
            return sign ? quotient + 1n : quotient;
        /* istanbul ignore next -- defensive: resolveRoundingMode() validates at the entry point */
        default:
            throw unknownRoundingMode(roundingMode);
    }
}

// ---------------------------------------------------------------------------
// Raw bit fields.
//
// A raw field (an Integer's two's-complement bits, a FloatingPoint mantissa) is
// a number up to 53 bits and a BigInt above that, where a double can no longer
// name every pattern (2^54 - 1 rounds up to 2^54).
//
// Fields the library hands out are always in the representation their width
// calls for, so two encodings of one pattern compare ===. Methods that take raw
// fields accept either and normalize. Decoding a wide field to a double still
// rounds; the pattern and its binary/hex spelling do not.
// ---------------------------------------------------------------------------

// Widest field a double holds exactly.
const EXACT_FIELD_BITS = 53;

// Is a `bits`-wide raw field carried as a BigInt?
function fieldIsWide(bits) {
    return bits > EXACT_FIELD_BITS;
}

// The largest value a `bits`-wide unsigned field can hold, 2^bits - 1, exactly.
function maxFieldValue(bits) {
    return fieldIsWide(bits) ? (1n << BigInt(bits)) - 1n : Math.pow(2, bits) - 1;
}

// Is `value` usable as a raw field value at all?
function isFieldValue(value) {
    return typeof value === 'bigint' || Number.isInteger(value);
}

// Exact BigInt for a field value held either way.
function fieldToBigInt(value) {
    return typeof value === 'bigint' ? value : BigInt(value);
}

// Put a field value into the representation a `bits`-wide field calls for.
function normalizeField(value, bits) {
    return fieldIsWide(bits) ? fieldToBigInt(value) : Number(value);
}

// Validate a caller-supplied raw field value and return it in the
// representation a `bits`-wide field uses. A number above 2^53 - 1 is refused
// even when in range, since it may already be a rounded stand-in for the
// pattern meant (2^63 + 1 arrives as 2^63) - wide fields must be BigInts.
function validateField(value, bits, maxValue, name) {
    if (!isFieldValue(value)) {
        throw new RangeError(`${name} must be an integer in [0, ${maxValue}], got ${value}`);
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        throw new RangeError(
            `${name} above 2^53 - 1 must be a BigInt so the bit pattern is exact, got ${value}`);
    }
    const field = normalizeField(value, bits);
    if (field < 0 || field > maxValue) {
        throw new RangeError(`${name} must be an integer in [0, ${maxValue}], got ${value}`);
    }
    return field;
}

// The field value one step below `value`, in whichever representation it uses.
function fieldPredecessor(value) {
    return typeof value === 'bigint' ? value - 1n : value - 1;
}

// Zero tests have to cross the two representations: 0n === 0 is false.
function fieldIsZero(value) {
    return value === 0 || value === 0n;
}

// ---------------------------------------------------------------------------
// Reporting a conversion's loss
//
// Did the value survive, and if not, what happened to it? The web UI, WebMCP
// and the CLI all ask here so they cannot describe a conversion differently.
// ---------------------------------------------------------------------------

// Are two numbers the same value? NaN matches NaN, and +0 matches -0. For
// encodings, where a zero's sign was carried by the bits, conversionLoss()
// uses exactValuesEqual() instead.
function sameValue(a, b) {
    return (Number.isNaN(a) && Number.isNaN(b)) || a === b;
}

// THE KINDS. What happened to a value on its way from one format to another:
//
//   'exact'          the output is the input value (NaN -> NaN included), or
//                    -0 as the one zero of a signed integer format, which has
//                    no sign on zero to lose.
//   'rounded'        finite in, a different finite out, not a clamp.
//   'overflow'       became an Infinity or NaN it was not: a finite input past
//                    the range, or an infinity a format without one (E4M3,
//                    E8M0) turned into NaN.
//   'saturated'      clamped to an edge of the range: the maximum for a
//                    magnitude past it, or an unsigned format's minimum (zero)
//                    for a negative it cannot hold.
//   'reflected'      only the sign was lost: -Infinity as +Infinity on an
//                    unsigned format with an infinity, or -0 as +0 on any
//                    unsigned format.
//   'nanSubstituted' a NaN input came back as a non-NaN; the format has none.
//
// The order of the tests is the definition: 'exact' first, so NaN -> NaN is not
// a substitution, then NaN inputs, so they never reach the infinity cases.

// Every kind the functions below can report. Exported so each surface's label
// table can be tested against it and a new kind cannot reach a user unlabelled.
const CONVERSION_LOSS_KINDS = Object.freeze([
    'exact', 'rounded', 'overflow', 'saturated', 'reflected', 'nanSubstituted',
]);

// The word every surface shows for each kind, so none can name one differently.
const CONVERSION_LOSS_LABELS = Object.freeze({
    exact: 'exact',
    rounded: 'rounded',
    overflow: 'overflow',
    saturated: 'saturated',
    reflected: 'sign not representable',
    nanSubstituted: 'NaN not representable',
});

// Order two finite exact values (as _exactValue() returns them): -1, 0 or 1,
// with -0 equal to +0. Shifting to a common binary exponent keeps this exact at
// any width or bias, where the decoded doubles would round.
function compareExactValues(a, b) {
    const aNegative = a.sign === 1 && a.significand !== 0n;
    const bNegative = b.sign === 1 && b.significand !== 0n;
    if (aNegative !== bNegative) return aNegative ? -1 : 1;

    const shift = a.exponent - b.exponent;
    const left = shift > 0 ? a.significand << BigInt(shift) : a.significand;
    const right = shift < 0 ? b.significand << BigInt(-shift) : b.significand;
    const magnitude = left === right ? 0 : (left < right ? -1 : 1);
    return aNegative ? -magnitude : magnitude;
}

// The exact value of a finite double, in the same shape as _exactValue().
// Doubling until the magnitude is an integer is exact for any double.
function doubleExactValue(value) {
    if (value === 0) {
        return { kind: 'finite', sign: Object.is(value, -0) ? 1 : 0, significand: 0n, exponent: 0 };
    }
    const sign = value < 0 ? 1 : 0;
    let magnitude = Math.abs(value);
    let exponent = 0;
    while (!Number.isInteger(magnitude)) {
        magnitude *= 2;
        exponent--;
    }
    return { kind: 'finite', sign, significand: BigInt(magnitude), exponent };
}

// Is this the same value, sign and all? NaN matches NaN, but unlike
// sameValue() -0 does not match +0: losing a zero's sign is 'reflected'.
function exactValuesEqual(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'nan') return true;
    if (a.kind === 'infinity') return a.sign === b.sign;
    if (a.significand === 0n || b.significand === 0n) {
        return a.significand === b.significand && a.sign === b.sign;
    }
    return compareExactValues(a, b) === 0;
}

// Do two encodings of the same format name the same bit pattern? Normalizing
// lets a number mantissa match the library's BigInt above 53 bits.
function sameEncoding(format, a, b) {
    return a.sign === b.sign && a.exponent === b.exponent &&
        format.normalizeMantissa(a.mantissa) === format.normalizeMantissa(b.mantissa);
}

// An encoding built from raw fields, with the mantissa in the format's own
// representation (a BigInt above 53 bits), so it compares === with what the
// encoders return and stores what toggling the bits would.
function normalizedEncoding(format, sign, exponent, mantissa) {
    return { sign, exponent, mantissa: format.normalizeMantissa(mantissa) };
}

// The ladder itself, on two exact values. See THE KINDS above.
function conversionKind(input, output, outFormat, roundingMode) {
    if (exactValuesEqual(input, output)) return 'exact';
    if (input.kind === 'nan') return 'nanSubstituted';
    if (input.kind === 'infinity') {
        if (output.kind === 'nan') return 'overflow';
        if (output.kind === 'infinity') return 'reflected';
        return 'saturated';
    }
    // A finite input from here.
    if (output.kind !== 'finite') return 'overflow';
    // Both zero but not equal: the only difference left is the sign. Two's
    // complement has no -0, so a signed integer holds -0 as its only zero - as
    // isExactlyRepresentable('-0') says - while an unsigned format drops a
    // sign it has no bit for.
    if (input.significand === 0n && output.significand === 0n) {
        return outFormat.isInteger && outFormat.signed ? 'exact' : 'reflected';
    }
    return outFormat._clamps(input, roundingMode) ? 'saturated' : 'rounded';
}

// What one format's encoding became in another, as { kind, absolute,
// relativePercent }. `options.roundingMode` must be the mode the conversion
// used: whether a value near the top of the range clamped or merely rounded
// onto it depends on the mode.
//
// `kind` is decided on the exact values, since a wide field or an exponent
// range beyond fp64's rounds through a double. `absolute` and `relativePercent`
// are measured on the exact values too, and only the results are rounded to
// doubles: subtracting the decoded doubles would report u64 max -> fp32 (a
// loss of exactly 1) as 0. They are 0 for 'exact', and null when either side
// is non-finite or a result is too large or too small for a double.
function conversionLoss(inFormat, inEncoded, outFormat, outEncoded, options = {}) {
    const input = inFormat._exactValue(inEncoded);
    const output = outFormat._exactValue(outEncoded);
    const kind = conversionKind(input, output, outFormat, resolveRoundingMode(options));

    if (kind === 'exact') return { kind, absolute: 0, relativePercent: 0 };
    if (input.kind !== 'finite' || output.kind !== 'finite') {
        return { kind, absolute: null, relativePercent: null };
    }

    const diff = exactRatio(exactDifference(input, output));
    const absolute = ratioToDouble(diff.num, diff.den);
    let relativePercent = 0;
    if (input.significand !== 0n) {
        // |diff| / |input| * 100, as one ratio so only the result rounds.
        const whole = exactRatio(input);
        relativePercent = ratioToDouble(diff.num * whole.den * 100n, diff.den * whole.num);
    }
    // A nonzero difference below fp64's range rounds to 0, which would read as
    // no loss at all, so it is as unreportable as one past the range. The
    // relative loss cannot flush on its own: a field is at most 112 bits wide,
    // so a rounding is never below 2^-113 of the value.
    const flushed = absolute === 0 && diff.num !== 0n;
    if (!Number.isFinite(absolute) || !Number.isFinite(relativePercent) || flushed) {
        return { kind, absolute: null, relativePercent: null };
    }
    return { kind, absolute, relativePercent };
}

// |a - b| for two finite exact values, in the same shape, exact at any width
// or exponent range: both are shifted onto the smaller binary exponent.
function exactDifference(a, b) {
    const exponent = Math.min(a.exponent, b.exponent);
    const scaled = (v) => (v.sign ? -v.significand : v.significand) << BigInt(v.exponent - exponent);
    const diff = scaled(a) - scaled(b);
    return { kind: 'finite', sign: 0, significand: diff < 0n ? -diff : diff, exponent };
}

// The double nearest num / den (both non-negative BigInt), rounded once by
// the library's own fp64 encoder: Infinity past fp64's range, 0 below it.
let _fp64ForRatios = null;
function ratioToDouble(num, den) {
    if (_fp64ForRatios === null) _fp64ForRatios = FloatingPoint.fromFormat('fp64');
    const encoded = _fp64ForRatios._encodeRational(0, num, den, {});
    return _fp64ForRatios.decode(encoded.sign, encoded.exponent, encoded.mantissa);
}

// Does decode() name this encoding's value exactly? Not for a mantissa wider
// than 53 bits or a magnitude outside fp64's range.
function decodesExactly(format, encoded) {
    const value = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
    if (!Number.isFinite(value)) return false;
    return exactValuesEqual(format._exactValue(encoded), doubleExactValue(value));
}

// Should a surface show the decoded double for this encoding, or the exact
// decimal? An integer past 53 bits always shows the exact decimal: even an
// exact double like -2^63 prints as -9223372036854776000. A float shows the
// double whenever the double is the value, and the exact decimal otherwise.
function showsDecodedValue(format, encoded) {
    return format.isInteger ? !format.wideFields : decodesExactly(format, encoded);
}

// The same question for significand(): should a surface show its double, or
// exactSignificandString()? An integer's significand is its value, so the
// rule is showsDecodedValue()'s. A float's double is the significand whenever
// the bits fit in one, which a mantissa wider than 52 bits need not: a normal
// with 60 one-bits reads 2 from the double, a value no normal significand has.
function showsDecodedSignificand(format, exponent, mantissa) {
    if (format.isInteger) return !format.wideFields;
    return exactValuesEqual(
        doubleExactValue(format.significand(exponent, mantissa)),
        format._exactSignificand(exponent, mantissa));
}

// The decimal a surface shows for an encoding: the double's shortest spelling
// where showsDecodedValue() says the double is the value, and the exact
// decimal otherwise. Every readout on every surface goes through this, so one
// encoding is never spelled two ways (u64 all-ones as ...551615 in the web
// UI and ...552000 in a tool result). String(-0) is "0", which would drop a
// sign the bits carry. The exact decimal spells real specials 'NaN' and
// 'Infinity' itself, where String() would also say Infinity for a finite
// value past fp64's range.
function encodingValueText(format, encoded) {
    if (!showsDecodedValue(format, encoded)) return format.toExactDecimalString(encoded);
    const value = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
    return Object.is(value, -0) ? '-0' : String(value);
}

// num / den for a finite exact value's magnitude, both BigInt.
function exactRatio(exact) {
    return {
        num: exact.exponent >= 0 ? exact.significand << BigInt(exact.exponent) : exact.significand,
        den: exact.exponent >= 0 ? 1n : 1n << BigInt(-exact.exponent),
    };
}

// Re-encode the value one format's encoding denotes into another format,
// rounding its exact value in one step. A decimal string or decode()'s double
// would round wide fields, and the decimal parser gives up on extreme exponents.
function convertEncoded(inFormat, inEncoded, outFormat, options = {}) {
    const exact = inFormat._exactValue(inEncoded);
    if (exact.kind === 'nan') return outFormat.encode(NaN, options);
    if (exact.kind === 'infinity') return outFormat.encode(exact.sign ? -Infinity : Infinity, options);
    const { num, den } = exactRatio(exact);
    return outFormat._encodeRational(exact.sign, num, den, options);
}

// Integer class for integer format handling
class Integer {
    constructor(bits, signed = true, options = {}) {
        // Widths above 64 bits are meaningless and 0/negative widths are
        // nonsensical; 1-64 is the supported range shared with resolveFormat and
        // the URL parser. Widths above 53 bits are exact via BigInt.
        if (!Number.isInteger(bits) || bits < 1 || bits > 64) {
            throw new RangeError(`bits must be an integer between 1 and 64, got ${bits}`);
        }

        // Implicit binary scale (OCP MX §5.3.4: MXINT8 is 8-bit two's complement
        // with an implicit 2^-6 scale, i.e. one sign bit, one integer bit and
        // six fraction bits). fractionBits === 0 is a plain integer.
        const fractionBits = options.fractionBits || 0;
        if (!Number.isInteger(fractionBits) || fractionBits < 0 || fractionBits > bits - 1) {
            throw new RangeError(
                `fractionBits must be an integer between 0 and ${bits - 1}, got ${fractionBits}`);
        }

        this.bits = bits;
        this.totalBits = bits;
        // See "Raw bit fields" above.
        this.wideFields = fieldIsWide(bits);
        // Two's-complement constants: the sign bit's weight and 2^bits.
        this._signBitValue = 1n << BigInt(bits - 1);
        this._modulus = 1n << BigInt(bits);
        this.signed = signed;
        this.isInteger = true;
        this.fractionBits = fractionBits;
        this.scale = Math.pow(2, fractionBits);
        // MX §5.3.4 allows the most-negative encoding (0x80 for MXINT8) to be
        // left unused, keeping the positive and negative extremes symmetric and
        // avoiding a negative bias.
        this.symmetric = options.symmetric === true;

        // The all-ones raw field, named to match FloatingPoint.
        this.maxMantissa = maxFieldValue(bits);

        // Calculate range based on signedness. These stay in RAW integer units
        // because _createEncoded() stores them as two's complement; the
        // real-valued bounds are derived below. Exact at every width, in the
        // same representation as `mantissa`.
        if (signed) {
            const magnitude = normalizeField(this._signBitValue, bits);
            this.maxValue = fieldPredecessor(magnitude);
            this.minValue = this.symmetric ? -this.maxValue : -magnitude;
        } else {
            this.minValue = normalizeField(0n, bits);
            // An unsigned format's largest value IS the all-ones pattern.
            this.maxValue = this.maxMantissa;
        }

        // Doubles, so these round above 53 bits.
        this.minRealValue = Number(this.minValue) / this.scale;
        this.maxRealValue = Number(this.maxValue) / this.scale;

        // Properties for compatibility with FloatingPoint
        this.signBits = 0;
        this.exponentBits = 0;
        this.mantissaBits = bits;
        this.bias = 0;
        this.maxExponent = 0;
        this.hasInfinity = false;
        this.hasNaN = false;
        this.hasSubnormals = false;
        // Integers have no out-of-range encoding at all, so they always clamp.
        this.defaultOverflowMode = OVERFLOW_MODES.saturate;
    }

    // What an out-of-range magnitude becomes in this format. Integers have
    // nowhere to put Infinity or NaN, so the answer never depends on the mode.
    overflowTarget(_overflowMode = this.defaultOverflowMode) {
        return 'maxNormal';
    }

    // Where a NaN input lands: 'zero' for a plain integer (PTX's float-to-integer
    // rule), 'maxNormal' for fixed-point (MXINT8), like the NaN-less floats.
    nanTarget() {
        return this.fractionBits > 0 ? 'maxNormal' : 'zero';
    }

    // Encode a value into this integer format (with saturation).
    //
    // Strings are routed to encodeString() so their digits survive: coercing
    // one here would round decimal -> double -> format, which double-rounds.
    // Numbers go straight to the number-only core, and a BigInt, already exact,
    // needs no rounding (so encode(format.minValue) works at any width).
    encode(value, options = {}) {
        if (typeof value === 'string') return this.encodeString(value, options);
        if (typeof value === 'bigint') return this._encodeBigInt(value, options);
        return this._encodeNumber(value, options);
    }

    // Encode an exact integer: scale, then saturate. Nothing rounds, but the
    // modes are still validated like every other entry point.
    _encodeBigInt(value, options) {
        resolveRoundingMode(options);
        resolveOverflowMode(options, this);

        return this._createEncoded(this._saturate(value << BigInt(this.fractionBits)));
    }

    // Clamp a scaled integer to the range. The value may be a number (Infinity
    // included) or a BigInt, and the bounds are whichever this width stores;
    // JavaScript compares the two exactly.
    _saturate(intValue) {
        if (intValue > this.maxValue) return this.maxValue;
        if (intValue < this.minValue) return this.minValue;
        return intValue;
    }

    // Encode a JavaScript number. Never call this with a string - encode() and
    // encodeString() are the entry points, and both funnel here with a number,
    // which is what keeps the two of them from recursing into each other.
    _encodeNumber(value, options) {
        const roundingMode = resolveRoundingMode(options);
        // Validated for API symmetry; integers always saturate, so the resolved
        // mode has no effect on the result.
        resolveOverflowMode(options, this);

        // Handle special floating-point values
        if (isNaN(value)) {
            // See nanTarget(). MX §5.3.4 leaves this implementation-defined;
            // PTX maps NaN to its maximum for s2f6, MXINT8's layout.
            return this.nanTarget() === 'zero' ? this.getZero() : this.getMaxValue();
        }
        
        if (!isFinite(value)) {
            // Infinity saturates to max/min
            return value > 0 ? this.getMaxValue() : this.getMinValue();
        }
        
        // Round on the SCALED value so a fixed-point format rounds at its own
        // grid (1/2^fractionBits) rather than at whole numbers.
        return this._createEncoded(this._saturate(roundInteger(value * this.scale, roundingMode)));
    }

    // Encode a decimal string to this integer format, rounding the exact decimal
    // in one step. Falls back to the Number() path for non-decimal inputs
    // (Infinity, NaN, hex).
    encodeString(str, options = {}) {
        const parsed = parseDecimalLiteral(str);
        // Not a decimal: a keyword such as "-inf", or garbage.
        if (parsed === null) return this._encodeNumber(numberFromString(str), options);

        const roundingMode = resolveRoundingMode(options);
        resolveOverflowMode(options, this);

        if (parsed.outOfRange !== undefined) {
            // Saturate on overflow; on underflow only a directed mode pointing
            // away from zero lifts a tiny magnitude off zero. The magnitude is
            // in RAW units, and one raw unit is exactly the smallest
            // representable magnitude at any scale.
            const magnitude = parsed.outOfRange > 0
                ? Infinity
                : (roundsAwayFromZero(parsed.sign, roundingMode) ? 1 : 0);
            return this._createEncoded(this._saturate(parsed.sign ? -magnitude : magnitude));
        }

        return this._encodeRational(parsed.sign, parsed.num, parsed.den, options);
    }

    // Encode the exact value (-1)^sign * num / den in one correctly-rounded
    // step. encodeString() and convertEncoded() both land here.
    _encodeRational(sign, num, den, options) {
        const roundingMode = resolveRoundingMode(options);
        resolveOverflowMode(options, this);

        return this._createEncoded(
            this._saturate(this._roundRational(sign, num, den, roundingMode)));
    }

    // The signed raw integer num / den rounds to, before any saturation. The
    // numerator is scaled first, so a fixed-point format rounds once.
    _roundRational(sign, num, den, roundingMode) {
        const magnitude = roundQuotient(num << BigInt(this.fractionBits), den, sign, roundingMode);
        return sign ? -magnitude : magnitude;
    }

    // Did encoding this finite exact value clamp it, rather than round it?
    // Rounding is monotone and both ends of the range are representable, so
    // only a value past one is rounded here again.
    _clamps(exact, roundingMode) {
        if (compareExactValues(this._exactValue(this.getMinValue()), exact) <= 0 &&
            compareExactValues(exact, this._exactValue(this.getMaxValue())) <= 0) {
            return false;
        }
        const { num, den } = exactRatio(exact);
        const intValue = this._roundRational(exact.sign, num, den, roundingMode);
        return intValue > this.maxValue || intValue < this.minValue;
    }

    isExactlyRepresentable(str, encoded = this.encode(str)) {
        const parsed = parseDecimalLiteral(str);
        const intValue = this._encodedIntValue(encoded);
        // Two's complement has a single zero, so "-0" lands on it exactly, as
        // conversionLoss() says; an unsigned format drops a sign it has no
        // bit for, and that is reported.
        const signedZero = this.signed && parsed !== null && parsed.num === 0n;
        return decimalEqualsDyadic(
            parsed,
            intValue < 0n ? 1 : (signedZero ? parsed.sign : 0),
            intValue < 0n ? -intValue : intValue,
            -this.fractionBits);
    }

    toExactDecimalString(encoded) {
        const { sign, significand, exponent } = this._exactValue(encoded);
        return dyadicToExactDecimal(sign, significand, exponent);
    }

    // The exact value an encoding denotes, as conversionLoss() compares it:
    // always finite, the signed integer scaled by 2^-fractionBits.
    _exactValue(encoded) {
        const intValue = this._encodedIntValue(encoded);
        return {
            kind: 'finite',
            sign: intValue < 0n ? 1 : 0,
            significand: intValue < 0n ? -intValue : intValue,
            exponent: -this.fractionBits,
        };
    }

    // Read the stored bits, not the `intValue` convenience field, so this can
    // never disagree with decode().
    _encodedIntValue(encoded) {
        return this._rawToInt(encoded.mantissa);
    }

    // The signed integer a raw two's-complement field denotes, as an exact
    // BigInt. _exactValue() and decodeBits() both read it from here.
    _rawToInt(rawBits) {
        const bits = fieldToBigInt(this._validateField(rawBits));
        return this.signed && bits >= this._signBitValue ? bits - this._modulus : bits;
    }
    
    // Build an encoded result from a signed integer value (a number or a
    // BigInt), exact at every width.
    _createEncoded(intValue) {
        const value = fieldToBigInt(intValue);
        // Two's complement: add 2^bits to negative values.
        const rawBits = value < 0n ? this._modulus + value : value;

        // The whole width is the mantissa field, so both take its representation.
        return {
            sign: 0,
            exponent: 0,
            mantissa: this.normalizeMantissa(rawBits),
            intValue: this.normalizeMantissa(value),
            realValue: Number(value) / this.scale,
            isNormal: false,
            isSubnormal: false,
            isZero: value === 0n,
            isInfinite: false,
            isNaN: false,
            isInteger: true
        };
    }

    // Put a raw mantissa (the whole two's-complement field) into the
    // representation this width uses, so it compares === with the library's.
    normalizeMantissa(value) {
        return normalizeField(value, this.bits);
    }

    // Validate a caller-supplied raw field and return it in this width's
    // representation. There is no sign or exponent field to check.
    _validateField(mantissa) {
        return validateField(mantissa, this.bits, this.maxMantissa, 'mantissa');
    }

    // Decode integer representation to decimal
    decode(sign, exponent, mantissa) {
        // For integers, mantissa holds the raw bit value; sign/exponent are ignored.
        return this.decodeBits(mantissa);
    }

    // Decode a raw two's-complement bit value to a signed/unsigned decimal.
    // A format with an implicit scale divides by it, so decode() is total over
    // the whole bit space even for the encodings encode() never produces.
    decodeBits(rawBits) {
        // Exact up to the final division, which rounds above 53 bits.
        return Number(this._rawToInt(rawBits)) / this.scale;
    }

    // The "mantissa (decimal)" a surface shows. For an integer that is the value.
    significand(exponent, mantissa) {
        return this.decode(0, 0, mantissa);
    }

    // The same as exact decimal text, for a field wider than 53 bits (see
    // showsDecodedSignificand(), which needs no exact form here: an integer's
    // significand is its value, so the rule is showsDecodedValue()'s).
    exactSignificandString(exponent, mantissa) {
        return this.toExactDecimalString({ sign: 0, exponent: 0, mantissa });
    }

    // An integer has no exponent field; see FloatingPoint.unbiasedExponent().
    unbiasedExponent(_exponent, _mantissa) {
        return null;
    }

    exponentText(_exponent, _mantissa) {
        return 'N/A';
    }

    // The human-readable name for what an encoding holds, shared by every surface.
    typeLabel(sign, exponent, mantissa) {
        const value = this.decode(sign, exponent, mantissa);
        if (value === 0) return 'Zero';
        // A format with an implicit scale (MXINT8) does not hold integers.
        const noun = this.fractionBits ? 'Fixed-point' : 'Integer';
        return value > 0 ? `Positive ${noun}` : `Negative ${noun}`;
    }

    // Convert to binary string
    toBinaryString(sign, exponent, mantissa) {
        return this._validateField(mantissa).toString(2).padStart(this.bits, '0');
    }

    // The inverse of toBinaryString(). An integer encoding has no fields to
    // split: the whole width is the two's-complement pattern.
    fromBinaryString(binary) {
        validateBinaryString(binary, this.totalBits);
        return { sign: 0, exponent: 0, mantissa: this.normalizeMantissa(binaryFieldValue(binary)) };
    }

    // The inverse of toHexString(); see hexToBinaryString() for what is
    // accepted.
    fromHexString(hex) {
        return this.fromBinaryString(hexToBinaryString(hex, this.totalBits));
    }

    // Convert to hex string
    toHexString(sign, exponent, mantissa) {
        return binaryToHexString(this.toBinaryString(sign, exponent, mantissa));
    }
    
    // Helper to get zero
    getZero() {
        return this._createEncoded(0);
    }
    
    // Helper to get max value
    getMaxValue() {
        return this._createEncoded(this.maxValue);
    }
    
    // Helper to get min value
    getMinValue() {
        return this._createEncoded(this.minValue);
    }

}

// FloatingPoint class for custom format handling
class FloatingPoint {
    constructor(signBits, exponentBits, mantissaBits, options = {}) {
        if (!Number.isInteger(signBits) || signBits < 0 || signBits > 1) {
            throw new RangeError('signBits must be 0 or 1');
        }
        if (!Number.isInteger(exponentBits) || exponentBits < 0 || exponentBits > 15) {
            throw new RangeError('exponentBits must be an integer between 0 and 15');
        }
        if (!Number.isInteger(mantissaBits) || mantissaBits < 0 || mantissaBits > 112) {
            throw new RangeError('mantissaBits must be an integer between 0 and 112');
        }
        if (options.bias !== undefined &&
            (!Number.isInteger(options.bias) || Math.abs(options.bias) > MAX_BIAS_MAGNITUDE)) {
            throw new RangeError(
                `bias must be an integer between -${MAX_BIAS_MAGNITUDE} and ${MAX_BIAS_MAGNITUDE}`);
        }

        this.signBits = signBits;
        this.exponentBits = exponentBits;
        this.mantissaBits = mantissaBits;
        this.totalBits = signBits + exponentBits + mantissaBits;

        // Derived once so the many places that need them cannot drift apart.
        // Both are correct at mantissaBits === 0 without a special case: the
        // field spans a single value, 0, which is also the largest it can hold.
        // mantissaSpan is a power of two, so it stays an exact number;
        // maxMantissa is a bit pattern (see "Raw bit fields" above).
        this.mantissaSpan = Math.pow(2, mantissaBits); // one past the largest field value
        this.maxMantissa = maxFieldValue(mantissaBits);

        // Support custom bias (for OCP formats) or use standard formula
        // Use Math.pow/2** rather than bit-shifts to avoid JS 32-bit << behavior
        this.bias = options.bias !== undefined
            ? options.bias
            : (exponentBits > 0 ? Math.pow(2, exponentBits - 1) - 1 : 0);

        this.maxExponent = exponentBits > 0 ? Math.pow(2, exponentBits) - 1 : 0;
        
        // Special value support flags (default true for backward compatibility).
        // Always false with no exponent field: every pattern of a fixed-point
        // layout is a magnitude, so there is nowhere to put Infinity or NaN.
        this.hasInfinity = exponentBits > 0 && options.hasInfinity !== false;
        // With an Infinity the layout decides NaN, not the flag. The Infinity
        // is (maxExponent, 0), so with a mantissa field the rest of that binade
        // is NaN, IEEE-style: there is no finite grid to give those patterns,
        // since it would have a hole where the Infinity sits, and the encoders
        // reserve the whole binade. Without a mantissa field the Infinity is
        // the only pattern there and nothing is left for NaN. The flag is the
        // user's only for an OCP-style layout, where NaN is the all-ones
        // pattern at maxExponent.
        //
        // Declining NaN beside an Infinity with a mantissa field is refused
        // rather than overridden: honouring it would make the top binade's
        // other patterns finite, so a caller who passed it would read those
        // bits one way while the format decodes them another, with no signal.
        // Asking for NaN without a mantissa field is merely unmet, like an
        // Infinity with no exponent field: no pattern changes meaning, the
        // flag reads back false, and nanTarget() names the substitute.
        if (this.hasInfinity && mantissaBits > 0 && options.hasNaN === false) {
            throw new RangeError(
                'hasNaN cannot be false with hasInfinity: the patterns beside the ' +
                'Infinity in its exponent binade are NaN, so a format with an ' +
                'Infinity and a mantissa field always has NaN');
        }
        this.hasNaN = exponentBits > 0 && (this.hasInfinity
            ? mantissaBits > 0
            : options.hasNaN !== false);
        // When false, exponent field 0 denotes the normal value 2^(0 - bias)
        // rather than zero/subnormal, and the format has no zero encoding at
        // all. This is what OCP MX §5.4.1 Table 7 requires of E8M0.
        // Always true with no exponent field, for the same reason as the two
        // flags above: a fixed-point layout's all-zero pattern is its zero and
        // there is no binade for a flag to repurpose.
        this.hasSubnormals = exponentBits === 0 || options.hasSubnormals !== false;

        // Per-format overflow default, chosen so that behavior is unchanged
        // from before OVERFLOW_MODES existed: a format with somewhere to put an
        // infinity overflows to it, and a format without one clamps.
        this.defaultOverflowMode = options.overflowMode ||
            (this.hasInfinity ? OVERFLOW_MODES.overflow : OVERFLOW_MODES.saturate);
    }

    // What an out-of-range magnitude becomes in this format under `overflowMode`.
    // Returns 'infinity' | 'nan' | 'maxNormal'. Surfaces turn this into display
    // text; the RULE lives here so the UI, CLI and MCP can never disagree.
    overflowTarget(overflowMode = this.defaultOverflowMode) {
        if (overflowMode === OVERFLOW_MODES.saturate) return 'maxNormal';
        if (this.hasInfinity) return 'infinity';
        if (this.hasNaN) return 'nan';
        return 'maxNormal';
    }

    // Where a NaN input lands: 'nan' | 'maxNormal' | 'zero', as in
    // overflowTarget(). Independent of the overflow mode; see _encodeNaN() for
    // the substitute a format without NaN uses.
    nanTarget() {
        if (this.hasNaN) return 'nan';
        // A layout whose maximum is the zero pattern (s1e1m0 with an infinity)
        // reports 'zero' rather than a magnitude it does not have.
        return this.getMaxNormal(false).isZero ? 'zero' : 'maxNormal';
    }

    // Encode a value into this floating-point format.
    //
    // Strings are routed to encodeString() so their digits survive: coercing
    // one here would round decimal -> double -> format, which double-rounds.
    // Numbers go straight to the number-only core. A BigInt takes the string
    // path too, since a double would round a wide one.
    encode(value, options = {}) {
        if (typeof value === 'string') return this.encodeString(value, options);
        if (typeof value === 'bigint') return this.encodeString(value.toString(), options);
        return this._encodeNumber(value, options);
    }

    // Encode a JavaScript number. Never call this with a string - encode() and
    // encodeString() are the entry points, and both funnel here with a number,
    // which is what keeps the two of them from recursing into each other.
    _encodeNumber(value, options) {
        const roundingMode = resolveRoundingMode(options);
        const overflowMode = resolveOverflowMode(options, this);

        // A format with no exponent bits is a different beast - a fixed-point
        // scale with no binade, no subnormals and no special values - so it gets
        // its own encoder rather than branching through the float logic below.
        if (this.exponentBits === 0) {
            return this._encodeFixedNumber(value, roundingMode);
        }

        if (isNaN(value)) {
            return this._encodeNaN();
        }

        if (!isFinite(value)) {
            // An infinite INPUT is infinite under every rounding mode, so the
            // IEEE directed-rounding clamp does not apply here - only the
            // saturation mode decides. See overflow-mode-plan §2.2.
            // An unsigned format treats -Infinity as +Infinity, as CUDA's E8M0
            // conversions do.
            return this._overflowResult(this._signField(value < 0), overflowMode);
        }

        // Unsigned formats clamp a finite negative to the bottom of the range
        // (zero, or E8M0's smallest magnitude). CUDA would take |x| instead.
        if (this.signBits === 0 && (value < 0 || Object.is(value, -0))) {
            return this._encodeZero(false);
        }

        if (value === 0) {
            return this._encodeZero(Object.is(value, -0));
        }

        // Negatives on unsigned formats already returned above.
        const sign = value < 0 ? 1 : 0;
        value = Math.abs(value);

        // Get exponent and mantissa
        const log2 = Math.log2(value);
        let exponent = Math.floor(log2);
        // Math.log2 can round up for values just below a power of two (e.g.
        // nextDown(2^k) for |k| >= 4), yielding an exponent one too high and a
        // negative mantissa. Correct with exact power-of-two comparisons.
        if (value < Math.pow(2, exponent)) {
            exponent--;
        } else {
            /* istanbul ignore if -- defensive: Math.log2 never under-estimates the floor */
            if (value >= Math.pow(2, exponent + 1)) {
                exponent++;
            }
        }
        const significand = value / Math.pow(2, exponent);

        // Bias the exponent
        let biasedExponent = exponent + this.bias;

        // Handle subnormal numbers. A format with no subnormals (E8M0) uses
        // exponent field 0 as an ordinary normal binade instead, so only what
        // falls BELOW that field underflows - and it has nothing smaller to
        // round to, so it saturates to the minimum representable magnitude.
        if (!this.hasSubnormals && biasedExponent < 0) {
            return this._encodeZero(sign === 1);
        }
        const isSubnormal = this.hasSubnormals && biasedExponent <= 0;
        if (isSubnormal) {
            biasedExponent = 0;
        } else if (biasedExponent > this.maxExponent || 
                   (biasedExponent === this.maxExponent && this.hasInfinity)) {
            // Overflow: the mantissa is irrelevant, _finalizeEncoded decides
            // between saturation and infinity based on the rounding mode.
            return this._finalizeEncoded(sign, biasedExponent, 0, roundingMode, overflowMode);
        }

        // Scale to the mantissa field and round.
        //
        // Subnormals carry no implicit leading bit, so the stored field *is*
        // their significand. Normals do carry one: round the FULL significand
        // and subtract the implicit bit afterwards. Rounding the stored fraction
        // on its own would truncate every value when mantissaBits === 0, because
        // that fraction is then always zero and the exponent carries all of the
        // information. For mantissaBits >= 1 the two forms agree exactly, ties
        // included, because the implicit bit sits above the LSB and so cannot
        // change its parity.
        const mantissaSpan = this.mantissaSpan;
        const scaled = isSubnormal
            ? (value / Math.pow(2, 1 - this.bias)) * mantissaSpan
            : significand * mantissaSpan;
        let mantissaInt = roundMantissa(scaled, sign, roundingMode,
            this.mantissaBits === 0 && !isSubnormal ? biasedExponent % 2 === 1 : null) -
            (isSubnormal ? 0 : mantissaSpan);

        // A magnitude far below the smallest subnormal underflows to zero while
        // being scaled (reachable when 1 - bias > 0, i.e. a custom bias <= 0,
        // where the scaling divides rather than multiplies). The value is still
        // nonzero, so a directed mode pointing away from zero must lift it to
        // the smallest subnormal: IEEE 754 never rounds a nonzero value to zero
        // in the direction it is being pushed.
        if (scaled === 0 && roundsAwayFromZero(sign, roundingMode)) {
            mantissaInt = 1;
        }

        /* istanbul ignore next */
        if (mantissaInt < 0) {
            // With the exponent correction above, the real mantissa is always in
            // [0, 1), so a negative rounded mantissa indicates a logic error.
            throw new RangeError(`Internal error: negative mantissa ${mantissaInt}`);
        }

        return this._finalizeEncoded(sign, biasedExponent, mantissaInt, roundingMode, overflowMode);
    }

    // Encode a decimal string into this format, rounding the exact decimal to the
    // target format in a single step rather than via an intermediate fp64.
    // Falls back to the Number() path for anything that is not a plain decimal
    // literal (Infinity, NaN, hex, malformed input).
    encodeString(str, options = {}) {
        const parsed = parseDecimalLiteral(str);
        // Not a decimal: a keyword such as "-inf", or garbage.
        if (parsed === null) return this._encodeNumber(numberFromString(str), options);

        const roundingMode = resolveRoundingMode(options);
        const overflowMode = resolveOverflowMode(options, this);
        const sign = parsed.sign;

        // Unsigned formats clamp negatives to zero before any rounding happens.
        if (this.signBits === 0 && sign === 1) return this._encodeZero(false);

        if (parsed.outOfRange !== undefined) {
            return this._encodeOutOfRange(sign, parsed.outOfRange, roundingMode, overflowMode);
        }

        return this._encodeRational(sign, parsed.num, parsed.den, options);
    }

    // Encode the exact value (-1)^sign * num / den in one correctly-rounded
    // step. encodeString() and convertEncoded() both land here.
    _encodeRational(sign, num, den, options) {
        const roundingMode = resolveRoundingMode(options);
        const overflowMode = resolveOverflowMode(options, this);

        if (this.signBits === 0 && sign === 1) return this._encodeZero(false);
        // Zero has no rounding to do.
        if (num === 0n) return this._encodeNumber(sign ? -0 : 0, options);

        if (this.exponentBits === 0) {
            return this._finalizeFixed(sign, this._roundFixed(sign, num, den, roundingMode));
        }

        const rounded = this._roundToGrid(sign, num, den, roundingMode);
        // A format with no subnormals (E8M0) has nothing below exponent field
        // 0, so anything under it saturates to the minimum magnitude.
        if (rounded === null) return this._encodeZero(sign === 1);
        return this._finalizeEncoded(sign, rounded.biasedExponent, rounded.mantissaInt,
            roundingMode, overflowMode);
    }

    // Fixed-point: value = mantissa / 2^mantissaBits. Kept as a BigInt so a
    // wide field stays exact.
    _roundFixed(sign, num, den, roundingMode) {
        return this.mantissaBits > 0
            ? roundQuotient(num << BigInt(this.mantissaBits), den, sign, roundingMode)
            : 0n;
    }

    // Round num / den (> 0) to this format's grid as if the exponent range had
    // no top, returning the biased exponent and stored mantissa before any
    // carry (a mantissa equal to the span, which _finalizeEncoded() carries),
    // or null below the range of a format with no subnormals.
    _roundToGrid(sign, num, den, roundingMode) {
        // Binary exponent: the unique e with 2^e <= num/den < 2^(e+1). The bit
        // length difference is either e or e+1, so verify and correct.
        let exponent = bigIntBitLength(num) - bigIntBitLength(den);
        const scaled = exponent >= 0 ? den << BigInt(exponent) : den;
        const probe = exponent >= 0 ? num : num << BigInt(-exponent);
        if (probe < scaled) exponent--;

        // Short-circuit overflow before building an enormous shift.
        if (exponent + this.bias > this.maxExponent) {
            return { biasedExponent: this.maxExponent + 1, mantissaInt: 0n };
        }
        if (!this.hasSubnormals && exponent + this.bias < 0) return null;

        // Subnormals share the fixed exponent 2^(1-bias); normals use their own
        // binade. In both cases we round value / 2^(effective - mantissaBits).
        const isSubnormal = this.hasSubnormals && exponent < 1 - this.bias;
        const effective = isSubnormal ? 1 - this.bias : exponent;
        const shift = this.mantissaBits - effective;
        const significand = roundQuotient(
            shift >= 0 ? num << BigInt(shift) : num,
            shift >= 0 ? den : den << BigInt(-shift),
            sign, roundingMode,
            this.mantissaBits === 0 && !isSubnormal ? (exponent + this.bias) % 2 === 1 : null);

        // Normals carry an implicit leading 1 that is not stored.
        return {
            biasedExponent: isSubnormal ? 0 : exponent + this.bias,
            mantissaInt: isSubnormal ? significand : significand - (1n << BigInt(this.mantissaBits)),
        };
    }

    // Did encoding this finite exact value clamp it, rather than round it? A
    // value clamps when the grid point it rounds to lies outside the range: a
    // negative on an unsigned format, unless it rounds to zero (which is what
    // rounding it on an unsigned integer says too); any magnitude below a
    // format with no zero (E8M0); a magnitude past the maximum unless it rounds
    // back down onto it. Rounding is monotone and both edges are representable,
    // so only a value past one is rounded here again.
    _clamps(exact, roundingMode) {
        if (this.signBits === 0 && exact.sign === 1) {
            return !this._roundsToZero(exact, roundingMode);
        }

        const magnitude = { ...exact, sign: 0 };
        if (!this.hasSubnormals &&
            compareExactValues(magnitude, this._exactValue(this._encodeZero(false))) < 0) {
            return true;
        }
        const max = this.getMaxNormal(false);
        if (compareExactValues(magnitude, this._exactValue(max)) <= 0) return false;

        const { num, den } = exactRatio(exact);
        if (this.exponentBits === 0) {
            return this._roundFixed(exact.sign, num, den, roundingMode) > this.maxMantissa;
        }
        // Past the maximum, the grid point it rounds to is the maximum or
        // something above it, so the fields say which. A mantissa that would
        // carry into the exponent is above too, without carrying it.
        const rounded = this._roundToGrid(exact.sign, num, den, roundingMode);
        return rounded.biasedExponent !== max.exponent ||
            rounded.mantissaInt !== fieldToBigInt(max.mantissa);
    }

    // Does this finite value round to zero on this format's grid? Its sign is
    // kept for the directed modes: -0.001 rounds to zero under tiesToEven but
    // away from it under towardNegative. A format with no zero (E8M0) has
    // nothing to round to.
    _roundsToZero(exact, roundingMode) {
        const { num, den } = exactRatio(exact);
        if (this.exponentBits === 0) {
            return this._roundFixed(exact.sign, num, den, roundingMode) === 0n;
        }
        if (!this.hasSubnormals) return false;
        const rounded = this._roundToGrid(exact.sign, num, den, roundingMode);
        return rounded.biasedExponent === 0 && rounded.mantissaInt === 0n;
    }

    isExactlyRepresentable(str, encoded = this.encode(str)) {
        const parsed = parseDecimalLiteral(str);
        if (parsed === null || parsed.outOfRange !== undefined) return false;

        const kind = this.classify(encoded.sign, encoded.exponent, encoded.mantissa);
        if (kind === 'NaN' || kind === 'Infinity') return false;

        const { significand, exponent } = this._dyadicComponents(encoded, kind);

        return decimalEqualsDyadic(parsed, encoded.sign, significand, exponent);
    }

    toExactDecimalString(encoded) {
        const exact = this._exactValue(encoded);
        if (exact.kind === 'nan') return 'NaN';
        if (exact.kind === 'infinity') return exact.sign ? '-Infinity' : 'Infinity';
        return dyadicToExactDecimal(exact.sign, exact.significand, exact.exponent);
    }

    // The exact value an encoding denotes, as conversionLoss() compares it: a
    // NaN, a signed infinity, or sign * significand * 2^exponent.
    _exactValue(encoded) {
        const kind = this.classify(encoded.sign, encoded.exponent, encoded.mantissa);
        if (kind === 'NaN') {
            return { kind: 'nan', sign: encoded.sign, significand: 0n, exponent: 0 };
        }
        if (kind === 'Infinity') {
            return { kind: 'infinity', sign: encoded.sign, significand: 0n, exponent: 0 };
        }
        const { significand, exponent } = this._dyadicComponents(encoded, kind);
        return { kind: 'finite', sign: encoded.sign, significand, exponent };
    }

    // Unsigned magnitude and binary exponent of an encoded finite value.
    _dyadicComponents(encoded, kind) {
        if (this.exponentBits === 0) {
            return {
                significand: fieldToBigInt(encoded.mantissa),
                exponent: -this.mantissaBits,
            };
        }
        if (kind === 'Zero') return { significand: 0n, exponent: 0 };
        if (kind === 'Subnormal') {
            return {
                significand: fieldToBigInt(encoded.mantissa),
                exponent: 1 - this.bias - this.mantissaBits,
            };
        }
        return {
            significand: (1n << BigInt(this.mantissaBits)) + fieldToBigInt(encoded.mantissa),
            exponent: encoded.exponent - this.bias - this.mantissaBits,
        };
    }

    // A decimal too extreme to build exactly still has a determined result: it
    // is either an unambiguous overflow, or a nonzero magnitude far below half
    // the smallest subnormal. Both must honour the rounding mode - towardZero
    // may never reach infinity, and a directed mode pointing away from zero may
    // never flush a nonzero value to zero.
    _encodeOutOfRange(sign, direction, roundingMode, overflowMode) {
        if (direction > 0) {
            // maxMantissa + 1 saturates in _finalizeFixed.
            return this.exponentBits === 0
                ? this._finalizeFixed(sign, this.mantissaSpan)
                : this._finalizeEncoded(sign, this.maxExponent + 1, 0, roundingMode, overflowMode);
        }

        const magnitude = roundsAwayFromZero(sign, roundingMode) ? 1 : 0;
        // A format with no subnormals has no zero and no step below its smallest
        // normal, so both answers collapse to the minimum representable
        // magnitude - exponent field 0.
        if (!this.hasSubnormals) {
            return this._encodeZero(sign === 1);
        }
        return this.exponentBits === 0
            ? this._finalizeFixed(sign, magnitude)
            : this._finalizeEncoded(sign, 0, magnitude, roundingMode, overflowMode);
    }

    // Encode a number into a fixed-point format (exponentBits === 0), where the
    // value is simply mantissa / 2^mantissaBits. There is no exponent to place,
    // so there are no binades, no subnormals, and nowhere to put Infinity or
    // NaN: out-of-range magnitudes saturate and NaN encodes as the positive
    // maximum, as on a NaN-less float format.
    _encodeFixedNumber(value, roundingMode) {
        if (isNaN(value)) {
            return this._encodeNaN();
        }

        // Determine sign, preserving -0. Unsigned formats clamp negatives away.
        const negative = value < 0 || Object.is(value, -0);
        if (this.signBits === 0 && negative) {
            return this._finalizeFixed(0, 0);
        }
        const sign = negative ? 1 : 0;

        // Infinity saturates to the largest representable magnitude, as does any
        // finite value that overflows - _finalizeFixed clamps both.
        if (!isFinite(value)) {
            return this._finalizeFixed(sign, this.maxMantissa);
        }

        return this._finalizeFixed(sign,
            roundMantissa(Math.abs(value) * this.mantissaSpan, sign, roundingMode));
    }

    // Saturate a fixed-point mantissa to the field width and build the result.
    // Rounding an absolute value never produces a negative mantissa, so only the
    // upper bound needs clamping.
    _finalizeFixed(sign, mantissaInt) {
        const clamped = mantissaInt > this.maxMantissa ? this.maxMantissa : mantissaInt;
        return this._encoded(sign, 0, clamped);
    }

    // Apply mantissa carry, overflow and OCP special-value rules to a rounded
    // (exponent, mantissa) pair, then classify it. Shared by encode() and
    // encodeString() so both paths agree on format semantics.
    _finalizeEncoded(sign, biasedExponent, mantissaInt, roundingMode, overflowMode) {
        // Rounding up out of the top of the binade carries into the exponent.
        if (mantissaInt >= this.mantissaSpan) {
            mantissaInt = 0;
            biasedExponent++;
        }

        if (this._overflows(biasedExponent, mantissaInt)) {
            // IEEE 754 §7.4 makes overflow rounding-mode-dependent: a directed
            // mode pointing toward zero must never invent an infinity. That is
            // conformance, not a preference, so it wins over overflowMode.
            const shouldClamp =
                roundingMode === ROUNDING_MODES.towardZero ||
                (roundingMode === ROUNDING_MODES.towardNegative && sign === 0) ||
                (roundingMode === ROUNDING_MODES.towardPositive && sign === 1);

            if (shouldClamp) {
                return this.getMaxNormal(sign === 1);
            }
            return this._overflowResult(sign, overflowMode);
        }

        // Classification defers to the shared regime rules so that an encoded
        // result can never disagree with classify() about what it is.
        return this._encoded(sign, biasedExponent, mantissaInt);
    }

    // Is a rounded (exponent, mantissa) pair past the normal range? Three ways:
    //  - the exponent ran off the top of the field;
    //  - the format reserves maxExponent entirely (Infinity + NaN);
    //  - OCP-style, the value rounded INTO the reserved all-ones-mantissa
    //    NaN slot at maxExponent, which sits one step above max normal.
    // The third is an overflow like the others - E4M3's 480 slot is not a
    // representable finite value.
    _overflows(biasedExponent, mantissaInt) {
        const reservedNaNSlot = this.hasNaN && !this.hasInfinity &&
            biasedExponent === this.maxExponent && mantissaInt >= this.maxMantissa;
        return biasedExponent > this.maxExponent ||
            (biasedExponent === this.maxExponent && this.hasInfinity) ||
            reservedNaNSlot;
    }

    // The encoded result for a magnitude that overflowed the format, once the
    // IEEE directed-rounding clamp (which outranks it) has been ruled out.
    //
    // `saturate` always clamps. `overflow` produces the format's out-of-range
    // encoding - Infinity if it has one, otherwise NaN, otherwise it has
    // nowhere to go and clamps too. `hasNaN` is safe to test directly: the
    // constructor reconciles it with the layout, so a degenerate layout such
    // as s1e5m0 with an Infinity, which has no pattern to spare for NaN, reads
    // false here and clamps rather than reaching a getNaN() that would throw.
    _overflowResult(sign, overflowMode) {
        if (overflowMode === OVERFLOW_MODES.overflow) {
            if (this.hasInfinity) return this.getInfinity(sign === 1);
            if (this.hasNaN) return this.getNaN();
        }
        return this.getMaxNormal(sign === 1);
    }

    // The encoded result for a NaN input, sign ignored. Without a NaN encoding
    // (implementation-defined per MX §5.3.2-5.3.4) this follows PTX
    // `cvt.satfinite`: "NaN results are converted to positive MAX_NORM".
    _encodeNaN() {
        if (this.nanTarget() === 'nan') return this.getNaN();
        return this.getMaxNormal(false);
    }

    // Build an encoded result from raw fields. The flags are derived from
    // classify()'s own classifier so the two can never disagree, and invalid
    // fields throw here.
    _encoded(sign, exponent, mantissa) {
        // Normalize first: the number path's mantissa may be an unsafe integer,
        // which _validateFields() refuses only from outside callers.
        const field = this._validateFields(
            sign, exponent, normalizeField(mantissa, this.mantissaBits));
        const kind = this._classifyField(exponent, field);
        return {
            sign,
            exponent,
            mantissa: field,
            isNormal: kind === 'Normal',
            isSubnormal: kind === 'Subnormal',
            isZero: kind === 'Zero',
            isInfinite: kind === 'Infinity',
            isNaN: kind === 'NaN'
        };
    }

    // Do these fields spell NaN in this format?
    //
    // This and _isInfinityPattern() are the ONLY places the IEEE-versus-OCP
    // regime rule is written down. classify(), decode() and _finalizeEncoded()
    // all defer to them, so a bit pattern cannot be a NaN to one and a number to
    // another — which is a difference no test would notice until it produced a
    // wrong answer somewhere far away.
    _isNaNPattern(exponent, mantissa) {
        // hasNaN is already false with no exponent field.
        if (exponent !== this.maxExponent) return false;
        if (!this.hasNaN) return false;
        // IEEE-style: any non-zero mantissa at maxExponent is NaN, since mantissa
        // zero is taken by Infinity. OCP-style: only the all-ones mantissa is.
        return this.hasInfinity ? !fieldIsZero(mantissa) : mantissa === this.maxMantissa;
    }

    // Do these fields spell Infinity in this format?
    _isInfinityPattern(exponent, mantissa) {
        return this.exponentBits > 0 && this.hasInfinity &&
            exponent === this.maxExponent && fieldIsZero(mantissa);
    }

    // Validate raw encoded fields before decoding/formatting so that malformed
    // inputs (out-of-range exponent/mantissa, non-integer or negative fields)
    // fail loudly instead of producing plausible-looking wrong values. Returns
    // the mantissa in the representation this width uses.
    _validateFields(sign, exponent, mantissa) {
        if (!Number.isInteger(sign) || sign < 0 || sign > 1) {
            throw new RangeError(`sign must be 0 or 1, got ${sign}`);
        }
        if (this.signBits === 0 && sign !== 0) {
            throw new RangeError('sign must be 0 for unsigned formats');
        }
        if (!Number.isInteger(exponent) || exponent < 0 || exponent > this.maxExponent) {
            throw new RangeError(`exponent must be an integer in [0, ${this.maxExponent}], got ${exponent}`);
        }
        return validateField(mantissa, this.mantissaBits, this.maxMantissa, 'mantissa');
    }

    // Put a raw mantissa into the representation this width uses, so it
    // compares === with the library's.
    normalizeMantissa(value) {
        return normalizeField(value, this.mantissaBits);
    }

    // The significand an encoding denotes: the implicit-bit-less "0.x" in the
    // subnormal regime and on a fixed-point layout (whose hasSubnormals is
    // always true), "1.x" everywhere else. Exponent field 0 only carries a
    // 0.x significand in a format that has subnormals; in E8M0 it is an
    // ordinary normal binade. Rounds for a field wider than 53 bits.
    significand(exponent, mantissa) {
        const fraction = Number(mantissa) / this.mantissaSpan;
        return exponent === 0 && this.hasSubnormals ? fraction : 1.0 + fraction;
    }

    // The same as exact decimal text, for a field wider than 53 bits (see
    // showsDecodedSignificand()). A significand is dyadic, so its decimal
    // always terminates.
    exactSignificandString(exponent, mantissa) {
        const exact = this._exactSignificand(exponent, mantissa);
        return dyadicToExactDecimal(0, exact.significand, exact.exponent);
    }

    // The power of two an exponent field scales the significand by, as a
    // number, or null where there is none: a layout with no exponent field,
    // or an Infinity/NaN encoding (which is why the mantissa is needed: at
    // maxExponent an OCP-style format keeps normals beside its NaN).
    // Subnormals share the smallest normal's exponent, 1 - bias. A format with
    // no subnormals uses field 0 as a normal binade of its own, so it reads
    // 0 - bias. Every surface's "actual exponent" comes from here.
    unbiasedExponent(exponent, mantissa = 0) {
        if (this.exponentBits === 0) return null;
        if (exponent === this.maxExponent) {
            const kind = this.classify(0, exponent, mantissa);
            if (kind === 'Infinity' || kind === 'NaN') return null;
        }
        return (exponent === 0 && this.hasSubnormals ? 1 : exponent) - this.bias;
    }

    // unbiasedExponent() as the text surfaces show: "128 - 127 = 1", with the
    // subnormal regime's 1 in place of its field 0, "Special" for Infinity
    // and NaN, and "N/A" with no exponent field.
    exponentText(exponent, mantissa = 0) {
        if (this.exponentBits === 0) return 'N/A';
        const value = this.unbiasedExponent(exponent, mantissa);
        if (value === null) return 'Special';
        return `${value + this.bias} - ${this.bias} = ${value}`;
    }

    // The significand as an exact value, in _exactValue()'s shape: the field
    // under an implicit bit, or without one where significand() says 0.x.
    _exactSignificand(exponent, mantissa) {
        const field = fieldToBigInt(this._validateFields(0, exponent, mantissa));
        const implicit = exponent === 0 && this.hasSubnormals ? 0n : 1n;
        return {
            kind: 'finite',
            sign: 0,
            significand: (implicit << BigInt(this.mantissaBits)) + field,
            exponent: -this.mantissaBits,
        };
    }

    // The human-readable name for what an encoding holds, shared by every
    // surface: classify()'s answer plus signs on zero and infinity, and
    // 'Fixed-point' for a layout with no exponent field.
    typeLabel(sign, exponent, mantissa) {
        const kind = this.classify(sign, exponent, mantissa);
        switch (kind) {
            case 'Zero': return sign ? '-Zero' : '+Zero';
            case 'Infinity': return sign ? '-Infinity' : '+Infinity';
            case 'NaN': return 'NaN';
            default: // 'Normal' | 'Subnormal'
                return this.exponentBits === 0 ? 'Fixed-point' : kind;
        }
    }

    // Decode floating-point representation to decimal. The result is a double,
    // so a mantissa wider than 53 bits rounds here.
    decode(sign, exponent, mantissa) {
        const field = this._validateFields(sign, exponent, mantissa);
        const fraction = Number(field) / this.mantissaSpan;

        // Special handling for 0 exponent bits (fixed-point format)
        if (this.exponentBits === 0) {
            return sign ? -fraction : fraction;
        }

        // Special values are decided by classify(), so decode() and classify()
        // cannot disagree about which patterns are special. Anything the format
        // does not reserve falls through and decodes as an ordinary number,
        // including a normal living at maxExponent (OCP-style).
        switch (this._classifyField(exponent, field)) {
            case 'NaN':
                return NaN;
            case 'Infinity':
                return sign ? -Infinity : Infinity;
            case 'Zero':
                return sign ? -0 : 0;
            case 'Subnormal': {
                const value = fraction * Math.pow(2, 1 - this.bias);
                return sign ? -value : value;
            }
            default: {
                // Normal: the implicit leading 1 is not stored.
                const value = (1.0 + fraction) * Math.pow(2, exponent - this.bias);
                return sign ? -value : value;
            }
        }
    }

    // Sign field for a requested sign. A format with no sign bit has only one
    // sign to give: asking for a negative zero/infinity/max-normal there used to
    // hand back sign=1, which is not a representable field value - decode() and
    // toBinaryString() both reject it.
    _signField(negative) {
        return this.signBits > 0 && negative ? 1 : 0;
    }

    getZero(negative = false) {
        if (!this.hasSubnormals) {
            throw new Error('Format does not support Zero');
        }
        return this._encoded(this._signField(negative), 0, 0);
    }

    // The value to return when a magnitude rounds to nothing. A format without a
    // zero encoding (E8M0) has no such value, so it saturates to its smallest
    // representable magnitude instead - consistent with the library never
    // inventing an encoding. The fields are the same ones getZero() would build;
    // classify() simply calls them 'Normal' when hasSubnormals is false.
    // getZero() itself stays strict so an external caller asking a zero-less
    // format for its zero still gets an error.
    _encodeZero(negative) {
        return this._encoded(this._signField(negative), 0, 0);
    }

    getMaxNormal(negative = false) {
        let exp = this.maxExponent;
        let mant = this.maxMantissa;

        if (this.hasInfinity) {
            // maxExponent with mantissa=0 is Infinity, so max normal is one exponent below
            exp = this.maxExponent - 1;
        } else if (this.hasNaN) {
            // OCP-style: only all-ones mantissa at maxExponent is NaN.
            // Max normal is (maxExponent, maxMantissa - 1).
            //
            // With no mantissa field there is no step to take back: the all-ones
            // mantissa IS the empty mantissa, so NaN claims the whole maxExponent
            // slot and the max normal has to give up the exponent instead.
            if (this.mantissaBits > 0) {
                mant = fieldPredecessor(this.maxMantissa);
            } else {
                exp = this.maxExponent - 1;
            }
        }

        return this._encoded(this._signField(negative), exp, mant);
    }

    // The smallest positive normal, and the largest and smallest positive
    // subnormal, or null where the format has none. Unlike getZero() and
    // getInfinity() these do not throw: every surface that lists them (preset
    // buttons, the visualizer, get_format_info) wants to leave an absent one
    // out, and classify() decides absence so they cannot disagree with it. A
    // fixed-point layout's smallest nonzero magnitude is its min normal, since
    // classify() calls it Normal; it has no subnormals.
    getMinNormal() {
        return this.exponentBits === 0
            ? this._positiveEncodingOf('Normal', 0, 1)
            : this._positiveEncodingOf('Normal', this.hasSubnormals ? 1 : 0, 0);
    }

    getMaxSubnormal() {
        return this._positiveEncodingOf('Subnormal', 0, this.maxMantissa);
    }

    getMinSubnormal() {
        return this._positiveEncodingOf('Subnormal', 0, 1);
    }

    // The positive encoding with these fields when they fit the layout and
    // classify() calls it `kind`, else null. s1e1m0 with an Infinity, say, has
    // no normal at exponent field 1: that pattern is its Infinity.
    _positiveEncodingOf(kind, exponent, mantissa) {
        if (mantissa > this.maxMantissa) return null;
        return this.classify(0, exponent, mantissa) === kind
            ? this._encoded(0, exponent, mantissa)
            : null;
    }

    getInfinity(negative = false) {
        if (!this.hasInfinity) {
            throw new Error('Format does not support Infinity');
        }
        return this._encoded(this._signField(negative), this.maxExponent, 0);
    }

    getNaN() {
        if (!this.hasNaN) {
            throw new Error('Format does not support NaN');
        }
        // IEEE-style (hasInfinity): canonical quiet NaN sets the mantissa MSB.
        // OCP-style (!hasInfinity): only all-ones mantissa is NaN.
        const nanMantissa = this.hasInfinity
            ? this.mantissaSpan / 2
            : this.maxMantissa;
        return this._encoded(0, this.maxExponent, nanMantissa);
    }

    // Classify an encoded value as 'Zero' | 'Subnormal' | 'Normal' |
    // 'Infinity' | 'NaN'. Uses the same regime rules as encode/decode so every
    // surface (web UI, WebMCP, CLI) agrees on what a bit pattern represents.
    classify(sign, exponent, mantissa) {
        return this._classifyField(exponent, this._validateFields(sign, exponent, mantissa));
    }

    // classify() on an already-validated, already-normalized mantissa.
    _classifyField(exponent, mantissa) {
        if (this.exponentBits === 0) {
            // Fixed-point: only zero versus a finite value.
            return fieldIsZero(mantissa) ? 'Zero' : 'Normal';
        }

        if (this._isNaNPattern(exponent, mantissa)) return 'NaN';
        if (this._isInfinityPattern(exponent, mantissa)) return 'Infinity';
        // Anything left at maxExponent is a normal living there (OCP-style).

        if (exponent === 0 && this.hasSubnormals) {
            return fieldIsZero(mantissa) ? 'Zero' : 'Subnormal';
        }
        return 'Normal';
    }

    // Convert to binary string, exact at any width.
    toBinaryString(sign, exponent, mantissa) {
        const field = this._validateFields(sign, exponent, mantissa);
        const signStr = this.signBits ? sign.toString() : '';
        const expStr = this.exponentBits > 0 ? exponent.toString(2).padStart(this.exponentBits, '0') : '';
        const mantStr = this.mantissaBits > 0 ? field.toString(2).padStart(this.mantissaBits, '0') : '';
        return signStr + expStr + mantStr;
    }

    // Convert to hex string
    toHexString(sign, exponent, mantissa) {
        return binaryToHexString(this.toBinaryString(sign, exponent, mantissa));
    }

    // The inverse of toBinaryString(): split a full-width bit pattern into this
    // layout's fields, so no surface slices it on its own. The mantissa comes
    // back in this width's representation; sign and exponent are plain numbers.
    fromBinaryString(binary) {
        validateBinaryString(binary, this.totalBits);
        let index = 0;
        const sign = Number(binaryFieldValue(binary.substring(index, index + this.signBits)));
        index += this.signBits;
        const exponent = Number(binaryFieldValue(binary.substring(index, index + this.exponentBits)));
        index += this.exponentBits;
        const mantissa = this.normalizeMantissa(
            binaryFieldValue(binary.substring(index, index + this.mantissaBits)));
        return { sign, exponent, mantissa };
    }

    // The inverse of toHexString(); see hexToBinaryString() for what is
    // accepted.
    fromHexString(hex) {
        return this.fromBinaryString(hexToBinaryString(hex, this.totalBits));
    }

    // Construct a FloatingPoint from a FORMATS preset key.
    static fromFormat(key) {
        const preset = FORMATS[key];
        if (!preset || preset.isInteger) {
            throw new RangeError(`Unknown floating-point format: "${key}"`);
        }
        return new FloatingPoint(preset.sign, preset.exponent, preset.mantissa, preset);
    }

    // True when `str` is a plain decimal literal that encodeString() can round
    // exactly. Callers use this to choose between encodeString() and
    // encode(Number(...)): keyword inputs ("inf", "nan") and hex bit patterns
    // must take the numeric path, since Number("inf") is NaN.
    static isDecimalLiteral(str) {
        return parseDecimalLiteral(str) !== null;
    }
}

// Export for Node.js (testing) and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FloatingPoint, Integer, FORMATS, ROUNDING_MODES, OVERFLOW_MODES,
        CONVERSION_LOSS_KINDS, CONVERSION_LOSS_LABELS,
        sameValue, sameEncoding, normalizedEncoding, conversionLoss, convertEncoded,
        valueKeyword, showsDecodedValue, encodingValueText, showsDecodedSignificand,
    };
}
