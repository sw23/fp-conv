// Import the FloatingPoint class from the pure math module
const { FloatingPoint, FORMATS } = require('../lib/floating-point.js');

describe('FloatingPoint decode()', () => {
  describe('Special Values', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('decodes positive zero', () => {
      const result = fp32.decode(0, 0, 0);
      expect(result).toBe(0);
      expect(Object.is(result, 0)).toBe(true);
    });

    test('decodes negative zero', () => {
      const result = fp32.decode(1, 0, 0);
      expect(Object.is(result, -0)).toBe(true);
    });

    test('decodes positive infinity', () => {
      const result = fp32.decode(0, 255, 0);
      expect(result).toBe(Infinity);
    });

    test('decodes negative infinity', () => {
      const result = fp32.decode(1, 255, 0);
      expect(result).toBe(-Infinity);
    });

    test('decodes NaN', () => {
      const result = fp32.decode(0, 255, 1);
      expect(isNaN(result)).toBe(true);
    });
  });

  describe('Normal Numbers', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('decodes 1.0', () => {
      const result = fp32.decode(0, 127, 0);
      expect(result).toBe(1.0);
    });

    test('decodes -1.0', () => {
      const result = fp32.decode(1, 127, 0);
      expect(result).toBe(-1.0);
    });

    test('decodes 2.0', () => {
      const result = fp32.decode(0, 128, 0);
      expect(result).toBe(2.0);
    });

    test('decodes 0.5', () => {
      const result = fp32.decode(0, 126, 0);
      expect(result).toBe(0.5);
    });
  });

  describe('Subnormal Numbers', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('decodes smallest subnormal', () => {
      const result = fp32.decode(0, 0, 1);
      expect(result).toBeCloseTo(Math.pow(2, -149), 155);
    });

    test('decodes largest subnormal', () => {
      const result = fp32.decode(0, 0, (1 << 23) - 1);
      const expected = Math.pow(2, -126) * (1 - Math.pow(2, -23));
      expect(result).toBeCloseTo(expected, 10);
    });
  });
});
