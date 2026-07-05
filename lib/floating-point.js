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
// Returns the rounded integer mantissa.
function roundMantissa(scaledMantissa, sign, roundingMode) {
    switch (roundingMode) {
        case ROUNDING_MODES.tiesToEven: {
            const floor = Math.floor(scaledMantissa);
            const frac = scaledMantissa - floor;
            if (frac > 0.5) return floor + 1;
            if (frac < 0.5) return floor;
            // Exactly 0.5: round to even
            return (floor % 2 === 0) ? floor : floor + 1;
        }
        case ROUNDING_MODES.tiesToAway:
            return Math.round(scaledMantissa);
        case ROUNDING_MODES.towardZero:
            return Math.floor(scaledMantissa);
        case ROUNDING_MODES.towardPositive:
            return sign ? Math.floor(scaledMantissa) : Math.ceil(scaledMantissa);
        case ROUNDING_MODES.towardNegative:
            return sign ? Math.ceil(scaledMantissa) : Math.floor(scaledMantissa);
        default:
            throw new Error(`Unknown rounding mode: "${roundingMode}". ` +
                'Valid modes: tiesToEven, tiesToAway, towardZero, towardPositive, towardNegative.');
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
        default:
            throw new Error(`Unknown rounding mode: "${roundingMode}". ` +
                'Valid modes: tiesToEven, tiesToAway, towardZero, towardPositive, towardNegative.');
    }
}

// Integer class for integer format handling
class Integer {
    constructor(bits, signed = true) {
        // Integer arithmetic here is double-based; widths above 64 bits are
        // meaningless and 0/negative widths are nonsensical. Values above 53
        // significant bits are inherently lossy (documented), but 1–64 is the
        // supported range shared with resolveFormat and the URL parser.
        if (!Number.isInteger(bits) || bits < 1 || bits > 64) {
            throw new RangeError(`bits must be an integer between 1 and 64, got ${bits}`);
        }

        this.bits = bits;
        this.totalBits = bits;
        this.signed = signed;
        this.isInteger = true;
        
        // Calculate range based on signedness
        // Use Math.pow to avoid JavaScript's 32-bit signed integer limitation with <<
        if (signed) {
            this.minValue = -Math.pow(2, bits - 1);
            this.maxValue = Math.pow(2, bits - 1) - 1;
        } else {
            this.minValue = 0;
            this.maxValue = Math.pow(2, bits) - 1;
        }
        
        // Properties for compatibility with FloatingPoint
        this.signBits = 0;
        this.exponentBits = 0;
        this.mantissaBits = bits;
        this.bias = 0;
        this.maxExponent = 0;
        this.hasInfinity = false;
        this.hasNaN = false;
    }

    // Encode a decimal number to this integer format (with saturation)
    encode(value, options = {}) {
        const roundingMode = options.roundingMode || ROUNDING_MODES.tiesToEven;

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
        
        // Round to integer using specified rounding mode
        let intValue = roundInteger(value, roundingMode);
        
        // Saturate to range
        if (intValue > this.maxValue) {
            intValue = this.maxValue;
        } else if (intValue < this.minValue) {
            intValue = this.minValue;
        }
        
        return this._createEncoded(intValue);
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
    decodeBits(rawBits) {
        // Handle two's complement for signed types
        if (this.signed) {
            // Use Math.pow for sign bit check to handle 32-bit properly
            const signBitMask = Math.pow(2, this.bits - 1);
            if (rawBits >= signBitMask) {
                // Negative number: convert from two's complement
                return rawBits - Math.pow(2, this.bits);
            }
        }

        return rawBits;
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
        
        // Support custom bias (for OCP formats) or use standard formula
        // Use Math.pow/2** rather than bit-shifts to avoid JS 32-bit << behavior
        this.bias = options.bias !== undefined
            ? options.bias
            : (exponentBits > 0 ? Math.pow(2, exponentBits - 1) - 1 : 0);

        this.maxExponent = exponentBits > 0 ? Math.pow(2, exponentBits) - 1 : 0;
        
        // Special value support flags (default true for backward compatibility)
        this.hasInfinity = options.hasInfinity !== false;
        this.hasNaN = options.hasNaN !== false;
    }

    // Encode a decimal number to this floating-point format
    encode(value, options = {}) {
        const roundingMode = options.roundingMode || ROUNDING_MODES.tiesToEven;

        // Special handling for 0 exponent bits (fixed-point format)
        if (this.exponentBits === 0) {
            const maxMantissa = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 1 : 0;

            // NaN has no representation in a fixed-point format: encode zero,
            // matching the NaN-without-NaN-support policy of the float path.
            if (isNaN(value)) {
                return {
                    sign: 0,
                    exponent: 0,
                    mantissa: 0,
                    isNormal: false,
                    isSubnormal: false,
                    isZero: true,
                    isInfinite: false,
                    isNaN: false
                };
            }

            // Determine sign, preserving -0 and respecting unsigned formats.
            let sign = (value < 0 || Object.is(value, -0)) ? 1 : 0;
            if (this.signBits === 0) {
                // Unsigned format: clamp negatives to zero.
                if (sign === 1) {
                    value = 0;
                }
                sign = 0;
            }

            // Infinity and overflow saturate to the largest representable magnitude.
            if (!isFinite(value)) {
                return {
                    sign,
                    exponent: 0,
                    mantissa: maxMantissa,
                    isNormal: false,
                    isSubnormal: false,
                    isZero: maxMantissa === 0,
                    isInfinite: false,
                    isNaN: false
                };
            }

            // For fixed-point: value = mantissa / 2^mantissaBits
            let mantissaInt = this.mantissaBits > 0 ?
                roundMantissa(Math.abs(value) * Math.pow(2, this.mantissaBits), sign, roundingMode) :
                0;

            // Saturate to the representable field width (rounding an absolute
            // value never produces a negative mantissa, so only the upper
            // bound needs clamping).
            if (mantissaInt > maxMantissa) {
                mantissaInt = maxMantissa;
            }

            return {
                sign,
                exponent: 0,
                mantissa: mantissaInt,
                isNormal: false,
                isSubnormal: false,
                isZero: mantissaInt === 0,
                isInfinite: false,
                isNaN: false
            };
        }

        if (isNaN(value)) {
            if (this.hasNaN) {
                return this.getNaN();
            } else {
                // Formats without NaN return zero
                return this.getZero(false);
            }
        }

        if (!isFinite(value)) {
            if (this.hasInfinity) {
                return this.getInfinity(value < 0);
            } else {
                // Formats without Infinity saturate to max normal
                return this.getMaxNormal(value < 0);
            }
        }

        if (value === 0) {
            return this.getZero(this.signBits > 0 && Object.is(value, -0));
        }

        // Extract sign (unsigned formats clamp negatives to zero)
        const sign = value < 0 ? 1 : 0;
        if (this.signBits === 0 && sign === 1) {
            return this.getZero(false);
        }
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
        let mantissa = value / Math.pow(2, exponent) - 1.0;

        // Bias the exponent
        let biasedExponent = exponent + this.bias;

        // Handle subnormal numbers
        if (biasedExponent <= 0) {
            // Subnormal
            mantissa = value / Math.pow(2, 1 - this.bias);
            biasedExponent = 0;
        } else if (biasedExponent > this.maxExponent || 
                   (biasedExponent === this.maxExponent && this.hasInfinity)) {
            // Overflow: value exceeds the normal range.
            // For formats with infinity, maxExponent is fully reserved (infinity + NaN).
            const shouldClamp =
                roundingMode === ROUNDING_MODES.towardZero ||
                (roundingMode === ROUNDING_MODES.towardNegative && sign === 0) ||
                (roundingMode === ROUNDING_MODES.towardPositive && sign === 1);

            if (shouldClamp) {
                return this.getMaxNormal(sign === 1);
            }
            if (this.hasInfinity) {
                return this.getInfinity(sign === 1);
            } else {
                return this.getMaxNormal(sign === 1);
            }
        }

        // Convert mantissa to integer representation
        let mantissaInt = this.mantissaBits > 0 ?
            roundMantissa(mantissa * Math.pow(2, this.mantissaBits), sign, roundingMode) :
            0;

        /* istanbul ignore next */
        if (mantissaInt < 0) {
            // With the exponent correction above, the real mantissa is always in
            // [0, 1), so a negative rounded mantissa indicates a logic error.
            throw new RangeError(`Internal error: negative mantissa ${mantissaInt}`);
        }

        // Handle mantissa overflow after rounding
        if (mantissaInt >= Math.pow(2, this.mantissaBits)) {
            mantissaInt = 0;
            biasedExponent++;
            
            // Check for overflow after incrementing exponent
            if (biasedExponent > this.maxExponent ||
                (biasedExponent === this.maxExponent && this.hasInfinity)) {
                // Mantissa overflow only happens when rounding UP, which means
                // shouldClamp modes (towardZero, towardNegative for positive,
                // towardPositive for negative) can never reach here — they truncate.
                if (this.hasInfinity) {
                    return this.getInfinity(sign === 1);
                } else {
                    return this.getMaxNormal(sign === 1);
                }
            }
        }

        // For formats with NaN at maxExponent without infinity (OCP-style):
        // only all-ones mantissa is NaN. Clamp if we landed there.
        if (biasedExponent === this.maxExponent && this.hasNaN && !this.hasInfinity) {
            const maxMantissa = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 1 : 0;
            if (mantissaInt >= maxMantissa) {
                return this.getMaxNormal(sign === 1);
            }
        }

        // Determine classification based on format capabilities
        const atMaxExponent = biasedExponent === this.maxExponent;
        const isInfinite = this.hasInfinity && atMaxExponent && mantissaInt === 0;
        const maxMant = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 1 : 0;
        const isNaN_ = this.hasNaN && atMaxExponent && (
            this.hasInfinity ? mantissaInt !== 0 : mantissaInt === maxMant
        );
        const isSpecial = isInfinite || isNaN_;
        
        return {
            sign,
            exponent: biasedExponent,
            mantissa: mantissaInt,
            isNormal: biasedExponent > 0 && !isSpecial,
            isSubnormal: biasedExponent === 0 && mantissaInt !== 0,
            isZero: biasedExponent === 0 && mantissaInt === 0,
            isInfinite: isInfinite,
            isNaN: isNaN_
        };
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
        const maxMantissa = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 1 : 0;
        if (!Number.isInteger(mantissa) || mantissa < 0 || mantissa > maxMantissa) {
            throw new RangeError(`mantissa must be an integer in [0, ${maxMantissa}], got ${mantissa}`);
        }
    }

    // Decode floating-point representation to decimal
    decode(sign, exponent, mantissa) {
        this._validateFields(sign, exponent, mantissa);

        // Special handling for 0 exponent bits (fixed-point format)
        if (this.exponentBits === 0) {
            const value = this.mantissaBits > 0 ?
                mantissa / Math.pow(2, this.mantissaBits) :
                0;
            return sign ? -value : value;
        }

        // Special cases - only if format supports them
        if (exponent === this.maxExponent) {
            // Check for NaN
            if (this.hasNaN) {
                if (this.hasInfinity) {
                    // IEEE-style: any non-zero mantissa at maxExponent is NaN
                    if (mantissa !== 0) return NaN;
                } else {
                    // OCP-style: only all-ones mantissa at maxExponent is NaN
                    const maxMantissa = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 1 : 0;
                    if (mantissa === maxMantissa) return NaN;
                }
            }
            
            // Check for Infinity
            if (this.hasInfinity && mantissa === 0) {
                return sign ? -Infinity : Infinity;
            }
            
            // If format doesn't support special values at maxExponent,
            // fall through to decode as normal number
        }

        if (exponent === 0) {
            if (mantissa === 0) {
                return sign ? -0 : 0;
            }
            // Subnormal number
            const mantissaValue = this.mantissaBits > 0 ? mantissa / Math.pow(2, this.mantissaBits) : 0;
            const value = mantissaValue * Math.pow(2, 1 - this.bias);
            return sign ? -value : value;
        }

        // Normal number (including maxExponent if no special values)
        if (exponent > 0) {
            const mantissaValue = this.mantissaBits > 0 ?
                1.0 + mantissa / Math.pow(2, this.mantissaBits) :
                1.0;
            const actualExponent = exponent - this.bias;
            const value = mantissaValue * Math.pow(2, actualExponent);
            return sign ? -value : value;
        }
        
        /* istanbul ignore next */
        // Should not reach here (covered by zero and subnormal cases above)
        return sign ? -0 : 0;
    }

    getZero(negative = false) {
        return {
            sign: negative ? 1 : 0,
            exponent: 0,
            mantissa: 0,
            isZero: true,
            isNormal: false,
            isSubnormal: false,
            isInfinite: false,
            isNaN: false
        };
    }

    getMaxNormal(negative = false) {
        let exp = this.maxExponent;
        let mant = this.mantissaBits > 0 ? (Math.pow(2, this.mantissaBits) - 1) : 0;

        if (this.hasInfinity) {
            // maxExponent with mantissa=0 is Infinity, so max normal is one exponent below
            exp = this.maxExponent - 1;
        } else if (this.hasNaN) {
            // OCP-style: only all-ones mantissa at maxExponent is NaN.
            // Max normal is (maxExponent, maxMantissa - 1).
            mant = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 2 : 0;
        }

        return {
            sign: negative ? 1 : 0,
            exponent: exp,
            mantissa: mant,
            isNormal: true,
            isSubnormal: false,
            isZero: false,
            isInfinite: false,
            isNaN: false
        };
    }

    getInfinity(negative = false) {
        if (!this.hasInfinity) {
            throw new Error('Format does not support Infinity');
        }
        return {
            sign: negative ? 1 : 0,
            exponent: this.maxExponent,
            mantissa: 0,
            isInfinite: true,
            isNormal: false,
            isSubnormal: false,
            isZero: false,
            isNaN: false
        };
    }

    getNaN() {
        if (!this.hasNaN) {
            throw new Error('Format does not support NaN');
        }
        // IEEE-style (hasInfinity): canonical quiet NaN sets the mantissa MSB.
        // OCP-style (!hasInfinity): only all-ones mantissa is NaN.
        const nanMantissa = this.mantissaBits > 0
            ? (this.hasInfinity ? Math.pow(2, this.mantissaBits - 1) : Math.pow(2, this.mantissaBits) - 1)
            : 0;
        return {
            sign: 0,
            exponent: this.maxExponent,
            mantissa: nanMantissa,
            isNaN: true,
            isNormal: false,
            isSubnormal: false,
            isZero: false,
            isInfinite: false
        };
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

        const maxMantissa = this.mantissaBits > 0 ? Math.pow(2, this.mantissaBits) - 1 : 0;

        if (exponent === this.maxExponent) {
            if (this.hasNaN) {
                // IEEE-style (hasInfinity): any non-zero mantissa is NaN.
                // OCP-style (no infinity): only the all-ones mantissa is NaN.
                const isNaNPattern = this.hasInfinity ? mantissa !== 0 : mantissa === maxMantissa;
                if (isNaNPattern) return 'NaN';
            }
            if (this.hasInfinity && mantissa === 0) return 'Infinity';
            // Otherwise it is a normal number living at maxExponent (OCP-style).
        }

        if (exponent === 0) {
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
}

// Export for Node.js (testing) and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FloatingPoint, Integer, FORMATS, ROUNDING_MODES };
}
