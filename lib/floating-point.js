/****************************************************************
 * Copyright 2025 Spencer Williams
 * Use of this source code is governed by an MIT license:
 * https://github.com/sw23/fp-conv/blob/main/LICENSE
 ****************************************************************/

// Floating Point Format Presets
const FORMATS = {
    fp32: { sign: 1, exponent: 8, mantissa: 23, name: 'FP32 (IEEE 754 Single)' },
    fp16: { sign: 1, exponent: 5, mantissa: 10, name: 'FP16 (Half Precision)' },
    bf16: { sign: 1, exponent: 8, mantissa: 7, name: 'BF16 (Brain Float 16)' },
    tf32: { sign: 1, exponent: 8, mantissa: 10, name: 'TF32 (TensorFloat-32)' },
    fp64: { sign: 1, exponent: 11, mantissa: 52, name: 'FP64 (IEEE 754 Double)' },
    fp8_e4m3: { sign: 1, exponent: 4, mantissa: 3, name: 'FP8 E4M3' },
    fp8_e5m2: { sign: 1, exponent: 5, mantissa: 2, name: 'FP8 E5M2' },
    fp8_e8m0: { sign: 0, exponent: 8, mantissa: 0, name: 'FP8 E8M0' },
    // OCP (Open Compute Project) Formats
    fp4_e2m1: { sign: 1, exponent: 2, mantissa: 1, bias: 1, hasInfinity: false, hasNaN: false, name: 'FP4 E2M1 (OCP)' },
    fp6_e2m3: { sign: 1, exponent: 2, mantissa: 3, bias: 1, hasInfinity: false, hasNaN: false, name: 'FP6 E2M3 (OCP)' },
    fp6_e3m2: { sign: 1, exponent: 3, mantissa: 2, bias: 3, hasInfinity: false, hasNaN: false, name: 'FP6 E3M2 (OCP)' },
    fp8_e4m3_ocp: { sign: 1, exponent: 4, mantissa: 3, bias: 7, hasInfinity: false, hasNaN: true, name: 'FP8 E4M3 (OCP)' },
    fp8_e5m2_ocp: { sign: 1, exponent: 5, mantissa: 2, bias: 15, hasInfinity: true, hasNaN: true, name: 'FP8 E5M2 (OCP)' }
};

// FloatingPoint class for custom format handling
class FloatingPoint {
    constructor(signBits, exponentBits, mantissaBits, options = {}) {
        this.signBits = signBits;
        this.exponentBits = exponentBits;
        this.mantissaBits = mantissaBits;
        this.totalBits = signBits + exponentBits + mantissaBits;
        
        // Support custom bias (for OCP formats) or use standard formula
        this.bias = options.bias !== undefined 
            ? options.bias 
            : (exponentBits > 0 ? (1 << (exponentBits - 1)) - 1 : 0);
        
        this.maxExponent = exponentBits > 0 ? (1 << exponentBits) - 1 : 0;
        
        // Special value support flags (default true for backward compatibility)
        this.hasInfinity = options.hasInfinity !== false;
        this.hasNaN = options.hasNaN !== false;
    }

    // Encode a decimal number to this floating-point format
    encode(value) {
        // Special handling for 0 exponent bits (fixed-point format)
        if (this.exponentBits === 0) {
            const sign = value < 0 ? 1 : 0;
            const absValue = Math.abs(value);

            // For fixed-point: value = mantissa / 2^mantissaBits
            const mantissaInt = this.mantissaBits > 0 ?
                Math.round(absValue * (1 << this.mantissaBits)) :
                0;

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
            return this.getZero(Object.is(value, -0));
        }

        // Extract sign
        const sign = value < 0 ? 1 : 0;
        value = Math.abs(value);

        // Get exponent and mantissa
        const log2 = Math.log2(value);
        let exponent = Math.floor(log2);
        let mantissa = value / Math.pow(2, exponent) - 1.0;

        // Bias the exponent
        let biasedExponent = exponent + this.bias;

        // Handle subnormal numbers
        if (biasedExponent <= 0) {
            // Subnormal
            mantissa = value / Math.pow(2, 1 - this.bias);
            biasedExponent = 0;
        } else if (biasedExponent > this.maxExponent || 
                   (biasedExponent === this.maxExponent && (this.hasInfinity || this.hasNaN))) {
            // Overflow: return infinity or saturate to max normal
            // For formats with special values (infinity/NaN), maxExponent is reserved
            // For formats without special values, maxExponent can be used for normal values
            if (this.hasInfinity) {
                return this.getInfinity(sign === 1);
            } else {
                // Saturate to maximum normal value
                return this.getMaxNormal(sign === 1);
            }
        }

        // Convert mantissa to integer representation
        let mantissaInt = this.mantissaBits > 0 ?
            Math.round(mantissa * (1 << this.mantissaBits)) :
            0;

        // Handle mantissa overflow after rounding
        if (mantissaInt >= (1 << this.mantissaBits)) {
            mantissaInt = 0;
            biasedExponent++;
            
            // Check for overflow after incrementing exponent
            if (biasedExponent > this.maxExponent) {
                /* istanbul ignore next */
                if (this.hasInfinity) {
                    return this.getInfinity(sign === 1);
                } else {
                    return this.getMaxNormal(sign === 1);
                }
            }
        }

        // Determine classification based on format capabilities
        const atMaxExponent = biasedExponent === this.maxExponent;
        const isSpecialExponent = atMaxExponent && (this.hasInfinity || this.hasNaN);
        
        return {
            sign,
            exponent: biasedExponent,
            mantissa: mantissaInt,
            isNormal: biasedExponent > 0 && !isSpecialExponent,
            isSubnormal: biasedExponent === 0 && mantissaInt !== 0,
            isZero: biasedExponent === 0 && mantissaInt === 0,
            isInfinite: this.hasInfinity && atMaxExponent && mantissaInt === 0,
            isNaN: this.hasNaN && atMaxExponent && mantissaInt !== 0
        };
    }

    // Decode floating-point representation to decimal
    decode(sign, exponent, mantissa) {
        // Special handling for 0 exponent bits (fixed-point format)
        if (this.exponentBits === 0) {
            const value = this.mantissaBits > 0 ?
                mantissa / (1 << this.mantissaBits) :
                0;
            return sign ? -value : value;
        }

        // Special cases - only if format supports them
        if (exponent === this.maxExponent) {
            // Check for NaN
            if (this.hasNaN && mantissa !== 0) {
                return NaN;
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
            const mantissaValue = this.mantissaBits > 0 ? mantissa / (1 << this.mantissaBits) : 0;
            const value = mantissaValue * Math.pow(2, 1 - this.bias);
            return sign ? -value : value;
        }

        // Normal number (including maxExponent if no special values)
        if (exponent > 0) {
            const mantissaValue = this.mantissaBits > 0 ?
                1.0 + mantissa / (1 << this.mantissaBits) :
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
        return {
            sign: negative ? 1 : 0,
            exponent: this.maxExponent,
            mantissa: (1 << this.mantissaBits) - 1,
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
        return {
            sign: 0,
            exponent: this.maxExponent,
            mantissa: 1,
            isNaN: true,
            isNormal: false,
            isSubnormal: false,
            isZero: false,
            isInfinite: false
        };
    }

    // Convert to binary string
    toBinaryString(sign, exponent, mantissa) {
        const signStr = this.signBits ? sign.toString() : '';
        const expStr = exponent.toString(2).padStart(this.exponentBits, '0');
        const mantStr = mantissa.toString(2).padStart(this.mantissaBits, '0');
        return signStr + expStr + mantStr;
    }

    // Convert to hex string
    toHexString(sign, exponent, mantissa) {
        const binary = this.toBinaryString(sign, exponent, mantissa);
        const paddedBinary = binary.padStart(Math.ceil(binary.length / 4) * 4, '0');
        let hex = '';
        for (let i = 0; i < paddedBinary.length; i += 4) {
            hex += parseInt(paddedBinary.substring(i, i + 4), 2).toString(16).toUpperCase();
        }
        return '0x' + hex;
    }
}

// Export for Node.js (testing) and browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FloatingPoint, FORMATS };
}
