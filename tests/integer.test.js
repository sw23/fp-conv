// Import the Integer class and FORMATS from the pure math module
const { Integer, FloatingPoint, FORMATS } = require('../lib/floating-point.js');

describe('Integer Class', () => {
    describe('Constructor', () => {
        test('INT8 has correct properties', () => {
            const int8 = new Integer(8, true);
            expect(int8.bits).toBe(8);
            expect(int8.totalBits).toBe(8);
            expect(int8.signed).toBe(true);
            expect(int8.isInteger).toBe(true);
            expect(int8.minValue).toBe(-128);
            expect(int8.maxValue).toBe(127);
        });

        test('UINT8 has correct properties', () => {
            const uint8 = new Integer(8, false);
            expect(uint8.bits).toBe(8);
            expect(uint8.signed).toBe(false);
            expect(uint8.minValue).toBe(0);
            expect(uint8.maxValue).toBe(255);
        });

        test('INT16 has correct properties', () => {
            const int16 = new Integer(16, true);
            expect(int16.bits).toBe(16);
            expect(int16.minValue).toBe(-32768);
            expect(int16.maxValue).toBe(32767);
        });

        test('UINT16 has correct properties', () => {
            const uint16 = new Integer(16, false);
            expect(uint16.minValue).toBe(0);
            expect(uint16.maxValue).toBe(65535);
        });

        test('INT32 has correct properties', () => {
            const int32 = new Integer(32, true);
            expect(int32.bits).toBe(32);
            expect(int32.minValue).toBe(-2147483648);
            expect(int32.maxValue).toBe(2147483647);
        });

        test('UINT32 has correct properties', () => {
            const uint32 = new Integer(32, false);
            expect(uint32.minValue).toBe(0);
            expect(uint32.maxValue).toBe(4294967295);
        });

        test('INT4 has correct properties', () => {
            const int4 = new Integer(4, true);
            expect(int4.bits).toBe(4);
            expect(int4.minValue).toBe(-8);
            expect(int4.maxValue).toBe(7);
        });

        test('UINT4 has correct properties', () => {
            const uint4 = new Integer(4, false);
            expect(uint4.minValue).toBe(0);
            expect(uint4.maxValue).toBe(15);
        });
    });

    describe('FORMATS entries', () => {
        test('Integer formats are defined in FORMATS', () => {
            expect(FORMATS.int32).toBeDefined();
            expect(FORMATS.uint32).toBeDefined();
            expect(FORMATS.int16).toBeDefined();
            expect(FORMATS.uint16).toBeDefined();
            expect(FORMATS.int8).toBeDefined();
            expect(FORMATS.uint8).toBeDefined();
            expect(FORMATS.int4).toBeDefined();
            expect(FORMATS.uint4).toBeDefined();
        });

        test('Integer formats have isInteger flag', () => {
            expect(FORMATS.int32.isInteger).toBe(true);
            expect(FORMATS.uint8.isInteger).toBe(true);
            expect(FORMATS.int4.isInteger).toBe(true);
        });

        test('Integer formats have correct bit sizes', () => {
            expect(FORMATS.int32.bits).toBe(32);
            expect(FORMATS.int16.bits).toBe(16);
            expect(FORMATS.int8.bits).toBe(8);
            expect(FORMATS.int4.bits).toBe(4);
        });
    });

    describe('Encode - basic values', () => {
        test('encodes zero correctly', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(0);
            expect(encoded.mantissa).toBe(0);
            expect(encoded.isZero).toBe(true);
            expect(encoded.isInteger).toBe(true);
        });

        test('encodes positive values correctly', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(42);
            expect(encoded.mantissa).toBe(42);
            expect(encoded.intValue).toBe(42);
        });

        test('encodes negative values with twos complement', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(-1);
            expect(encoded.mantissa).toBe(255); // 0xFF
            expect(encoded.intValue).toBe(-1);
        });

        test('encodes -128 correctly for INT8', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(-128);
            expect(encoded.mantissa).toBe(128); // 0x80
            expect(encoded.intValue).toBe(-128);
        });

        test('encodes max positive value correctly', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(127);
            expect(encoded.mantissa).toBe(127);
            expect(encoded.intValue).toBe(127);
        });
    });

    describe('Encode - rounding', () => {
        test('rounds 1.4 to 1', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(1.4);
            expect(encoded.intValue).toBe(1);
        });

        test('rounds 1.5 to 2', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(1.5);
            expect(encoded.intValue).toBe(2);
        });

        test('rounds 1.6 to 2', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(1.6);
            expect(encoded.intValue).toBe(2);
        });

        test('rounds -1.5 to -1 (Math.round behavior)', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(-1.5);
            expect(encoded.intValue).toBe(-1);
        });

        test('rounds -1.6 to -2', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(-1.6);
            expect(encoded.intValue).toBe(-2);
        });
    });

    describe('Encode - saturation', () => {
        test('saturates overflow to max for signed', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(200);
            expect(encoded.intValue).toBe(127);
        });

        test('saturates underflow to min for signed', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(-200);
            expect(encoded.intValue).toBe(-128);
        });

        test('saturates overflow to max for unsigned', () => {
            const uint8 = new Integer(8, false);
            const encoded = uint8.encode(300);
            expect(encoded.intValue).toBe(255);
        });

        test('saturates underflow to 0 for unsigned', () => {
            const uint8 = new Integer(8, false);
            const encoded = uint8.encode(-10);
            expect(encoded.intValue).toBe(0);
        });

        test('handles Infinity by saturating to max', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(Infinity);
            expect(encoded.intValue).toBe(127);
        });

        test('handles -Infinity by saturating to min', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(-Infinity);
            expect(encoded.intValue).toBe(-128);
        });

        test('handles NaN by returning 0', () => {
            const int8 = new Integer(8, true);
            const encoded = int8.encode(NaN);
            expect(encoded.intValue).toBe(0);
        });
    });

    describe('Decode', () => {
        test('decodes zero correctly', () => {
            const int8 = new Integer(8, true);
            expect(int8.decode(0, 0, 0)).toBe(0);
        });

        test('decodes positive values correctly', () => {
            const int8 = new Integer(8, true);
            expect(int8.decode(0, 0, 42)).toBe(42);
        });

        test('decodes negative values from twos complement', () => {
            const int8 = new Integer(8, true);
            expect(int8.decode(0, 0, 255)).toBe(-1);
            expect(int8.decode(0, 0, 128)).toBe(-128);
            expect(int8.decode(0, 0, 254)).toBe(-2);
        });

        test('decodes unsigned values correctly', () => {
            const uint8 = new Integer(8, false);
            expect(uint8.decode(0, 0, 255)).toBe(255);
            expect(uint8.decode(0, 0, 128)).toBe(128);
        });
    });

    describe('Round-trip encode/decode', () => {
        test('INT8 round-trip for all values', () => {
            const int8 = new Integer(8, true);
            for (let i = -128; i <= 127; i++) {
                const encoded = int8.encode(i);
                const decoded = int8.decode(0, 0, encoded.mantissa);
                expect(decoded).toBe(i);
            }
        });

        test('UINT8 round-trip for all values', () => {
            const uint8 = new Integer(8, false);
            for (let i = 0; i <= 255; i++) {
                const encoded = uint8.encode(i);
                const decoded = uint8.decode(0, 0, encoded.mantissa);
                expect(decoded).toBe(i);
            }
        });

        test('INT4 round-trip for all values', () => {
            const int4 = new Integer(4, true);
            for (let i = -8; i <= 7; i++) {
                const encoded = int4.encode(i);
                const decoded = int4.decode(0, 0, encoded.mantissa);
                expect(decoded).toBe(i);
            }
        });

        test('UINT4 round-trip for all values', () => {
            const uint4 = new Integer(4, false);
            for (let i = 0; i <= 15; i++) {
                const encoded = uint4.encode(i);
                const decoded = uint4.decode(0, 0, encoded.mantissa);
                expect(decoded).toBe(i);
            }
        });

        test('INT16 round-trip for edge values', () => {
            const int16 = new Integer(16, true);
            const testValues = [-32768, -1, 0, 1, 32767, -100, 100, -12345, 12345];
            for (const val of testValues) {
                const encoded = int16.encode(val);
                const decoded = int16.decode(0, 0, encoded.mantissa);
                expect(decoded).toBe(val);
            }
        });
    });

    describe('Binary/Hex conversion', () => {
        test('toBinaryString formats correctly', () => {
            const int8 = new Integer(8, true);
            expect(int8.toBinaryString(0, 0, 0)).toBe('00000000');
            expect(int8.toBinaryString(0, 0, 255)).toBe('11111111');
            expect(int8.toBinaryString(0, 0, 42)).toBe('00101010');
        });

        test('toHexString formats correctly', () => {
            const int8 = new Integer(8, true);
            expect(int8.toHexString(0, 0, 0)).toBe('0x00');
            expect(int8.toHexString(0, 0, 255)).toBe('0xFF');
            expect(int8.toHexString(0, 0, 170)).toBe('0xAA');
        });

        test('INT16 hex string is 4 digits', () => {
            const int16 = new Integer(16, true);
            expect(int16.toHexString(0, 0, 0)).toBe('0x0000');
            expect(int16.toHexString(0, 0, 65535)).toBe('0xFFFF');
        });
    });

    describe('Helper methods', () => {
        test('getZero returns correct value', () => {
            const int8 = new Integer(8, true);
            const zero = int8.getZero();
            expect(zero.mantissa).toBe(0);
            expect(zero.isZero).toBe(true);
        });

        test('getMaxValue returns correct value', () => {
            const int8 = new Integer(8, true);
            const max = int8.getMaxValue();
            expect(max.intValue).toBe(127);
        });

        test('getMinValue returns correct value', () => {
            const int8 = new Integer(8, true);
            const min = int8.getMinValue();
            expect(min.intValue).toBe(-128);
        });
    });
});

describe('Integer to Integer Conversions', () => {
    describe('Same-size signed to unsigned', () => {
        test('INT8 0 to UINT8 = 0', () => {
            const int8 = new Integer(8, true);
            const uint8 = new Integer(8, false);
            
            const encoded = int8.encode(0);
            const value = int8.decode(0, 0, encoded.mantissa);
            const reEncoded = uint8.encode(value);
            expect(uint8.decode(0, 0, reEncoded.mantissa)).toBe(0);
        });

        test('INT8 positive to UINT8 preserved', () => {
            const int8 = new Integer(8, true);
            const uint8 = new Integer(8, false);
            
            const encoded = int8.encode(100);
            const value = int8.decode(0, 0, encoded.mantissa);
            const reEncoded = uint8.encode(value);
            expect(uint8.decode(0, 0, reEncoded.mantissa)).toBe(100);
        });

        test('INT8 negative to UINT8 saturates to 0', () => {
            const int8 = new Integer(8, true);
            const uint8 = new Integer(8, false);
            
            const encoded = int8.encode(-50);
            const value = int8.decode(0, 0, encoded.mantissa);
            const reEncoded = uint8.encode(value);
            expect(uint8.decode(0, 0, reEncoded.mantissa)).toBe(0);
        });
    });

    describe('Widening conversions', () => {
        test('INT8 to INT16 preserves value', () => {
            const int8 = new Integer(8, true);
            const int16 = new Integer(16, true);
            
            for (const val of [-128, -1, 0, 1, 127]) {
                const encoded8 = int8.encode(val);
                const value = int8.decode(0, 0, encoded8.mantissa);
                const encoded16 = int16.encode(value);
                expect(int16.decode(0, 0, encoded16.mantissa)).toBe(val);
            }
        });

        test('UINT8 to UINT16 preserves value', () => {
            const uint8 = new Integer(8, false);
            const uint16 = new Integer(16, false);
            
            for (const val of [0, 1, 128, 255]) {
                const encoded8 = uint8.encode(val);
                const value = uint8.decode(0, 0, encoded8.mantissa);
                const encoded16 = uint16.encode(value);
                expect(uint16.decode(0, 0, encoded16.mantissa)).toBe(val);
            }
        });

        test('INT8 to INT32 preserves value', () => {
            const int8 = new Integer(8, true);
            const int32 = new Integer(32, true);
            
            const encoded8 = int8.encode(-100);
            const value = int8.decode(0, 0, encoded8.mantissa);
            const encoded32 = int32.encode(value);
            expect(int32.decode(0, 0, encoded32.mantissa)).toBe(-100);
        });
    });

    describe('Narrowing conversions', () => {
        test('INT16 to INT8 saturates overflow', () => {
            const int16 = new Integer(16, true);
            const int8 = new Integer(8, true);
            
            const encoded16 = int16.encode(1000);
            const value = int16.decode(0, 0, encoded16.mantissa);
            const encoded8 = int8.encode(value);
            expect(int8.decode(0, 0, encoded8.mantissa)).toBe(127);
        });

        test('INT16 to INT8 saturates underflow', () => {
            const int16 = new Integer(16, true);
            const int8 = new Integer(8, true);
            
            const encoded16 = int16.encode(-1000);
            const value = int16.decode(0, 0, encoded16.mantissa);
            const encoded8 = int8.encode(value);
            expect(int8.decode(0, 0, encoded8.mantissa)).toBe(-128);
        });

        test('INT16 in range to INT8 preserves value', () => {
            const int16 = new Integer(16, true);
            const int8 = new Integer(8, true);
            
            const encoded16 = int16.encode(50);
            const value = int16.decode(0, 0, encoded16.mantissa);
            const encoded8 = int8.encode(value);
            expect(int8.decode(0, 0, encoded8.mantissa)).toBe(50);
        });

        test('UINT16 to UINT8 saturates overflow', () => {
            const uint16 = new Integer(16, false);
            const uint8 = new Integer(8, false);
            
            const encoded16 = uint16.encode(1000);
            const value = uint16.decode(0, 0, encoded16.mantissa);
            const encoded8 = uint8.encode(value);
            expect(uint8.decode(0, 0, encoded8.mantissa)).toBe(255);
        });
    });

    describe('INT4/UINT4 conversions', () => {
        test('INT8 to INT4 with saturation', () => {
            const int8 = new Integer(8, true);
            const int4 = new Integer(4, true);
            
            // In range
            expect(int4.decode(0, 0, int4.encode(int8.decode(0, 0, int8.encode(5).mantissa)).mantissa)).toBe(5);
            expect(int4.decode(0, 0, int4.encode(int8.decode(0, 0, int8.encode(-5).mantissa)).mantissa)).toBe(-5);
            
            // Saturated
            expect(int4.decode(0, 0, int4.encode(int8.decode(0, 0, int8.encode(100).mantissa)).mantissa)).toBe(7);
            expect(int4.decode(0, 0, int4.encode(int8.decode(0, 0, int8.encode(-100).mantissa)).mantissa)).toBe(-8);
        });

        test('UINT8 to UINT4 with saturation', () => {
            const uint8 = new Integer(8, false);
            const uint4 = new Integer(4, false);
            
            // In range
            expect(uint4.decode(0, 0, uint4.encode(uint8.decode(0, 0, uint8.encode(10).mantissa)).mantissa)).toBe(10);
            
            // Saturated
            expect(uint4.decode(0, 0, uint4.encode(uint8.decode(0, 0, uint8.encode(100).mantissa)).mantissa)).toBe(15);
        });

        test('INT4 to UINT4 conversion', () => {
            const int4 = new Integer(4, true);
            const uint4 = new Integer(4, false);
            
            // Positive values preserved
            expect(uint4.decode(0, 0, uint4.encode(int4.decode(0, 0, int4.encode(5).mantissa)).mantissa)).toBe(5);
            
            // Negative saturates to 0
            expect(uint4.decode(0, 0, uint4.encode(int4.decode(0, 0, int4.encode(-5).mantissa)).mantissa)).toBe(0);
        });
    });
});

describe('Integer to Float Conversions', () => {
    describe('INT8 to FP32', () => {
        test('converts 0 exactly', () => {
            const int8 = new Integer(8, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            const intEncoded = int8.encode(0);
            const intValue = int8.decode(0, 0, intEncoded.mantissa);
            const fpEncoded = fp32.encode(intValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            expect(fpValue).toBe(0);
        });

        test('converts positive integers exactly', () => {
            const int8 = new Integer(8, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            for (const val of [1, 42, 127]) {
                const intEncoded = int8.encode(val);
                const intValue = int8.decode(0, 0, intEncoded.mantissa);
                const fpEncoded = fp32.encode(intValue);
                const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
                expect(fpValue).toBe(val);
            }
        });

        test('converts negative integers exactly', () => {
            const int8 = new Integer(8, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            for (const val of [-1, -42, -128]) {
                const intEncoded = int8.encode(val);
                const intValue = int8.decode(0, 0, intEncoded.mantissa);
                const fpEncoded = fp32.encode(intValue);
                const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
                expect(fpValue).toBe(val);
            }
        });
    });

    describe('INT32 to FP32', () => {
        test('small integers convert exactly', () => {
            const int32 = new Integer(32, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            // Test values that are exactly representable in FP32 (up to 2^24)
            for (const val of [0, 1, -1, 1000, -1000, 16777216]) {
                const intEncoded = int32.encode(val);
                const intValue = int32.decode(0, 0, intEncoded.mantissa);
                const fpEncoded = fp32.encode(intValue);
                const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
                expect(fpValue).toBe(val);
            }
        });

        test('large integers may lose precision', () => {
            const int32 = new Integer(32, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            // FP32 has 24 bits of precision (1 implicit + 23 mantissa)
            // 2^24 = 16777216 is exactly representable
            // 2^24 + 1 = 16777217 is NOT exactly representable
            const largeVal = 16777217;
            const intEncoded = int32.encode(largeVal);
            const intValue = int32.decode(0, 0, intEncoded.mantissa);
            const fpEncoded = fp32.encode(intValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            // Should be close but not exact due to rounding
            expect(Math.abs(fpValue - largeVal)).toBeLessThanOrEqual(1);
        });
    });

    describe('Integer to FP16', () => {
        test('INT8 values fit in FP16 range', () => {
            const int8 = new Integer(8, true);
            const fp16 = new FloatingPoint(1, 5, 10);
            
            for (const val of [-128, -1, 0, 1, 127]) {
                const intValue = int8.decode(0, 0, int8.encode(val).mantissa);
                const fpEncoded = fp16.encode(intValue);
                const fpValue = fp16.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
                expect(fpValue).toBe(val);
            }
        });

        test('Large INT16 values convert with possible precision loss', () => {
            const int16 = new Integer(16, true);
            const fp16 = new FloatingPoint(1, 5, 10);
            
            // FP16 max is ~65504, and has limited precision
            const intValue = int16.decode(0, 0, int16.encode(32767).mantissa);
            const fpEncoded = fp16.encode(intValue);
            const fpValue = fp16.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            // FP16 can represent 32768 exactly, but 32767 may round
            expect(Math.abs(fpValue - 32767)).toBeLessThanOrEqual(1);
        });
    });

    describe('Integer to FP8', () => {
        test('INT4 range fits in FP8 E4M3', () => {
            const int4 = new Integer(4, true);
            const fp8 = new FloatingPoint(1, 4, 3);
            
            for (const val of [-8, -1, 0, 1, 7]) {
                const intValue = int4.decode(0, 0, int4.encode(val).mantissa);
                const fpEncoded = fp8.encode(intValue);
                const fpValue = fp8.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
                expect(fpValue).toBe(val);
            }
        });
    });
});

describe('Float to Integer Conversions', () => {
    describe('FP32 to INT8', () => {
        test('converts 0.0 to 0', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            const fpValue = fp32.decode(0, 0, 0);
            const intEncoded = int8.encode(fpValue);
            expect(int8.decode(0, 0, intEncoded.mantissa)).toBe(0);
        });

        test('converts integers exactly', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            for (const val of [1, 42, 127, -1, -42, -128]) {
                const fpEncoded = fp32.encode(val);
                const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
                const intEncoded = int8.encode(fpValue);
                expect(int8.decode(0, 0, intEncoded.mantissa)).toBe(val);
            }
        });

        test('rounds fractional values', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            // 1.4 rounds to 1
            let fpValue = fp32.decode(...Object.values(fp32.encode(1.4)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(1);
            
            // 1.5 rounds to 2
            fpValue = fp32.decode(...Object.values(fp32.encode(1.5)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(2);
            
            // 1.6 rounds to 2
            fpValue = fp32.decode(...Object.values(fp32.encode(1.6)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(2);
        });

        test('saturates out-of-range values', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            // 200 saturates to 127
            let fpValue = fp32.decode(...Object.values(fp32.encode(200)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(127);
            
            // -200 saturates to -128
            fpValue = fp32.decode(...Object.values(fp32.encode(-200)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(-128);
        });

        test('converts Infinity to max/min', () => {
            const int8 = new Integer(8, true);
            
            expect(int8.decode(0, 0, int8.encode(Infinity).mantissa)).toBe(127);
            expect(int8.decode(0, 0, int8.encode(-Infinity).mantissa)).toBe(-128);
        });

        test('converts NaN to 0', () => {
            const int8 = new Integer(8, true);
            expect(int8.decode(0, 0, int8.encode(NaN).mantissa)).toBe(0);
        });
    });

    describe('FP32 to UINT8', () => {
        test('converts positive values correctly', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const uint8 = new Integer(8, false);
            
            for (const val of [0, 1, 100, 255]) {
                const fpValue = fp32.decode(...Object.values(fp32.encode(val)));
                expect(uint8.decode(0, 0, uint8.encode(fpValue).mantissa)).toBe(val);
            }
        });

        test('saturates negative to 0', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const uint8 = new Integer(8, false);
            
            const fpValue = fp32.decode(...Object.values(fp32.encode(-50)));
            expect(uint8.decode(0, 0, uint8.encode(fpValue).mantissa)).toBe(0);
        });

        test('saturates overflow to 255', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const uint8 = new Integer(8, false);
            
            const fpValue = fp32.decode(...Object.values(fp32.encode(1000)));
            expect(uint8.decode(0, 0, uint8.encode(fpValue).mantissa)).toBe(255);
        });
    });

    describe('FP16 to Integer', () => {
        test('FP16 to INT8 with rounding and saturation', () => {
            const fp16 = new FloatingPoint(1, 5, 10);
            const int8 = new Integer(8, true);
            
            // Exact value
            let fpValue = fp16.decode(...Object.values(fp16.encode(50)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(50);
            
            // Large value saturates
            fpValue = fp16.decode(...Object.values(fp16.encode(1000)));
            expect(int8.decode(0, 0, int8.encode(fpValue).mantissa)).toBe(127);
        });
    });
});

describe('Percent Error Calculations', () => {
    describe('Float to Integer precision loss', () => {
        test('no error for exact integer values', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            const inputValue = 42;
            const fpEncoded = fp32.encode(inputValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            const intEncoded = int8.encode(fpValue);
            const intValue = int8.decode(0, 0, intEncoded.mantissa);
            
            const loss = Math.abs(fpValue - intValue);
            const percentError = (loss / Math.abs(fpValue)) * 100;
            
            expect(percentError).toBe(0);
        });

        test('error for fractional truncation', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            const inputValue = 42.7;
            const fpEncoded = fp32.encode(inputValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            const intEncoded = int8.encode(fpValue);
            const intValue = int8.decode(0, 0, intEncoded.mantissa);
            
            const loss = Math.abs(fpValue - intValue);
            const percentError = (loss / Math.abs(fpValue)) * 100;
            
            // 42.7 rounds to 43, error = 0.3/42.7 ≈ 0.7%
            expect(percentError).toBeCloseTo(0.7, 0);
        });

        test('error for saturation', () => {
            const fp32 = new FloatingPoint(1, 8, 23);
            const int8 = new Integer(8, true);
            
            const inputValue = 200;
            const fpEncoded = fp32.encode(inputValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            const intEncoded = int8.encode(fpValue);
            const intValue = int8.decode(0, 0, intEncoded.mantissa);
            
            const loss = Math.abs(fpValue - intValue);
            const percentError = (loss / Math.abs(fpValue)) * 100;
            
            // 200 saturates to 127, error = 73/200 = 36.5%
            expect(percentError).toBeCloseTo(36.5, 0);
        });
    });

    describe('Integer to Float precision loss', () => {
        test('no error for small integers in FP32', () => {
            const int8 = new Integer(8, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            const inputValue = 100;
            const intEncoded = int8.encode(inputValue);
            const intValue = int8.decode(0, 0, intEncoded.mantissa);
            
            const fpEncoded = fp32.encode(intValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            const loss = Math.abs(intValue - fpValue);
            expect(loss).toBe(0);
        });

        test('precision loss for large INT32 in FP32', () => {
            const int32 = new Integer(32, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            // This value is too large for FP32's 24-bit precision
            const inputValue = 123456789;
            const intEncoded = int32.encode(inputValue);
            const intValue = int32.decode(0, 0, intEncoded.mantissa);
            
            const fpEncoded = fp32.encode(intValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            const loss = Math.abs(intValue - fpValue);
            const percentError = (loss / Math.abs(intValue)) * 100;
            
            // There should be some precision loss
            expect(loss).toBeGreaterThan(0);
            expect(percentError).toBeLessThan(0.001); // But it should be small
        });
    });

    describe('Integer to Integer precision loss', () => {
        test('no error for widening conversion', () => {
            const int8 = new Integer(8, true);
            const int16 = new Integer(16, true);
            
            const inputValue = 100;
            const int8Encoded = int8.encode(inputValue);
            const int8Value = int8.decode(0, 0, int8Encoded.mantissa);
            
            const int16Encoded = int16.encode(int8Value);
            const int16Value = int16.decode(0, 0, int16Encoded.mantissa);
            
            expect(int16Value).toBe(int8Value);
        });

        test('error for narrowing conversion with saturation', () => {
            const int16 = new Integer(16, true);
            const int8 = new Integer(8, true);
            
            const inputValue = 1000;
            const int16Encoded = int16.encode(inputValue);
            const int16Value = int16.decode(0, 0, int16Encoded.mantissa);
            
            const int8Encoded = int8.encode(int16Value);
            const int8Value = int8.decode(0, 0, int8Encoded.mantissa);
            
            const loss = Math.abs(int16Value - int8Value);
            const percentError = (loss / Math.abs(int16Value)) * 100;
            
            // 1000 saturates to 127, error = 873/1000 = 87.3%
            expect(percentError).toBeCloseTo(87.3, 0);
        });
    });

    describe('Zero handling in percent error', () => {
        test('zero to zero has no percent error', () => {
            const int8 = new Integer(8, true);
            const fp32 = new FloatingPoint(1, 8, 23);
            
            const intEncoded = int8.encode(0);
            const intValue = int8.decode(0, 0, intEncoded.mantissa);
            
            const fpEncoded = fp32.encode(intValue);
            const fpValue = fp32.decode(fpEncoded.sign, fpEncoded.exponent, fpEncoded.mantissa);
            
            const loss = Math.abs(intValue - fpValue);
            // Avoid division by zero - if input is 0, relative loss is 0
            const percentError = intValue !== 0 ? (loss / Math.abs(intValue)) * 100 : 0;
            
            expect(percentError).toBe(0);
        });
    });
});
