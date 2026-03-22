// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Constructor', () => {
  test('initializes FP32 format correctly', () => {
    const fp32 = new FloatingPoint(1, 8, 23);
    expect(fp32.signBits).toBe(1);
    expect(fp32.exponentBits).toBe(8);
    expect(fp32.mantissaBits).toBe(23);
    expect(fp32.totalBits).toBe(32);
    expect(fp32.bias).toBe(127);
    expect(fp32.maxExponent).toBe(255);
  });

  test('initializes FP16 format correctly', () => {
    const fp16 = new FloatingPoint(1, 5, 10);
    expect(fp16.totalBits).toBe(16);
    expect(fp16.bias).toBe(15);
    expect(fp16.maxExponent).toBe(31);
  });

  test('handles fixed-point format (0 exponent bits)', () => {
    const fixed = new FloatingPoint(1, 0, 8);
    expect(fixed.bias).toBe(0);
    expect(fixed.maxExponent).toBe(0);
  });

  test('accepts boundary values for all parameters', () => {
    expect(() => new FloatingPoint(0, 0, 0)).not.toThrow();
    expect(() => new FloatingPoint(1, 15, 112)).not.toThrow();
  });

  test('rejects invalid signBits', () => {
    expect(() => new FloatingPoint(2, 8, 23)).toThrow(RangeError);
    expect(() => new FloatingPoint(-1, 8, 23)).toThrow(RangeError);
    expect(() => new FloatingPoint(0.5, 8, 23)).toThrow(RangeError);
  });

  test('rejects invalid exponentBits', () => {
    expect(() => new FloatingPoint(1, -1, 23)).toThrow(RangeError);
    expect(() => new FloatingPoint(1, 16, 23)).toThrow(RangeError);
    expect(() => new FloatingPoint(1, 1.5, 23)).toThrow(RangeError);
  });

  test('rejects invalid mantissaBits', () => {
    expect(() => new FloatingPoint(1, 8, -1)).toThrow(RangeError);
    expect(() => new FloatingPoint(1, 8, 113)).toThrow(RangeError);
    expect(() => new FloatingPoint(1, 8, 2.5)).toThrow(RangeError);
  });
});
