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
        } else if (biasedExponent >= this.maxExponent) {
            // Overflow: return infinity or saturate to max normal
            if (this.hasInfinity) {
                return this.getInfinity(sign === 1);
            } else {
                // Saturate to maximum normal value
                return this.getMaxNormal(sign === 1);
            }
        }

        // Convert mantissa to integer representation
        const mantissaInt = this.mantissaBits > 0 ?
            Math.round(mantissa * (1 << this.mantissaBits)) :
            0;

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

// Application State
let currentFormat = new FloatingPoint(1, 8, 23);
let outputFormat = new FloatingPoint(1, 5, 10); // FP16 by default
let currentValue = 3.14159;
let currentEncoded = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    updateFormat();
    updateOutputFormat();
    updateValue();
    setupEventListeners();
});

function setupEventListeners() {
    // Input format preset buttons
    document.querySelectorAll('.input-preset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const formatKey = e.target.dataset.format;
            loadInputPreset(formatKey);
        });
    });

    // Output format preset buttons
    document.querySelectorAll('.output-preset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const formatKey = e.target.dataset.format;
            loadOutputPreset(formatKey);
        });
    });

    // Value preset buttons
    document.querySelectorAll('.value-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const valueKey = e.target.dataset.value;
            loadValuePreset(valueKey);
        });
    });

    // Input format inputs
    document.getElementById('input-sign-bits').addEventListener('change', updateFormat);
    document.getElementById('input-exponent-bits').addEventListener('input', updateFormat);
    document.getElementById('input-mantissa-bits').addEventListener('input', updateFormat);
    document.getElementById('input-has-infinity').addEventListener('change', updateFormat);
    document.getElementById('input-has-nan').addEventListener('change', updateFormat);

    // Output format inputs
    document.getElementById('output-sign-bits').addEventListener('change', updateOutputFormat);
    document.getElementById('output-exponent-bits').addEventListener('input', updateOutputFormat);
    document.getElementById('output-mantissa-bits').addEventListener('input', updateOutputFormat);
    document.getElementById('output-has-infinity').addEventListener('change', updateOutputFormat);
    document.getElementById('output-has-nan').addEventListener('change', updateOutputFormat);

    // Value input
    document.getElementById('input-decimal-input').addEventListener('input', (e) => {
        currentValue = parseFloat(e.target.value) || 0;
        updateValue();
    });

    // Hex input
    document.getElementById('input-hex-input').addEventListener('input', handleHexInput);
}

function loadInputPreset(formatKey) {
    const format = FORMATS[formatKey];
    if (!format) return;

    document.getElementById('input-sign-bits').checked = format.sign === 1;
    document.getElementById('input-exponent-bits').value = format.exponent;
    document.getElementById('input-mantissa-bits').value = format.mantissa;
    document.getElementById('input-has-infinity').checked = format.hasInfinity !== false;
    document.getElementById('input-has-nan').checked = format.hasNaN !== false;

    // Store format options for later use
    currentFormat._formatKey = formatKey;

    // Update active button
    document.querySelectorAll('.input-preset').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.input-preset[data-format="${formatKey}"]`).classList.add('active');

    updateFormat();
}

function loadOutputPreset(formatKey) {
    const format = FORMATS[formatKey];
    if (!format) return;

    document.getElementById('output-sign-bits').checked = format.sign === 1;
    document.getElementById('output-exponent-bits').value = format.exponent;
    document.getElementById('output-mantissa-bits').value = format.mantissa;
    document.getElementById('output-has-infinity').checked = format.hasInfinity !== false;
    document.getElementById('output-has-nan').checked = format.hasNaN !== false;

    // Store format options for later use
    outputFormat._formatKey = formatKey;

    // Update active button
    document.querySelectorAll('.output-preset').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.output-preset[data-format="${formatKey}"]`).classList.add('active');

    updateOutputFormat();
}

function updateFormat() {
    const signBits = document.getElementById('input-sign-bits').checked ? 1 : 0;
    const exponentBitsInput = document.getElementById('input-exponent-bits').value;
    const exponentBits = exponentBitsInput === '' ? 8 : parseInt(exponentBitsInput);
    const mantissaBitsInput = document.getElementById('input-mantissa-bits').value;
    const mantissaBits = mantissaBitsInput === '' ? 23 : parseInt(mantissaBitsInput);
    const hasInfinity = document.getElementById('input-has-infinity').checked;
    const hasNaN = document.getElementById('input-has-nan').checked;

    // Find matching format to get options
    let formatOptions = {
        hasInfinity: hasInfinity,
        hasNaN: hasNaN
    };
    const matchingFormat = Object.entries(FORMATS).find(([_key, f]) =>
        f.sign === signBits && f.exponent === exponentBits && f.mantissa === mantissaBits
    );
    
    if (matchingFormat) {
        const [_key, format] = matchingFormat;
        if (format.bias !== undefined) formatOptions.bias = format.bias;
    }

    currentFormat = new FloatingPoint(signBits, exponentBits, mantissaBits, formatOptions);

    // Update total bits display
    document.getElementById('input-total-bits').textContent = currentFormat.totalBits;

    // Clear active preset if custom
    const isPreset = matchingFormat !== undefined;
    if (!isPreset) {
        document.querySelectorAll('.input-preset').forEach(btn => btn.classList.remove('active'));
    }

    updateValue();
}

function updateOutputFormat() {
    const signBits = document.getElementById('output-sign-bits').checked ? 1 : 0;
    const exponentBitsInput = document.getElementById('output-exponent-bits').value;
    const exponentBits = exponentBitsInput === '' ? 5 : parseInt(exponentBitsInput);
    const mantissaBitsInput = document.getElementById('output-mantissa-bits').value;
    const mantissaBits = mantissaBitsInput === '' ? 10 : parseInt(mantissaBitsInput);
    const hasInfinity = document.getElementById('output-has-infinity').checked;
    const hasNaN = document.getElementById('output-has-nan').checked;

    // Find matching format to get options
    let formatOptions = {
        hasInfinity: hasInfinity,
        hasNaN: hasNaN
    };
    const matchingFormat = Object.entries(FORMATS).find(([_key, f]) =>
        f.sign === signBits && f.exponent === exponentBits && f.mantissa === mantissaBits
    );
    
    if (matchingFormat) {
        const [_key, format] = matchingFormat;
        if (format.bias !== undefined) formatOptions.bias = format.bias;
    }

    outputFormat = new FloatingPoint(signBits, exponentBits, mantissaBits, formatOptions);

    // Update total bits display
    document.getElementById('output-total-bits').textContent = outputFormat.totalBits;

    // Clear active preset if custom
    const isPreset = matchingFormat !== undefined;
    if (!isPreset) {
        document.querySelectorAll('.output-preset').forEach(btn => btn.classList.remove('active'));
    }

    updateOutput();
}

function updateValue() {
    currentEncoded = currentFormat.encode(currentValue);
    updateRepresentation();
    updateOutput();
}

function updateRepresentation() {
    const { sign, exponent, mantissa } = currentEncoded;

    // Binary representation with checkboxes
    const signBin = currentFormat.signBits ? sign.toString() : '';
    const expBin = currentFormat.exponentBits > 0 ?
        exponent.toString(2).padStart(currentFormat.exponentBits, '0') : '';
    const mantBin = currentFormat.mantissaBits > 0 ?
        mantissa.toString(2).padStart(currentFormat.mantissaBits, '0') : '';

    createBinaryCheckboxes('sign', signBin);
    createBinaryCheckboxes('exponent', expBin);
    createBinaryCheckboxes('mantissa', mantBin);

    // Hex representation
    document.getElementById('input-hex-input').value =
        currentFormat.toHexString(sign, exponent, mantissa);

    // Update components
    updateComponents();
}

function calculateBitStartPosition(format, section) {
    if (section === 'sign') {
        return format.totalBits - 1;
    } else if (section === 'exponent') {
        return format.totalBits - format.signBits - 1;
    } else { // mantissa
        return format.mantissaBits - 1;
    }
}

function createBinaryCheckboxes(section, binaryString) {
    const labelsContainer = document.getElementById(`input-binary-${section}-labels`);
    const checksContainer = document.getElementById(`input-binary-${section}-checks`);
    const positionsContainer = document.getElementById(`input-binary-${section}-positions`);

    // Clear existing
    labelsContainer.innerHTML = '';
    checksContainer.innerHTML = '';
    positionsContainer.innerHTML = '';

    if (section === 'sign' && !currentFormat.signBits) {
        return; // No sign bit
    }

    if (section === 'exponent' && currentFormat.exponentBits === 0) {
        return; // No exponent bits
    }

    if (section === 'mantissa' && currentFormat.mantissaBits === 0) {
        return; // No mantissa bits
    }

    const startPosition = calculateBitStartPosition(currentFormat, section);

    // Create labels, checkboxes, and positions for each bit
    for (let i = 0; i < binaryString.length; i++) {
        // Create label
        const label = document.createElement('div');
        label.className = 'bit-label';
        label.textContent = binaryString[i];
        labelsContainer.appendChild(label);

        // Create checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'bit-checkbox';
        checkbox.id = `input-binary-${section}-bit-${i}`;
        checkbox.checked = binaryString[i] === '1';
        checkbox.dataset.section = section;
        checkbox.dataset.index = i;
        checkbox.autocomplete = 'off';
        checkbox.addEventListener('change', handleBinaryCheckboxChange);
        checksContainer.appendChild(checkbox);

        // Create position label
        const position = document.createElement('div');
        position.className = 'bit-position';
        position.textContent = startPosition - i;
        positionsContainer.appendChild(position);
    }
}

function handleBinaryCheckboxChange(e) {
    const section = e.target.dataset.section;
    const _index = parseInt(e.target.dataset.index);

    // Get all checkboxes for this section
    const checkboxes = document.querySelectorAll(`[data-section="${section}"]`);
    let binaryString = '';
    checkboxes.forEach(cb => {
        binaryString += cb.checked ? '1' : '0';
    });

    // Update labels to match checkboxes
    const labelsContainer = document.getElementById(`input-binary-${section}-labels`);
    const labels = labelsContainer.querySelectorAll('.bit-label');
    labels.forEach((label, i) => {
        label.textContent = binaryString[i];
    });

    // Convert binary to integer
    const value = parseInt(binaryString, 2) || 0;

    // Update the current encoded value
    if (section === 'sign') {
        currentEncoded.sign = value;
    } else if (section === 'exponent') {
        currentEncoded.exponent = value;
    } else if (section === 'mantissa') {
        currentEncoded.mantissa = value;
    }

    // Decode and update current value
    currentValue = currentFormat.decode(
        currentEncoded.sign,
        currentEncoded.exponent,
        currentEncoded.mantissa
    );

    // Update UI (but don't recreate checkboxes to avoid losing focus)
    document.getElementById('input-decimal-input').value = currentValue;
    document.getElementById('input-hex-input').value =
        currentFormat.toHexString(currentEncoded.sign, currentEncoded.exponent, currentEncoded.mantissa);

    updateComponents();
    updateOutput();
}

function handleHexInput(e) {
    let hexValue = e.target.value.trim();

    // Remove 0x prefix if present
    if (hexValue.startsWith('0x') || hexValue.startsWith('0X')) {
        hexValue = hexValue.substring(2);
    }

    // Validate hex
    if (!/^[0-9A-Fa-f]*$/.test(hexValue)) {
        return; // Invalid hex
    }

    if (hexValue === '') {
        return;
    }

    // Convert hex to binary
    const binary = parseInt(hexValue, 16).toString(2).padStart(currentFormat.totalBits, '0');

    // Extract components
    let bitIndex = 0;
    const sign = currentFormat.signBits ? parseInt(binary.substring(bitIndex, bitIndex + currentFormat.signBits), 2) : 0;
    bitIndex += currentFormat.signBits;
    const exponent = parseInt(binary.substring(bitIndex, bitIndex + currentFormat.exponentBits), 2);
    bitIndex += currentFormat.exponentBits;
    const mantissa = parseInt(binary.substring(bitIndex, bitIndex + currentFormat.mantissaBits), 2);

    // Update current encoded
    currentEncoded = { sign, exponent, mantissa };

    // Decode to get value
    currentValue = currentFormat.decode(sign, exponent, mantissa);

    // Update UI
    document.getElementById('input-decimal-input').value = currentValue;
    createBinaryCheckboxes('sign', currentFormat.signBits ? sign.toString() : '');
    createBinaryCheckboxes('exponent', currentFormat.exponentBits > 0 ?
        exponent.toString(2).padStart(currentFormat.exponentBits, '0') : '');
    createBinaryCheckboxes('mantissa', currentFormat.mantissaBits > 0 ?
        mantissa.toString(2).padStart(currentFormat.mantissaBits, '0') : '');

    updateComponents();
    updateOutput();
}

function determineFloatType(format, sign, exponent, mantissa) {
    if (format.exponentBits === 0) {
        // Fixed-point format
        if (mantissa === 0) {
            return sign ? '-Zero' : '+Zero';
        }
        return 'Fixed-point';
    }

    if (exponent === format.maxExponent) {
        // Check format capabilities for special values
        if (format.hasInfinity && mantissa === 0) {
            return sign ? '-Infinity' : '+Infinity';
        } else if (format.hasNaN && mantissa !== 0) {
            return 'NaN';
        } else {
            // Format doesn't support special values at maxExponent
            return 'Normal (Max)';
        }
    } else if (exponent === 0) {
        if (mantissa === 0) {
            return sign ? '-Zero' : '+Zero';
        } else {
            return 'Subnormal';
        }
    } else {
        return 'Normal';
    }
}

function calculateMantissaDecimal(format, exponent, mantissa) {
    if (format.mantissaBits === 0) {
        return exponent === 0 ? 0 : 1.0;
    }
    
    // For subnormal numbers (exponent = 0)
    if (exponent === 0) {
        return mantissa / (1 << format.mantissaBits);
    }
    
    // For maxExponent with special values, don't show mantissa calculation
    if (exponent === format.maxExponent && (format.hasInfinity || format.hasNaN)) {
        return mantissa / (1 << format.mantissaBits);
    }
    
    // Normal numbers (including maxExponent without special values)
    return 1.0 + mantissa / (1 << format.mantissaBits);
}

function formatExponentActual(format, exponent) {
    if (format.exponentBits === 0) {
        return 'N/A';
    }
    if (exponent === 0) {
        return `1 - ${format.bias} = ${1 - format.bias}`;
    } else if (exponent === format.maxExponent) {
        // Check if this is actually special or just max normal
        if (format.hasInfinity || format.hasNaN) {
            return 'Special';
        } else {
            return `${exponent} - ${format.bias} = ${exponent - format.bias}`;
        }
    } else {
        return `${exponent} - ${format.bias} = ${exponent - format.bias}`;
    }
}

function updateComponentsDisplay(format, encoded, idPrefix) {
    const { sign, exponent, mantissa } = encoded;

    document.getElementById(`${idPrefix}-comp-sign`).textContent =
        format.signBits ? sign : 'N/A';
    document.getElementById(`${idPrefix}-comp-exp-biased`).textContent = exponent;
    document.getElementById(`${idPrefix}-comp-exp-actual`).textContent =
        formatExponentActual(format, exponent);
    document.getElementById(`${idPrefix}-comp-type`).textContent =
        determineFloatType(format, sign, exponent, mantissa);
    document.getElementById(`${idPrefix}-comp-mantissa-dec`).textContent =
        calculateMantissaDecimal(format, exponent, mantissa).toFixed(10);
    document.getElementById(`${idPrefix}-comp-value`).textContent =
        format.decode(sign, exponent, mantissa);
}

function updateComponents() {
    updateComponentsDisplay(currentFormat, currentEncoded, 'input');
}

function loadValuePreset(valueKey) {
    switch (valueKey) {
        case 'zero':
            currentValue = 0;
            break;
        case 'one':
            currentValue = 1;
            break;
        case 'max-norm':
            // Maximum normal number: all exponent bits 1 except max, all mantissa bits 1
            currentValue = currentFormat.decode(
                0,
                currentFormat.maxExponent - 1,
                (1 << currentFormat.mantissaBits) - 1
            );
            break;
        case 'min-norm':
            // Minimum normal number: exponent = 1, mantissa = 0
            currentValue = currentFormat.decode(0, 1, 0);
            break;
        case 'max-subnorm':
            // Maximum subnormal number: exponent = 0, all mantissa bits = 1
            currentValue = currentFormat.decode(
                0,
                0,
                (1 << currentFormat.mantissaBits) - 1
            );
            break;
        case 'min-subnorm':
            // Minimum subnormal number: exponent = 0, mantissa = 1
            currentValue = currentFormat.decode(0, 0, 1);
            break;
        case 'infinity':
            currentValue = Infinity;
            break;
        case 'neg-infinity':
            currentValue = -Infinity;
            break;
        case 'nan':
            currentValue = NaN;
            break;
        case 'all-ones':
            // All bits set to 1
            currentValue = currentFormat.decode(
                currentFormat.signBits ? 1 : 0,
                currentFormat.maxExponent,
                (1 << currentFormat.mantissaBits) - 1
            );
            break;
    }

    document.getElementById('input-decimal-input').value = currentValue;
    updateValue();
}

function updateOutput() {
    // Encode current value in output format
    const outputEncoded = outputFormat.encode(currentValue);
    const outputValue = outputFormat.decode(
        outputEncoded.sign,
        outputEncoded.exponent,
        outputEncoded.mantissa
    );

    // Update decimal display
    document.getElementById('output-decimal').textContent = outputValue;

    // Update binary display (read-only)
    const signBin = outputFormat.signBits ? outputEncoded.sign.toString() : '';
    const expBin = outputFormat.exponentBits > 0 ?
        outputEncoded.exponent.toString(2).padStart(outputFormat.exponentBits, '0') : '';
    const mantBin = outputFormat.mantissaBits > 0 ?
        outputEncoded.mantissa.toString(2).padStart(outputFormat.mantissaBits, '0') : '';

    createOutputBinaryDisplay('sign', signBin);
    createOutputBinaryDisplay('exponent', expBin);
    createOutputBinaryDisplay('mantissa', mantBin);

    // Update hex display
    document.getElementById('output-hex').textContent =
        outputFormat.toHexString(outputEncoded.sign, outputEncoded.exponent, outputEncoded.mantissa);

    // Update components using shared function
    updateComponentsDisplay(outputFormat, outputEncoded, 'output');

    // Calculate precision loss - compare actual decoded values from both formats
    const inputValue = currentFormat.decode(
        currentEncoded.sign,
        currentEncoded.exponent,
        currentEncoded.mantissa
    );
    const loss = Math.abs(inputValue - outputValue);
    const relativeLoss = inputValue !== 0 ? (loss / Math.abs(inputValue) * 100).toFixed(6) : '0';

    // Show/hide precision loss based on whether there's actual loss
    const precisionLossElement = document.querySelector('.precision-loss');
    if (loss === 0 || isNaN(loss)) {
        precisionLossElement.style.display = 'none';
    } else {
        precisionLossElement.style.display = 'flex';
        document.getElementById('output-precision-loss').textContent =
            `${loss.toExponential(6)} (${relativeLoss}%)`;
    }
}

function createOutputBinaryDisplay(section, binaryString) {
    const labelsContainer = document.getElementById(`output-binary-${section}-labels`);
    const valuesContainer = document.getElementById(`output-binary-${section}-values`);
    const positionsContainer = document.getElementById(`output-binary-${section}-positions`);

    // Clear existing
    labelsContainer.innerHTML = '';
    valuesContainer.innerHTML = '';
    positionsContainer.innerHTML = '';

    if (section === 'sign' && !outputFormat.signBits) {
        return; // No sign bit
    }

    if (section === 'exponent' && outputFormat.exponentBits === 0) {
        return; // No exponent bits
    }

    if (section === 'mantissa' && outputFormat.mantissaBits === 0) {
        return; // No mantissa bits
    }

    const startPosition = calculateBitStartPosition(outputFormat, section);

    // Create labels, value displays, and positions for each bit
    for (let i = 0; i < binaryString.length; i++) {
        // Create label
        const label = document.createElement('div');
        label.className = 'bit-label';
        label.textContent = binaryString[i];
        labelsContainer.appendChild(label);

        // Create value display
        const value = document.createElement('div');
        value.className = 'bit-value';
        value.textContent = binaryString[i];
        valuesContainer.appendChild(value);

        // Create position label
        const position = document.createElement('div');
        position.className = 'bit-position';
        position.textContent = startPosition - i;
        positionsContainer.appendChild(position);
    }
}

// Initialize with FP32 input and FP16 output presets
loadInputPreset('fp32');
loadOutputPreset('fp16');
