// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Import the FloatingPoint class from the pure math module
const { FloatingPoint, Integer } = require('../lib/floating-point.js');

describe('FloatingPoint Utility Methods', () => {
  describe('toBinaryString()', () => {
    test('FP32 binary string for 1.0', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const binary = fp32.toBinaryString(0, 127, 0);
      expect(binary).toBe('0' + '01111111' + '00000000000000000000000');
      expect(binary.length).toBe(32);
    });

    test('FP16 binary string for -1.0', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const binary = fp16.toBinaryString(1, 15, 0);
      expect(binary).toBe('1' + '01111' + '0000000000');
      expect(binary.length).toBe(16);
    });

    test('handles format without sign bit', () => {
      const fp = new FloatingPoint(0, 8, 8);
      const binary = fp.toBinaryString(0, 127, 128);
      expect(binary).toBe('01111111' + '10000000');
      expect(binary.length).toBe(16);
    });
  });

  describe('toHexString()', () => {
    test('FP32 hex string for 1.0', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const hex = fp32.toHexString(0, 127, 0);
      expect(hex).toBe('0x3F800000');
    });

    test('FP16 hex string for 1.0', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const hex = fp16.toHexString(0, 15, 0);
      expect(hex).toBe('0x3C00');
    });

    test('FP8 hex string', () => {
      const fp8 = new FloatingPoint(1, 4, 3);
      const hex = fp8.toHexString(0, 7, 0);
      expect(hex).toBe('0x38');
    });
  });

  describe('getZero()', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('creates positive zero', () => {
      const result = fp32.getZero(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(0);
      expect(result.mantissa).toBe(0);
      expect(result.isZero).toBe(true);
    });

    test('creates negative zero', () => {
      const result = fp32.getZero(true);
      expect(result.sign).toBe(1);
      expect(result.isZero).toBe(true);
    });
  });

  describe('getInfinity()', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('creates positive infinity', () => {
      const result = fp32.getInfinity(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBe(0);
      expect(result.isInfinite).toBe(true);
    });

    test('creates negative infinity', () => {
      const result = fp32.getInfinity(true);
      expect(result.sign).toBe(1);
      expect(result.isInfinite).toBe(true);
    });
  });

  describe('getNaN()', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('creates NaN', () => {
      const result = fp32.getNaN();
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBeGreaterThan(0);
      expect(result.isNaN).toBe(true);
    });

    test('throws error when format does not support NaN', () => {
      // No infinity either: with one, the top binade's other patterns are
      // NaN whatever the flag says.
      const fp = new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: false });
      expect(() => fp.getNaN()).toThrow('Format does not support NaN');
    });
  });

  describe('getMaxNormal()', () => {
    test('FP32 returns correct max normal', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const result = fp32.getMaxNormal(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(254); // maxExponent - 1 (maxExponent reserved for inf/NaN)
      expect(result.mantissa).toBe((1 << 23) - 1);
      expect(result.isNormal).toBe(true);
      expect(result.isInfinite).toBe(false);
    });

    test('FP32 returns correct negative max normal', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const result = fp32.getMaxNormal(true);
      expect(result.sign).toBe(1);
      expect(result.isNormal).toBe(true);
    });

    test('FP16 returns correct max normal', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const result = fp16.getMaxNormal(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(30); // maxExponent - 1 for FP16 (maxExponent reserved for inf/NaN)
      expect(result.mantissa).toBe((1 << 10) - 1);
      expect(result.isNormal).toBe(true);
    });

    test('OCP FP4 E2M1 max normal uses maxExponent (no infinity)', () => {
      const fp4 = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
      const result = fp4.getMaxNormal(false);
      expect(result.exponent).toBe(3); // maxExponent
      expect(result.mantissa).toBe(1); // all mantissa bits set
      expect(result.isNormal).toBe(true);
      
      // Verify decoded value
      const decoded = fp4.decode(result.sign, result.exponent, result.mantissa);
      expect(decoded).toBe(6.0); // 2^(3-1) * 1.5 = 4 * 1.5 = 6
    });

    test('format without sign bit ignores a negative request', () => {
      const fp = new FloatingPoint(0, 8, 8);
      const result = fp.getMaxNormal(true); // negative requested
      // A format with no sign bit has no negative value to hand back. It used to
      // set sign=1 anyway, which is not a representable field value - the result
      // could not be decoded or rendered without throwing.
      expect(result.sign).toBe(0);
      expect(result.isNormal).toBe(true);
      expect(() => fp.decode(result.sign, result.exponent, result.mantissa)).not.toThrow();
    });
  });

  describe('getInfinity() error handling', () => {
    test('throws error when format does not support infinity', () => {
      const fp = new FloatingPoint(1, 4, 3, { hasInfinity: false });
      expect(() => fp.getInfinity()).toThrow('Format does not support Infinity');
    });
  });
});

// fromBinaryString() is the inverse of toBinaryString(), and the one place that
// knows where a layout's field boundaries fall: the web UI's hex box, the
// WebMCP decode_bits tool and the format pages all read a bit pattern through
// it, so a pattern cannot be sliced two different ways.
describe('fromBinaryString()', () => {
    test('splits an FP16 pattern into its fields', () => {
        const fp16 = new FloatingPoint(1, 5, 10);
        expect(fp16.fromBinaryString('1011110000000001'))
            .toEqual({ sign: 1, exponent: 15, mantissa: 1 });
    });

    test('round-trips every field of every preset layout', () => {
        for (const fmt of [new FloatingPoint(1, 5, 10), new FloatingPoint(1, 8, 23),
            new FloatingPoint(0, 8, 0), new FloatingPoint(1, 0, 8), new Integer(8, true)]) {
            const cases = fmt.isInteger
                ? [[0, 0, 0], [0, 0, 250], [0, 0, fmt.maxMantissa]]
                : [[0, 0, 0], [fmt.signBits, fmt.maxExponent, fmt.maxMantissa]];
            for (const [sign, exponent, mantissa] of cases) {
                const binary = fmt.toBinaryString(sign, exponent, mantissa);
                expect(fmt.fromBinaryString(binary)).toEqual({ sign, exponent, mantissa });
            }
        }
    });

    test('keeps a mantissa wider than 53 bits exact', () => {
        const wide = new FloatingPoint(1, 11, 60);
        const pattern = '0' + '1'.repeat(11) + '0'.repeat(59) + '1';
        expect(wide.fromBinaryString(pattern).mantissa).toBe(1n);
        const odd = '0' + '0'.repeat(11) + '1'.repeat(60);
        expect(wide.fromBinaryString(odd).mantissa).toBe((1n << 60n) - 1n);
    });

    test('an integer pattern is the whole two\'s-complement field', () => {
        const int64 = new Integer(64, true);
        expect(int64.fromBinaryString('1' + '0'.repeat(63)))
            .toEqual({ sign: 0, exponent: 0, mantissa: 1n << 63n });
    });

    test('refuses a pattern that is not exactly the format width', () => {
        const fp16 = new FloatingPoint(1, 5, 10);
        expect(() => fp16.fromBinaryString('0011110000000')).toThrow(RangeError);
        expect(() => fp16.fromBinaryString('00111100000000000')).toThrow(RangeError);
        expect(() => fp16.fromBinaryString('001111000000000x')).toThrow(RangeError);
        expect(() => fp16.fromBinaryString(15)).toThrow(RangeError);
        expect(() => new Integer(8, true).fromBinaryString('1111')).toThrow(RangeError);
    });
});

// fromHexString() is the inverse of toHexString(), and the one rule for what a
// hex pattern means at a width. Each surface used to decide that for itself:
// the converter and the decode tool refused a pattern wider than the format,
// while the format pages sliced it to width, so FP6's page read "FF" as 0x3F.
describe('fromHexString()', () => {
    const fp16 = new FloatingPoint(1, 5, 10);

    test('reads a pattern with or without the prefix, and with leading zeros', () => {
        const one = { sign: 0, exponent: 15, mantissa: 0 };
        expect(fp16.fromHexString('0x3C00')).toEqual(one);
        expect(fp16.fromHexString('3c00')).toEqual(one);
        expect(fp16.fromHexString('0X03C00')).toEqual(one);
        expect(fp16.fromHexString(' 0x3C00 ')).toEqual(one);
        expect(fp16.fromHexString('0x0')).toEqual({ sign: 0, exponent: 0, mantissa: 0 });
    });

    test('refuses a pattern whose bits do not fit, rather than slicing it', () => {
        const e3m2 = new FloatingPoint(1, 3, 2);
        expect(() => e3m2.fromHexString('FF')).toThrow(/8 significant bits.*6-bit format/);
        expect(() => e3m2.fromHexString('0x40')).toThrow(RangeError);
        expect(e3m2.fromHexString('0x3F')).toEqual({ sign: 1, exponent: 7, mantissa: 3 });
        expect(() => fp16.fromHexString('0x12345')).toThrow(/17 significant bits/);
        expect(() => fp16.fromHexString('0x10000')).toThrow(RangeError);
        expect(fp16.fromHexString('0xFFFF')).toEqual({ sign: 1, exponent: 31, mantissa: 1023 });
    });

    test('refuses anything that is not a hex pattern', () => {
        for (const bad of ['', '0x', 'zz', '0x3C0G', '0b1010', '3C 00', 15, null]) {
            expect(() => fp16.fromHexString(bad)).toThrow(RangeError);
        }
    });

    test('keeps wide fields exact, on floats and integers alike', () => {
        const wide = new FloatingPoint(1, 11, 60);
        expect(wide.fromHexString('0x7FF000000000000001'))
            .toEqual({ sign: 0, exponent: 2047, mantissa: 1n });
        const int64 = new Integer(64, true);
        expect(int64.fromHexString('0xFFFFFFFFFFFFFFFF').mantissa).toBe(2n ** 64n - 1n);
        expect(() => int64.fromHexString('0x1FFFFFFFFFFFFFFFF')).toThrow(/65 significant bits/);
    });

    test('is the inverse of toHexString() for every field of every layout', () => {
        for (const fmt of [fp16, new FloatingPoint(1, 8, 23), new FloatingPoint(0, 8, 0),
            new FloatingPoint(1, 3, 2), new FloatingPoint(1, 0, 8), new Integer(8, true),
            new Integer(64, false)]) {
            const cases = fmt.isInteger
                ? [[0, 0, 0], [0, 0, 250], [0, 0, fmt.maxMantissa]]
                : [[0, 0, 0], [fmt.signBits, fmt.maxExponent, fmt.maxMantissa]];
            for (const [sign, exponent, mantissa] of cases) {
                const hex = fmt.toHexString(sign, exponent, mantissa);
                // The mantissa comes back in the width's representation.
                expect(fmt.fromHexString(hex))
                    .toEqual({ sign, exponent, mantissa: fmt.normalizeMantissa(mantissa) });
            }
        }
    });
});
