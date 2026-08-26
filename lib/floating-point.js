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
// So ~5000 is all the range that is strictly needed; the limit keeps a wide
// margin over that so formats with a custom bias stay on the exact path too.
// Past the limit the digits can no longer change the answer - only the sign and
// the rounding mode can, which is what _encodeOutOfRange() applies.
const MAX_DECIMAL_EXPONENT = 20000;

// Separate cost guard on pathologically long input. This deliberately is NOT
// folded into the magnitude bound above: a number of ordinary size written with
// a very long fraction (0.749...9) must still take the exact path, or it would
// fall back to Number() and be silently double-rounded.
const MAX_DECIMAL_DIGITS = 100000;

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
    if (parsed.num === 0n) return significand === 0n;
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

// Integer class for integer format handling
class Integer {
    constructor(bits, signed = true, options = {}) {
        // Integer arithmetic here is double-based; widths above 64 bits are
        // meaningless and 0/negative widths are nonsensical. Values above 53
        // significant bits are inherently lossy (documented), but 1–64 is the
        // supported range shared with resolveFormat and the URL parser.
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
        this.signed = signed;
        this.isInteger = true;
        this.fractionBits = fractionBits;
        this.scale = Math.pow(2, fractionBits);
        // MX §5.3.4 allows the most-negative encoding (0x80 for MXINT8) to be
        // left unused, keeping the positive and negative extremes symmetric and
        // avoiding a negative bias.
        this.symmetric = options.symmetric === true;

        // Calculate range based on signedness. These stay in RAW integer units
        // because _createEncoded() stores them as two's complement; the
        // real-valued bounds are derived below.
        // Use Math.pow to avoid JavaScript's 32-bit signed integer limitation with <<
        if (signed) {
            this.minValue = this.symmetric
                ? -(Math.pow(2, bits - 1) - 1)
                : -Math.pow(2, bits - 1);
            this.maxValue = Math.pow(2, bits - 1) - 1;
        } else {
            this.minValue = 0;
            this.maxValue = Math.pow(2, bits) - 1;
        }

        this.minRealValue = this.minValue / this.scale;
        this.maxRealValue = this.maxValue / this.scale;

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

    // Encode a value into this integer format (with saturation).
    //
    // Strings are routed to encodeString() so their digits survive: coercing
    // one here would round decimal -> double -> format, which double-rounds.
    // Numbers go straight to the number-only core.
    encode(value, options = {}) {
        return typeof value === 'string'
            ? this.encodeString(value, options)
            : this._encodeNumber(value, options);
    }

    // Encode a JavaScript number. Never call this with a string - encode() and
    // encodeString() are the entry points, and both funnel here with a number,
    // which is what keeps the two of them from recursing into each other.
    _encodeNumber(value, options = {}) {
        const roundingMode = resolveRoundingMode(options);
        // Validated for API symmetry; integers always saturate, so the resolved
        // mode has no effect on the result.
        resolveOverflowMode(options, this);

        // Handle special floating-point values
        if (isNaN(value)) {
            // NaN becomes 0 for integers
            return this._createEncoded(0);
        }
        
        if (!isFinite(value)) {
            // Infinity saturates to max/min
            if (value > 0) {
                return this._createEncoded(this.maxValue);
            } else {
                return this._createEncoded(this.minValue);
            }
        }
        
        // Round on the SCALED value so a fixed-point format rounds at its own
        // grid (1/2^fractionBits) rather than at whole numbers.
        let intValue = roundInteger(value * this.scale, roundingMode);
        
        // Saturate to range
        if (intValue > this.maxValue) {
            intValue = this.maxValue;
        } else if (intValue < this.minValue) {
            intValue = this.minValue;
        }
        
        return this._createEncoded(intValue);
    }

    // Encode a decimal string to this integer format, rounding the exact decimal
    // in one step. Falls back to the Number() path for non-decimal inputs
    // (Infinity, NaN, hex).
    encodeString(str, options = {}) {
        const parsed = parseDecimalLiteral(str);
        if (parsed === null) return this._encodeNumber(Number(str), options);

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
            let saturated = parsed.sign ? -magnitude : magnitude;
            if (saturated > this.maxValue) saturated = this.maxValue;
            else if (saturated < this.minValue) saturated = this.minValue;
            return this._createEncoded(saturated);
        }

        // Scale the NUMERATOR before rounding so the exact decimal still reaches
        // the format in a single correctly-rounded step. Scaling afterwards
        // would round twice, which is the bug encodeString() exists to avoid.
        const magnitude = roundQuotient(
            parsed.num << BigInt(this.fractionBits), parsed.den, parsed.sign, roundingMode);
        let intValue = parsed.sign ? -magnitude : magnitude;

        if (intValue > BigInt(this.maxValue)) intValue = BigInt(this.maxValue);
        else if (intValue < BigInt(this.minValue)) intValue = BigInt(this.minValue);

        return this._createEncoded(Number(intValue));
    }

    isExactlyRepresentable(str, encoded = this.encode(str)) {
        const parsed = parseDecimalLiteral(str);
        const intValue = this._encodedIntValue(encoded);
        return decimalEqualsDyadic(
            parsed,
            intValue < 0n ? 1 : 0,
            intValue < 0n ? -intValue : intValue,
            -this.fractionBits);
    }

    toExactDecimalString(encoded) {
        const intValue = this._encodedIntValue(encoded);
        return dyadicToExactDecimal(
            intValue < 0n ? 1 : 0,
            intValue < 0n ? -intValue : intValue,
            -this.fractionBits);
    }

    _encodedIntValue(encoded) {
        if (encoded.intValue !== undefined) return BigInt(encoded.intValue);
        const rawBits = BigInt(encoded.mantissa);
        const signBit = 1n << BigInt(this.bits - 1);
        return this.signed && rawBits >= signBit
            ? rawBits - (1n << BigInt(this.bits))
            : rawBits;
    }
    
    _createEncoded(intValue) {
        // Convert to two's complement representation for storage
        // Use Math.pow to avoid JavaScript's 32-bit limitation
        let rawBits;
        if (intValue < 0) {
            // Two's complement: add 2^bits to negative values
            rawBits = Math.pow(2, this.bits) + intValue;
        } else {
            rawBits = intValue;
        }
        
        return {
            sign: 0,
            exponent: 0,
            mantissa: rawBits,
            intValue: intValue,
            realValue: intValue / this.scale,
            isNormal: false,
            isSubnormal: false,
            isZero: intValue === 0,
            isInfinite: false,
            isNaN: false,
            isInteger: true
        };
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
        // Handle two's complement for signed types
        if (this.signed) {
            // Use Math.pow for sign bit check to handle 32-bit properly
            const signBitMask = Math.pow(2, this.bits - 1);
            if (rawBits >= signBitMask) {
                // Negative number: convert from two's complement
                return (rawBits - Math.pow(2, this.bits)) / this.scale;
            }
        }

        return rawBits / this.scale;
    }

    // Convert to binary string
    toBinaryString(sign, exponent, mantissa) {
        return mantissa.toString(2).padStart(this.bits, '0');
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
        if (options.bias !== undefined && !Number.isInteger(options.bias)) {
            throw new RangeError('bias must be an integer');
        }

        this.signBits = signBits;
        this.exponentBits = exponentBits;
        this.mantissaBits = mantissaBits;
        this.totalBits = signBits + exponentBits + mantissaBits;

        // Derived once so the many places that need them cannot drift apart.
        // Both are correct at mantissaBits === 0 without a special case: the
        // field spans a single value, 0, which is also the largest it can hold.
        // Use Math.pow rather than bit-shifts to avoid JS 32-bit << behavior.
        this.mantissaSpan = Math.pow(2, mantissaBits); // one past the largest field value
        this.maxMantissa = this.mantissaSpan - 1;

        // Support custom bias (for OCP formats) or use standard formula
        // Use Math.pow/2** rather than bit-shifts to avoid JS 32-bit << behavior
        this.bias = options.bias !== undefined
            ? options.bias
            : (exponentBits > 0 ? Math.pow(2, exponentBits - 1) - 1 : 0);

        this.maxExponent = exponentBits > 0 ? Math.pow(2, exponentBits) - 1 : 0;
        
        // Special value support flags (default true for backward compatibility)
        this.hasInfinity = options.hasInfinity !== false;
        this.hasNaN = options.hasNaN !== false;
        // When false, exponent field 0 denotes the normal value 2^(0 - bias)
        // rather than zero/subnormal, and the format has no zero encoding at
        // all. This is what OCP MX §5.4.1 Table 7 requires of E8M0.
        this.hasSubnormals = options.hasSubnormals !== false;

        // Per-format overflow default, chosen so that behavior is unchanged
        // from before OVERFLOW_MODES existed: a format with somewhere to put an
        // infinity overflows to it, and a format without one clamps. A
        // fixed-point layout (no exponent field) has no such encoding at all.
        this.defaultOverflowMode = options.overflowMode ||
            ((this.hasInfinity && exponentBits > 0)
                ? OVERFLOW_MODES.overflow
                : OVERFLOW_MODES.saturate);
    }

    // What an out-of-range magnitude becomes in this format under `overflowMode`.
    // Returns 'infinity' | 'nan' | 'maxNormal'. Surfaces turn this into display
    // text; the RULE lives here so the UI, CLI and MCP can never disagree.
    overflowTarget(overflowMode = this.defaultOverflowMode) {
        if (overflowMode === OVERFLOW_MODES.saturate) return 'maxNormal';
        if (this.exponentBits === 0) return 'maxNormal';
        if (this.hasInfinity) return 'infinity';
        if (this._hasNaNEncoding()) return 'nan';
        return 'maxNormal';
    }

    // Encode a value into this floating-point format.
    //
    // Strings are routed to encodeString() so their digits survive: coercing
    // one here would round decimal -> double -> format, which double-rounds.
    // Numbers go straight to the number-only core.
    encode(value, options = {}) {
        return typeof value === 'string'
            ? this.encodeString(value, options)
            : this._encodeNumber(value, options);
    }

    // Encode a JavaScript number. Never call this with a string - encode() and
    // encodeString() are the entry points, and both funnel here with a number,
    // which is what keeps the two of them from recursing into each other.
    _encodeNumber(value, options = {}) {
        const roundingMode = resolveRoundingMode(options);
        const overflowMode = resolveOverflowMode(options, this);

        // A format with no exponent bits is a different beast - a fixed-point
        // scale with no binade, no subnormals and no special values - so it gets
        // its own encoder rather than branching through the float logic below.
        if (this.exponentBits === 0) {
            return this._encodeFixedNumber(value, roundingMode);
        }

        if (isNaN(value)) {
            if (this._hasNaNEncoding()) {
                return this.getNaN();
            } else {
                // Formats without NaN return zero
                return this._encodeZero(false);
            }
        }

        // Unsigned formats clamp every negative magnitude to zero - including
        // -Infinity. This has to happen BEFORE the special-value handling below:
        // getInfinity()/getMaxNormal() would otherwise hand back sign=1, which is
        // not a legal encoding for a format with no sign bit, and decode() and
        // toBinaryString() both reject it.
        if (this.signBits === 0 && (value < 0 || Object.is(value, -0))) {
            return this._encodeZero(false);
        }

        if (!isFinite(value)) {
            // An infinite INPUT is infinite under every rounding mode, so the
            // IEEE directed-rounding clamp does not apply here - only the
            // saturation mode decides. See overflow-mode-plan §2.2.
            return this._overflowResult(value < 0 ? 1 : 0, overflowMode);
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
        if (parsed === null) return this._encodeNumber(Number(str), options);

        const roundingMode = resolveRoundingMode(options);
        const overflowMode = resolveOverflowMode(options, this);
        const sign = parsed.sign;

        // Unsigned formats clamp negatives to zero before any rounding happens.
        if (this.signBits === 0 && sign === 1) return this._encodeZero(false);

        if (parsed.outOfRange !== undefined) {
            return this._encodeOutOfRange(sign, parsed.outOfRange, roundingMode, overflowMode);
        }

        const { num, den } = parsed;
        // Zero has no rounding to do.
        if (num === 0n) return this._encodeNumber(sign ? -0 : 0, options);

        const mantissaScale = BigInt(this.mantissaBits);

        if (this.exponentBits === 0) {
            // Fixed-point: value = mantissa / 2^mantissaBits
            const mantissaInt = this.mantissaBits > 0 ?
                Number(roundQuotient(num << mantissaScale, den, sign, roundingMode)) :
                0;
            return this._finalizeFixed(sign, mantissaInt);
        }

        // Binary exponent: the unique e with 2^e <= num/den < 2^(e+1). The bit
        // length difference is either e or e+1, so verify and correct.
        let exponent = bigIntBitLength(num) - bigIntBitLength(den);
        const scaled = exponent >= 0 ? den << BigInt(exponent) : den;
        const probe = exponent >= 0 ? num : num << BigInt(-exponent);
        if (probe < scaled) exponent--;

        // Short-circuit overflow before building an enormous shift.
        if (exponent + this.bias > this.maxExponent) {
            return this._finalizeEncoded(sign, this.maxExponent + 1, 0, roundingMode, overflowMode);
        }

        // Subnormals share the fixed exponent 2^(1-bias); normals use their own
        // binade. In both cases we round value / 2^(effective - mantissaBits).
        // A format with no subnormals (E8M0) has nothing below exponent field 0,
        // so anything under it saturates to the minimum representable magnitude.
        if (!this.hasSubnormals && exponent + this.bias < 0) {
            return this._encodeZero(sign === 1);
        }
        const isSubnormal = this.hasSubnormals && exponent < 1 - this.bias;
        const effective = isSubnormal ? 1 - this.bias : exponent;
        const shift = this.mantissaBits - effective;
        const significand = roundQuotient(
            shift >= 0 ? num << BigInt(shift) : num,
            shift >= 0 ? den : den << BigInt(-shift),
            sign, roundingMode,
            this.mantissaBits === 0 && !isSubnormal ? (exponent + this.bias) % 2 === 1 : null);

        // Normals carry an implicit leading 1 that is not stored.
        const mantissaInt = Number(isSubnormal ? significand : significand - (1n << mantissaScale));
        return this._finalizeEncoded(sign, isSubnormal ? 0 : exponent + this.bias,
            mantissaInt, roundingMode, overflowMode);
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
        const kind = this.classify(encoded.sign, encoded.exponent, encoded.mantissa);
        if (kind === 'NaN') return 'NaN';
        if (kind === 'Infinity') return encoded.sign ? '-Infinity' : 'Infinity';

        const { significand, exponent } = this._dyadicComponents(encoded, kind);
        return dyadicToExactDecimal(encoded.sign, significand, exponent);
    }

    // Unsigned magnitude and binary exponent of an encoded finite value.
    _dyadicComponents(encoded, kind) {
        if (this.exponentBits === 0) {
            return {
                significand: BigInt(encoded.mantissa),
                exponent: -this.mantissaBits,
            };
        }
        if (kind === 'Zero') return { significand: 0n, exponent: 0 };
        if (kind === 'Subnormal') {
            return {
                significand: BigInt(encoded.mantissa),
                exponent: 1 - this.bias - this.mantissaBits,
            };
        }
        return {
            significand: (1n << BigInt(this.mantissaBits)) + BigInt(encoded.mantissa),
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
        if (this.exponentBits > 0 && !this.hasSubnormals) {
            return this._encodeZero(sign === 1);
        }
        return this.exponentBits === 0
            ? this._finalizeFixed(sign, magnitude)
            : this._finalizeEncoded(sign, 0, magnitude, roundingMode, overflowMode);
    }

    // Encode a number into a fixed-point format (exponentBits === 0), where the
    // value is simply mantissa / 2^mantissaBits. There is no exponent to place,
    // so there are no binades, no subnormals, and nowhere to put Infinity or
    // NaN: out-of-range magnitudes saturate and NaN encodes as zero, matching
    // the NaN-without-NaN-support policy of the float path.
    _encodeFixedNumber(value, roundingMode) {
        if (isNaN(value)) {
            return this._finalizeFixed(0, 0);
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
        const maxMantissa = this.maxMantissa;

        // Rounding up out of the top of the binade carries into the exponent.
        if (mantissaInt >= this.mantissaSpan) {
            mantissaInt = 0;
            biasedExponent++;
        }

        // Overflow: the value exceeds the normal range. Three ways to get here:
        //  - the exponent ran off the top of the field;
        //  - the format reserves maxExponent entirely (Infinity + NaN);
        //  - OCP-style, the value rounded INTO the reserved all-ones-mantissa
        //    NaN slot at maxExponent, which sits one step above max normal.
        // The third is an overflow like the others - E4M3's 480 slot is not a
        // representable finite value - so it takes the same path.
        const reservedNaNSlot = this.hasNaN && !this.hasInfinity &&
            biasedExponent === this.maxExponent && mantissaInt >= maxMantissa;

        if (biasedExponent > this.maxExponent ||
            (biasedExponent === this.maxExponent && this.hasInfinity) ||
            reservedNaNSlot) {
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

    // The encoded result for a magnitude that overflowed the format, once the
    // IEEE directed-rounding clamp (which outranks it) has been ruled out.
    //
    // `saturate` always clamps. `overflow` produces the format's out-of-range
    // encoding - Infinity if it has one, otherwise NaN, otherwise it has
    // nowhere to go and clamps too. Testing _hasNaNEncoding() rather than the
    // raw `hasNaN` intent flag matters: a degenerate layout such as
    // s1e5m0 {hasInfinity: true, hasNaN: true} claims NaN but has no pattern
    // to spare for it, and getNaN() would throw.
    _overflowResult(sign, overflowMode) {
        if (overflowMode === OVERFLOW_MODES.overflow) {
            if (this.hasInfinity) return this.getInfinity(sign === 1);
            if (this._hasNaNEncoding()) return this.getNaN();
        }
        return this.getMaxNormal(sign === 1);
    }

    // Build an encoded result from raw fields.
    //
    // Every classification flag is DERIVED from classify(), so a result object
    // can never disagree with classify() about what it holds. Writing the flags
    // out by hand at each construction site used to allow exactly that: a
    // degenerate layout could get `isNormal: true` on what is really the zero
    // pattern. classify() also validates, so an impossible field combination
    // fails here rather than escaping into the UI.
    _encoded(sign, exponent, mantissa) {
        const kind = this.classify(sign, exponent, mantissa);
        return {
            sign,
            exponent,
            mantissa,
            isNormal: kind === 'Normal',
            isSubnormal: kind === 'Subnormal',
            isZero: kind === 'Zero',
            isInfinite: kind === 'Infinity',
            isNaN: kind === 'NaN'
        };
    }

    // True when this format actually has a bit pattern to spare for NaN.
    //
    // `hasNaN` states intent; representability is a separate question. With no
    // mantissa field the only pattern at maxExponent is (all-ones exponent,
    // empty mantissa) — which is exactly Infinity's encoding — so a format that
    // has infinity has nowhere left to put NaN, and encoding one would silently
    // produce a value that decodes back as Infinity.
    _hasNaNEncoding() {
        return this.hasNaN && (this.mantissaBits > 0 || !this.hasInfinity);
    }

    // Do these fields spell NaN in this format?
    //
    // This and _isInfinityPattern() are the ONLY places the IEEE-versus-OCP
    // regime rule is written down. classify(), decode() and _finalizeEncoded()
    // all defer to them, so a bit pattern cannot be a NaN to one and a number to
    // another — which is a difference no test would notice until it produced a
    // wrong answer somewhere far away.
    _isNaNPattern(exponent, mantissa) {
        if (this.exponentBits === 0 || exponent !== this.maxExponent) return false;
        if (!this.hasNaN) return false;
        // IEEE-style: any non-zero mantissa at maxExponent is NaN, since mantissa
        // zero is taken by Infinity. OCP-style: only the all-ones mantissa is.
        return this.hasInfinity ? mantissa !== 0 : mantissa === this.maxMantissa;
    }

    // Do these fields spell Infinity in this format?
    _isInfinityPattern(exponent, mantissa) {
        return this.exponentBits > 0 && this.hasInfinity &&
            exponent === this.maxExponent && mantissa === 0;
    }

    // Validate raw encoded fields before decoding/formatting so that malformed
    // inputs (out-of-range exponent/mantissa, non-integer or negative fields)
    // fail loudly instead of producing plausible-looking wrong values.
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
        const maxMantissa = this.maxMantissa;
        if (!Number.isInteger(mantissa) || mantissa < 0 || mantissa > maxMantissa) {
            throw new RangeError(`mantissa must be an integer in [0, ${maxMantissa}], got ${mantissa}`);
        }
    }

    // Decode floating-point representation to decimal
    decode(sign, exponent, mantissa) {
        this._validateFields(sign, exponent, mantissa);

        // Special handling for 0 exponent bits (fixed-point format)
        if (this.exponentBits === 0) {
            const value = mantissa / this.mantissaSpan;
            return sign ? -value : value;
        }

        // Special values are decided by classify(), so decode() and classify()
        // cannot disagree about which patterns are special. Anything the format
        // does not reserve falls through and decodes as an ordinary number,
        // including a normal living at maxExponent (OCP-style).
        switch (this.classify(sign, exponent, mantissa)) {
            case 'NaN':
                return NaN;
            case 'Infinity':
                return sign ? -Infinity : Infinity;
            case 'Zero':
                return sign ? -0 : 0;
            case 'Subnormal': {
                const value = (mantissa / this.mantissaSpan) * Math.pow(2, 1 - this.bias);
                return sign ? -value : value;
            }
            default: {
                // Normal: the implicit leading 1 is not stored.
                const value = (1.0 + mantissa / this.mantissaSpan) *
                    Math.pow(2, exponent - this.bias);
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
                mant = this.maxMantissa - 1;
            } else {
                exp = this.maxExponent - 1;
            }
        }

        return this._encoded(this._signField(negative), exp, mant);
    }

    getInfinity(negative = false) {
        if (!this.hasInfinity) {
            throw new Error('Format does not support Infinity');
        }
        return this._encoded(this._signField(negative), this.maxExponent, 0);
    }

    getNaN() {
        if (!this._hasNaNEncoding()) {
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
        this._validateFields(sign, exponent, mantissa);

        if (this.exponentBits === 0) {
            // Fixed-point: only zero versus a finite value.
            return mantissa === 0 ? 'Zero' : 'Normal';
        }

        if (this._isNaNPattern(exponent, mantissa)) return 'NaN';
        if (this._isInfinityPattern(exponent, mantissa)) return 'Infinity';
        // Anything left at maxExponent is a normal living there (OCP-style).

        if (exponent === 0 && this.hasSubnormals) {
            return mantissa === 0 ? 'Zero' : 'Subnormal';
        }
        return 'Normal';
    }

    // Convert to binary string
    toBinaryString(sign, exponent, mantissa) {
        this._validateFields(sign, exponent, mantissa);
        const signStr = this.signBits ? sign.toString() : '';
        const expStr = this.exponentBits > 0 ? exponent.toString(2).padStart(this.exponentBits, '0') : '';
        const mantStr = this.mantissaBits > 0 ? mantissa.toString(2).padStart(this.mantissaBits, '0') : '';
        return signStr + expStr + mantStr;
    }

    // Convert to hex string
    toHexString(sign, exponent, mantissa) {
        return binaryToHexString(this.toBinaryString(sign, exponent, mantissa));
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
    module.exports = { FloatingPoint, Integer, FORMATS, ROUNDING_MODES, OVERFLOW_MODES };
}
