#!/usr/bin/env python3
"""
IEEE 754 Oracle Validator
Uses Python's struct module (backed by actual hardware IEEE 754 implementation)
to generate known-correct test vectors for JavaScript floating-point library.
"""

import struct
import json
import math
import sys

def fp32_to_components(value):
    """Convert float to FP32 sign, exponent, mantissa using actual IEEE 754."""
    # Pack as IEEE 754 single precision
    packed = struct.pack('>f', value)
    bits = struct.unpack('>I', packed)[0]
    
    sign = (bits >> 31) & 0x1
    exponent = (bits >> 23) & 0xFF
    mantissa = bits & 0x7FFFFF
    
    # Classify the value
    is_zero = (exponent == 0 and mantissa == 0)
    is_subnormal = (exponent == 0 and mantissa != 0)
    is_normal = (exponent != 0 and exponent != 0xFF)
    is_infinite = (exponent == 0xFF and mantissa == 0)
    is_nan = (exponent == 0xFF and mantissa != 0)
    
    return {
        'sign': sign,
        'exponent': exponent,
        'mantissa': mantissa,
        'binary': format(bits, '032b'),
        'hex': f'0x{bits:08X}',
        'isZero': is_zero,
        'isSubnormal': is_subnormal,
        'isNormal': is_normal,
        'isInfinite': is_infinite,
        'isNaN': is_nan
    }

def fp32_from_components(sign, exponent, mantissa):
    """Convert FP32 components to float using actual IEEE 754."""
    bits = (sign << 31) | (exponent << 23) | mantissa
    packed = struct.pack('>I', bits)
    value = struct.unpack('>f', packed)[0]
    return value

def fp16_to_components(value):
    """Convert float to FP16 sign, exponent, mantissa."""
    # Python doesn't have native FP16 in struct, but we can convert via FP32
    # First clamp to FP16 range
    if math.isnan(value):
        return {'sign': 0, 'exponent': 31, 'mantissa': 1, 'isNaN': True, 
                'isZero': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
    if math.isinf(value):
        sign = 1 if value < 0 else 0
        return {'sign': sign, 'exponent': 31, 'mantissa': 0, 'isInfinite': True,
                'isNaN': False, 'isZero': False, 'isSubnormal': False, 'isNormal': False}
    
    # Get FP32 representation first
    fp32 = fp32_to_components(value)
    
    # Convert to FP16 manually (this is the reference implementation)
    sign = fp32['sign']
    exp32 = fp32['exponent']
    mant32 = fp32['mantissa']
    
    # Adjust exponent bias (127 -> 15)
    if exp32 == 0 and mant32 == 0:  # Zero
        return {'sign': sign, 'exponent': 0, 'mantissa': 0, 'isZero': True,
                'isNaN': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
    
    if exp32 == 0:  # FP32 subnormal
        # This will likely become zero in FP16
        return {'sign': sign, 'exponent': 0, 'mantissa': 0, 'isZero': True,
                'isNaN': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
    
    # Normal number - adjust exponent
    exp_unbiased = exp32 - 127
    exp16 = exp_unbiased + 15
    
    if exp16 <= 0:  # Underflow to subnormal or zero
        # Shift mantissa right
        shift = 1 - exp16
        if shift >= 10:  # Underflow to zero
            return {'sign': sign, 'exponent': 0, 'mantissa': 0, 'isZero': True,
                    'isNaN': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
        # Subnormal
        full_mantissa = (1 << 23) | mant32  # Add implicit 1
        mant16 = full_mantissa >> (23 - 10 + shift)
        return {'sign': sign, 'exponent': 0, 'mantissa': mant16 & 0x3FF, 'isSubnormal': True,
                'isNaN': False, 'isZero': False, 'isNormal': False, 'isInfinite': False}
    
    if exp16 >= 31:  # Overflow to infinity
        return {'sign': sign, 'exponent': 31, 'mantissa': 0, 'isInfinite': True,
                'isNaN': False, 'isZero': False, 'isSubnormal': False, 'isNormal': False}
    
    # Normal FP16 - truncate mantissa from 23 bits to 10 bits
    mant16 = mant32 >> 13  # Drop bottom 13 bits
    
    return {'sign': sign, 'exponent': exp16, 'mantissa': mant16 & 0x3FF, 'isNormal': True,
            'isNaN': False, 'isZero': False, 'isSubnormal': False, 'isInfinite': False}

def generate_test_vectors():
    """Generate comprehensive test vectors."""
    vectors = {
        'fp32_encode': [],
        'fp32_decode': [],
        'fp16_encode': [],
        'conversions': []
    }
    
    # FP32 Encode Test Vectors
    test_values = [
        0.0, -0.0, 1.0, -1.0, 2.0, 0.5, 0.25, -0.5,
        float('inf'), float('-inf'), float('nan'),
        # Powers of 2
        2**10, 2**-10, 2**20, 2**-20,
        # Smallest normal
        2**-126,
        # Largest normal (approximately)
        3.4028234663852886e+38,
        # Smallest subnormal
        2**-149,
        # Some subnormals
        2**-140, 2**-145,
        # Common values
        3.14159265359, 2.71828182846,
        # Boundary cases
        100.0, 1000.0, 0.1, 0.01
    ]
    
    for val in test_values:
        components = fp32_to_components(val)
        # Convert special values to strings for JSON compatibility
        if math.isnan(val):
            input_str = 'NaN'
        elif math.isinf(val):
            input_str = 'Infinity' if val > 0 else '-Infinity'
        else:
            input_str = val
        
        vectors['fp32_encode'].append({
            'input': input_str,
            'expected': components
        })
    
    # FP32 Decode Test Vectors
    decode_cases = [
        # (sign, exponent, mantissa, description)
        (0, 0, 0, 'positive zero'),
        (1, 0, 0, 'negative zero'),
        (0, 127, 0, '1.0'),
        (1, 127, 0, '-1.0'),
        (0, 128, 0, '2.0'),
        (0, 126, 0, '0.5'),
        (0, 255, 0, 'positive infinity'),
        (1, 255, 0, 'negative infinity'),
        (0, 255, 1, 'NaN'),
        (0, 1, 0, 'smallest normal'),
        (0, 0, 1, 'smallest subnormal'),
        (0, 254, 0x7FFFFF, 'largest normal'),
        (0, 0, 0x7FFFFF, 'largest subnormal'),
        # 1.5 = 1.1b × 2^0 = sign:0 exp:127 mantissa:0x400000
        (0, 127, 0x400000, '1.5'),
        # 3.14159... ≈ 0x40490FDB
        (0, 128, 0x490FDB, 'pi'),
    ]
    
    for sign, exp, mant, desc in decode_cases:
        value = fp32_from_components(sign, exp, mant)
        vectors['fp32_decode'].append({
            'sign': sign,
            'exponent': exp,
            'mantissa': mant,
            'expected': value if math.isfinite(value) else (
                'Infinity' if value > 0 else '-Infinity' if value < 0 else 'NaN'
            ),
            'description': desc
        })
    
    # FP16 specific vectors
    fp16_values = [
        0.0, 1.0, -1.0, 2.0, 0.5,
        # FP16 max ≈ 65504
        65504.0,
        # Values that overflow FP16
        100000.0,
        # Values that become subnormal in FP16
        2**-20, 2**-16,
    ]
    
    for val in fp16_values:
        components = fp16_to_components(val)
        # Convert special values to strings for JSON compatibility
        if math.isnan(val):
            input_str = 'NaN'
        elif math.isinf(val):
            input_str = 'Infinity' if val > 0 else '-Infinity'
        else:
            input_str = val
            
        vectors['fp16_encode'].append({
            'input': input_str,
            'expected': components
        })
    
    return vectors

def main():
    vectors = generate_test_vectors()
    print(json.dumps(vectors, indent=2))

if __name__ == '__main__':
    main()
