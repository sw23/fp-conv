// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Round-trip encode/decode', () => {
  let fp32;

  beforeEach(() => {
    fp32 = new FloatingPoint(1, 8, 23);
  });

  test('preserves exact values through round-trip', () => {
    const testValues = [0, 1, -1, 2, 0.5, 0.25, -3.5, 100, -200, 1e10, 1e-10];
    
    testValues.forEach(value => {
      const encoded = fp32.encode(value);
      const decoded = fp32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(value, 10);
    });
  });

  test('preserves special values through round-trip', () => {
    const testValues = [0, -0, Infinity, -Infinity, NaN];
    
    testValues.forEach(value => {
      const encoded = fp32.encode(value);
      const decoded = fp32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      
      if (isNaN(value)) {
        expect(isNaN(decoded)).toBe(true);
      } else if (Object.is(value, -0)) {
        expect(Object.is(decoded, -0)).toBe(true);
      } else {
        expect(decoded).toBe(value);
      }
    });
  });
});
