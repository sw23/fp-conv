// Quick test script to verify OCP formats work in the browser
// This can be pasted into the browser console when index.html is open

console.log('Testing OCP Format Implementation...\n');

// Test FP4 E2M1
const fp4Format = FORMATS.fp4_e2m1;
const fp4 = new FloatingPoint(fp4Format.sign, fp4Format.exponent, fp4Format.mantissa, {
    bias: fp4Format.bias,
    hasInfinity: fp4Format.hasInfinity,
    hasNaN: fp4Format.hasNaN
});

console.log('FP4 E2M1 Tests:');
console.log('- Bias:', fp4.bias, '(expected: 1)');
console.log('- Has Infinity:', fp4.hasInfinity, '(expected: false)');
console.log('- Has NaN:', fp4.hasNaN, '(expected: false)');

const fp4Overflow = fp4.encode(100);
console.log('- Overflow (100) saturates to:', fp4.decode(fp4Overflow.sign, fp4Overflow.exponent, fp4Overflow.mantissa), '(expected: 6.0)');

// Test FP8 E4M3 OCP
const fp8Format = FORMATS.fp8_e4m3_ocp;
const fp8 = new FloatingPoint(fp8Format.sign, fp8Format.exponent, fp8Format.mantissa, {
    bias: fp8Format.bias,
    hasInfinity: fp8Format.hasInfinity,
    hasNaN: fp8Format.hasNaN
});

console.log('\nFP8 E4M3 OCP Tests:');
console.log('- Bias:', fp8.bias, '(expected: 7)');
console.log('- Has Infinity:', fp8.hasInfinity, '(expected: false)');
console.log('- Has NaN:', fp8.hasNaN, '(expected: true)');

const fp8MaxExp = fp8.decode(0, 15, 0);
console.log('- Max exponent (E=15, M=0):', fp8MaxExp, '(expected: 256, NOT Infinity)');

const fp8NaN = fp8.encode(NaN);
console.log('- NaN encoding works:', fp8NaN.isNaN, '(expected: true)');

const fp8Inf = fp8.encode(Infinity);
console.log('- Infinity saturates:', !fp8Inf.isInfinite && fp8Inf.isNormal, '(expected: true)');

// Test FP8 E5M2 OCP (standard behavior)
const fp8e5m2Format = FORMATS.fp8_e5m2_ocp;
const fp8e5m2 = new FloatingPoint(fp8e5m2Format.sign, fp8e5m2Format.exponent, fp8e5m2Format.mantissa, {
    bias: fp8e5m2Format.bias,
    hasInfinity: fp8e5m2Format.hasInfinity,
    hasNaN: fp8e5m2Format.hasNaN
});

console.log('\nFP8 E5M2 OCP Tests:');
console.log('- Bias:', fp8e5m2.bias, '(expected: 15)');
console.log('- Has Infinity:', fp8e5m2.hasInfinity, '(expected: true)');
console.log('- Has NaN:', fp8e5m2.hasNaN, '(expected: true)');

const fp8e5m2Inf = fp8e5m2.encode(Infinity);
console.log('- Infinity encoding works:', fp8e5m2Inf.isInfinite, '(expected: true)');

console.log('\n✅ All OCP format tests completed! Check the values above match expected results.');
console.log('\nNow try clicking the OCP format preset buttons in the UI to test interactively!');
