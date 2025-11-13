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
    fp8_e8m0: { sign: 0, exponent: 8, mantissa: 0, name: 'FP8 E8M0' }
};

// FloatingPoint class for custom format handling
class FloatingPoint {
    constructor(signBits, exponentBits, mantissaBits) {
        this.signBits = signBits;
        this.exponentBits = exponentBits;
        this.mantissaBits = mantissaBits;
        this.totalBits = signBits + exponentBits + mantissaBits;
        this.bias = exponentBits > 0 ? (1 << (exponentBits - 1)) - 1 : 0;
        this.maxExponent = exponentBits > 0 ? (1 << exponentBits) - 1 : 0;
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
            return this.getNaN();
        }

        if (!isFinite(value)) {
            return this.getInfinity(value < 0);
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
        } else if (biasedExponent >= this.maxExponent) {
            // Overflow to infinity
            return this.getInfinity(sign === 1);
        }

        // Convert mantissa to integer representation
        const mantissaInt = this.mantissaBits > 0 ?
            Math.round(mantissa * (1 << this.mantissaBits)) :
            0;

        return {
            sign,
            exponent: biasedExponent,
            mantissa: mantissaInt,
            isNormal: biasedExponent > 0 && biasedExponent < this.maxExponent,
            isSubnormal: biasedExponent === 0 && mantissaInt !== 0,
            isZero: biasedExponent === 0 && mantissaInt === 0,
            isInfinite: biasedExponent === this.maxExponent && mantissaInt === 0,
            isNaN: biasedExponent === this.maxExponent && mantissaInt !== 0
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

        // Special cases
        if (exponent === this.maxExponent) {
            if (mantissa === 0) {
                return sign ? -Infinity : Infinity;
            } else {
                return NaN;
            }
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

        // Normal number
        const mantissaValue = this.mantissaBits > 0 ?
            1.0 + mantissa / (1 << this.mantissaBits) :
            1.0;
        const actualExponent = exponent - this.bias;
        const value = mantissaValue * Math.pow(2, actualExponent);
        return sign ? -value : value;
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

    getInfinity(negative = false) {
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
