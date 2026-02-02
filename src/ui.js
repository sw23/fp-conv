/****************************************************************
 * Copyright 2025 Spencer Williams
 * Use of this source code is governed by an MIT license:
 * https://github.com/sw23/fp-conv/blob/main/LICENSE
 ****************************************************************/

/* global FloatingPoint, Integer, FORMATS */
// UI code - requires FloatingPoint, Integer, and FORMATS from floating-point.js

// Application State
let currentFormat = new FloatingPoint(1, 8, 23);
let outputFormat = new FloatingPoint(1, 5, 10); // FP16 by default
let currentValue = 3.140625;
let currentEncoded = null;
let currentInputFormatKey = null;  // Track if an integer preset is active
let currentOutputFormatKey = null; // Track if an integer preset is active

// Helper functions to show/hide format controls for integer vs floating-point
function updateInputFormatControlsVisibility(isInteger) {
    const signGroup = document.getElementById('input-sign-bits').closest('.input-group');
    const expGroup = document.getElementById('input-exponent-bits').closest('.input-group');
    const infGroup = document.getElementById('input-has-infinity').closest('.input-group');
    const nanGroup = document.getElementById('input-has-nan').closest('.input-group');
    const mantissaLabel = document.querySelector('label[for="input-mantissa-bits"]');
    
    if (isInteger) {
        signGroup.style.display = 'none';
        expGroup.style.display = 'none';
        infGroup.style.display = 'none';
        nanGroup.style.display = 'none';
        mantissaLabel.textContent = 'Bits:';
    } else {
        signGroup.style.display = '';
        expGroup.style.display = '';
        infGroup.style.display = '';
        nanGroup.style.display = '';
        mantissaLabel.textContent = 'Mantissa:';
    }
}

function updateOutputFormatControlsVisibility(isInteger) {
    const signGroup = document.getElementById('output-sign-bits').closest('.input-group');
    const expGroup = document.getElementById('output-exponent-bits').closest('.input-group');
    const infGroup = document.getElementById('output-has-infinity').closest('.input-group');
    const nanGroup = document.getElementById('output-has-nan').closest('.input-group');
    const mantissaLabel = document.querySelector('label[for="output-mantissa-bits"]');
    
    if (isInteger) {
        signGroup.style.display = 'none';
        expGroup.style.display = 'none';
        infGroup.style.display = 'none';
        nanGroup.style.display = 'none';
        mantissaLabel.textContent = 'Bits:';
    } else {
        signGroup.style.display = '';
        expGroup.style.display = '';
        infGroup.style.display = '';
        nanGroup.style.display = '';
        mantissaLabel.textContent = 'Mantissa:';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Set initial value in input field
    document.getElementById('input-decimal-input').value = currentValue;
    
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
    document.querySelectorAll('.preset-btn[data-value]').forEach(btn => {
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

    // Handle integer formats
    if (format.isInteger) {
        document.getElementById('input-sign-bits').checked = false;
        document.getElementById('input-exponent-bits').value = 0;
        document.getElementById('input-mantissa-bits').value = format.bits;
        document.getElementById('input-has-infinity').checked = false;
        document.getElementById('input-has-nan').checked = false;
        
        // Store the integer format key for reference
        currentInputFormatKey = formatKey;
        updateInputFormatControlsVisibility(true);
    } else {
        document.getElementById('input-sign-bits').checked = format.sign === 1;
        document.getElementById('input-exponent-bits').value = format.exponent;
        document.getElementById('input-mantissa-bits').value = format.mantissa;
        document.getElementById('input-has-infinity').checked = format.hasInfinity !== false;
        document.getElementById('input-has-nan').checked = format.hasNaN !== false;
        
        currentInputFormatKey = null;
        updateInputFormatControlsVisibility(false);
    }

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

    // Handle integer formats
    if (format.isInteger) {
        document.getElementById('output-sign-bits').checked = false;
        document.getElementById('output-exponent-bits').value = 0;
        document.getElementById('output-mantissa-bits').value = format.bits;
        document.getElementById('output-has-infinity').checked = false;
        document.getElementById('output-has-nan').checked = false;
        
        // Store the integer format key for reference
        currentOutputFormatKey = formatKey;
        updateOutputFormatControlsVisibility(true);
    } else {
        document.getElementById('output-sign-bits').checked = format.sign === 1;
        document.getElementById('output-exponent-bits').value = format.exponent;
        document.getElementById('output-mantissa-bits').value = format.mantissa;
        document.getElementById('output-has-infinity').checked = format.hasInfinity !== false;
        document.getElementById('output-has-nan').checked = format.hasNaN !== false;
        
        currentOutputFormatKey = null;
        updateOutputFormatControlsVisibility(false);
    }

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

    // Check if this matches an integer format
    if (currentInputFormatKey && FORMATS[currentInputFormatKey] && FORMATS[currentInputFormatKey].isInteger) {
        const intFormat = FORMATS[currentInputFormatKey];
        // Use the bits from UI input, but preserve signedness from the preset
        const bitsFromUI = mantissaBits;
        currentFormat = new Integer(bitsFromUI, intFormat.signed);
        
        // Check if bits changed from preset - clear active button if custom
        if (bitsFromUI !== intFormat.bits) {
            document.querySelectorAll('.input-preset').forEach(btn => btn.classList.remove('active'));
        }
    } else {
        // Reset integer format key if UI changed
        currentInputFormatKey = null;
        
        // Find matching format to get bias
        let formatOptions = {
            hasInfinity: hasInfinity,
            hasNaN: hasNaN
        };
        const matchingFormat = Object.entries(FORMATS).find(([_key, f]) =>
            !f.isInteger && f.sign === signBits && f.exponent === exponentBits && f.mantissa === mantissaBits
        );
        
        if (matchingFormat) {
            const [_key, format] = matchingFormat;
            if (format.bias !== undefined) formatOptions.bias = format.bias;
        }

        currentFormat = new FloatingPoint(signBits, exponentBits, mantissaBits, formatOptions);
    }

    // Update total bits display
    document.getElementById('input-total-bits').textContent = currentFormat.totalBits;

    // Clear active preset if custom
    const isPreset = Object.values(FORMATS).some(f =>
        f.isInteger ? false : (f.sign === signBits && f.exponent === exponentBits && f.mantissa === mantissaBits)
    );
    if (!isPreset && !currentInputFormatKey) {
        document.querySelectorAll('.input-preset').forEach(btn => btn.classList.remove('active'));
    }

    updateValuePresetButtons();
    updateValue();
}

function updateValuePresetButtons() {
    // Enable/disable value preset buttons based on format capabilities
    const infinityBtn = document.querySelector('.preset-btn[data-value="infinity"]');
    const negInfinityBtn = document.querySelector('.preset-btn[data-value="neg-infinity"]');
    const nanBtn = document.querySelector('.preset-btn[data-value="nan"]');
    const maxSubnormBtn = document.querySelector('.preset-btn[data-value="max-subnorm"]');
    const minSubnormBtn = document.querySelector('.preset-btn[data-value="min-subnorm"]');

    // Integer formats don't support infinity, NaN, or subnormals
    const isInteger = currentFormat.isInteger;

    if (infinityBtn) {
        infinityBtn.disabled = isInteger || !currentFormat.hasInfinity;
    }
    if (negInfinityBtn) {
        negInfinityBtn.disabled = isInteger || !currentFormat.hasInfinity;
    }
    if (nanBtn) {
        nanBtn.disabled = isInteger || !currentFormat.hasNaN;
    }
    if (maxSubnormBtn) {
        maxSubnormBtn.disabled = isInteger;
    }
    if (minSubnormBtn) {
        minSubnormBtn.disabled = isInteger;
    }
}

function updateOutputFormat() {
    const signBits = document.getElementById('output-sign-bits').checked ? 1 : 0;
    const exponentBitsInput = document.getElementById('output-exponent-bits').value;
    const exponentBits = exponentBitsInput === '' ? 5 : parseInt(exponentBitsInput);
    const mantissaBitsInput = document.getElementById('output-mantissa-bits').value;
    const mantissaBits = mantissaBitsInput === '' ? 10 : parseInt(mantissaBitsInput);
    const hasInfinity = document.getElementById('output-has-infinity').checked;
    const hasNaN = document.getElementById('output-has-nan').checked;

    // Check if this matches an integer format
    if (currentOutputFormatKey && FORMATS[currentOutputFormatKey] && FORMATS[currentOutputFormatKey].isInteger) {
        const intFormat = FORMATS[currentOutputFormatKey];
        // Use the bits from UI input, but preserve signedness from the preset
        const bitsFromUI = mantissaBits;
        outputFormat = new Integer(bitsFromUI, intFormat.signed);
        
        // Check if bits changed from preset - clear active button if custom
        if (bitsFromUI !== intFormat.bits) {
            document.querySelectorAll('.output-preset').forEach(btn => btn.classList.remove('active'));
        }
    } else {
        // Reset integer format key if UI changed
        currentOutputFormatKey = null;
        
        // Find matching format to get bias
        let formatOptions = {
            hasInfinity: hasInfinity,
            hasNaN: hasNaN
        };
        const matchingFormat = Object.entries(FORMATS).find(([_key, f]) =>
            !f.isInteger && f.sign === signBits && f.exponent === exponentBits && f.mantissa === mantissaBits
        );
        
        if (matchingFormat) {
            const [_key, format] = matchingFormat;
            if (format.bias !== undefined) formatOptions.bias = format.bias;
        }

        outputFormat = new FloatingPoint(signBits, exponentBits, mantissaBits, formatOptions);
    }

    // Update total bits display
    document.getElementById('output-total-bits').textContent = outputFormat.totalBits;

    // Clear active preset if custom
    const isPreset = Object.values(FORMATS).some(f =>
        f.isInteger ? false : (f.sign === signBits && f.exponent === exponentBits && f.mantissa === mantissaBits)
    );
    if (!isPreset && !currentOutputFormatKey) {
        document.querySelectorAll('.output-preset').forEach(btn => btn.classList.remove('active'));
    }

    updateOutput();
}

function updateValue() {
    currentEncoded = currentFormat.encode(currentValue);
    updateRepresentation();
    updateOutput();
    updateActiveValuePreset();
}

function updateRepresentation() {
    const { sign, exponent, mantissa } = currentEncoded;

    // Get section containers
    const signSection = document.querySelector('#input-binary-sign-labels').closest('.bit-section-container');
    const expSection = document.querySelector('#input-binary-exponent-labels').closest('.bit-section-container');

    // For integer formats, show single contiguous field
    if (currentFormat.isInteger) {
        // Hide sign and exponent sections entirely
        signSection.style.display = 'none';
        expSection.style.display = 'none';
        createBinaryCheckboxes('sign', '');
        createBinaryCheckboxes('exponent', '');
        // Show all bits in mantissa section
        const allBits = mantissa.toString(2).padStart(currentFormat.bits, '0');
        createBinaryCheckboxes('mantissa', allBits);
    } else {
        // Show sign and exponent sections
        signSection.style.display = '';
        expSection.style.display = '';
        
        // Binary representation with checkboxes
        const signBin = currentFormat.signBits ? sign.toString() : '';
        const expBin = currentFormat.exponentBits > 0 ?
            exponent.toString(2).padStart(currentFormat.exponentBits, '0') : '';
        const mantBin = currentFormat.mantissaBits > 0 ?
            mantissa.toString(2).padStart(currentFormat.mantissaBits, '0') : '';

        createBinaryCheckboxes('sign', signBin);
        createBinaryCheckboxes('exponent', expBin);
        createBinaryCheckboxes('mantissa', mantBin);
    }

    // Hex representation
    document.getElementById('input-hex-input').value =
        currentFormat.toHexString(sign, exponent, mantissa);

    // Update components
    updateComponents();
}

function calculateBitStartPosition(format, section) {
    // For integer formats, mantissa holds all bits
    if (format.isInteger) {
        return format.bits - 1;
    }
    
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

    // Handle empty binary string (for integer formats clearing sign/exponent)
    if (binaryString === '') {
        return;
    }

    if (section === 'sign' && !currentFormat.signBits) {
        return; // No sign bit
    }

    if (section === 'exponent' && currentFormat.exponentBits === 0) {
        return; // No exponent bits
    }

    if (section === 'mantissa' && currentFormat.mantissaBits === 0 && !currentFormat.isInteger) {
        return; // No mantissa bits (but allow for integers)
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
        checkbox.className = 'bit';
        checkbox.id = `input-binary-${section}-bit-${i}`;
        checkbox.checked = binaryString[i] === '1';
        checkbox.dataset.section = section;
        checkbox.dataset.index = String(i);
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
    updateActiveValuePreset();
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

    // Handle integer formats
    if (currentFormat.isInteger) {
        const mantissa = parseInt(binary, 2);
        currentEncoded = { sign: 0, exponent: 0, mantissa };
        currentValue = currentFormat.decode(0, 0, mantissa);
        
        // Update UI
        document.getElementById('input-decimal-input').value = currentValue;
        createBinaryCheckboxes('sign', '');
        createBinaryCheckboxes('exponent', '');
        createBinaryCheckboxes('mantissa', mantissa.toString(2).padStart(currentFormat.bits, '0'));
        
        updateComponents();
        updateOutput();
        return;
    }

    // Extract components for floating point
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
    // Handle integer formats
    if (format.isInteger) {
        const value = format.decode(sign, exponent, mantissa);
        if (value === 0) {
            return 'Zero';
        } else if (value > 0) {
            return 'Positive Integer';
        } else {
            return 'Negative Integer';
        }
    }

    if (format.exponentBits === 0) {
        // Fixed-point format
        if (mantissa === 0) {
            return sign ? '-Zero' : '+Zero';
        }
        return 'Fixed-point';
    }

    if (exponent === format.maxExponent) {
        if (mantissa === 0) {
            return sign ? '-Infinity' : '+Infinity';
        } else {
            return 'NaN';
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
    // For integer formats, return the raw value
    if (format.isInteger) {
        return format.decode(0, 0, mantissa);
    }
    
    if (format.mantissaBits === 0) {
        return exponent === 0 ? 0 : 1.0;
    }
    return exponent === 0 ?
        mantissa / (1 << format.mantissaBits) :
        1.0 + mantissa / (1 << format.mantissaBits);
}

function formatExponentActual(format, exponent) {
    // Integer formats don't have exponents
    if (format.isInteger) {
        return 'N/A';
    }
    
    if (format.exponentBits === 0) {
        return 'N/A';
    }
    if (exponent === 0) {
        return `1 - ${format.bias} = ${1 - format.bias}`;
    } else if (exponent === format.maxExponent) {
        return 'Special';
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
    // Special handling for all-ones - set bits directly
    if (valueKey === 'all-ones') {
        if (currentFormat.isInteger) {
            currentEncoded = {
                sign: 0,
                exponent: 0,
                mantissa: (1 << currentFormat.bits) - 1,
                isInteger: true
            };
        } else {
            currentEncoded = {
                sign: currentFormat.signBits ? 1 : 0,
                exponent: currentFormat.maxExponent,
                mantissa: (1 << currentFormat.mantissaBits) - 1
            };
        }
        currentValue = currentFormat.decode(
            currentEncoded.sign,
            currentEncoded.exponent,
            currentEncoded.mantissa
        );
        document.getElementById('input-decimal-input').value = currentValue;
        updateRepresentation();
        updateOutput();
        updateActiveValuePreset();
        return;
    }

    // Handle integer formats differently
    if (currentFormat.isInteger) {
        switch (valueKey) {
            case 'zero':
                currentValue = 0;
                break;
            case 'one':
                currentValue = 1;
                break;
            case 'max-norm':
                currentValue = currentFormat.maxValue;
                break;
            case 'min-norm':
                currentValue = currentFormat.minValue;
                break;
            default:
                // Ignore unsupported presets for integers
                return;
        }
    } else {
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
        }
    }

    document.getElementById('input-decimal-input').value = currentValue;
    updateValue();
}

function getPresetValue(valueKey, format) {
    // Handle integer formats
    if (format.isInteger) {
        switch (valueKey) {
            case 'zero':
                return 0;
            case 'one':
                return 1;
            case 'max-norm':
                return format.maxValue;
            case 'min-norm':
                return format.minValue;
            default:
                return null;
        }
    }
    
    switch (valueKey) {
        case 'zero':
            return 0;
        case 'one':
            return 1;
        case 'max-norm':
            return format.decode(
                0,
                format.maxExponent - 1,
                (1 << format.mantissaBits) - 1
            );
        case 'min-norm':
            return format.decode(0, 1, 0);
        case 'max-subnorm':
            return format.decode(
                0,
                0,
                (1 << format.mantissaBits) - 1
            );
        case 'min-subnorm':
            return format.decode(0, 0, 1);
        case 'infinity':
            return Infinity;
        case 'neg-infinity':
            return -Infinity;
        case 'nan':
            return NaN;
        default:
            return null;
    }
}

function valuesMatch(a, b, format) {
    // Handle NaN comparison
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    // Compare the encoded representations to handle floating-point precision
    const encodedA = format.encode(a);
    const encodedB = format.encode(b);
    return encodedA.sign === encodedB.sign &&
           encodedA.exponent === encodedB.exponent &&
           encodedA.mantissa === encodedB.mantissa;
}

function isAllOnesMatch(encoded, format) {
    // Check if encoded value has all bits set to 1
    if (format.isInteger) {
        const expectedMantissa = (1 << format.bits) - 1;
        return encoded.mantissa === expectedMantissa;
    }
    
    const expectedSign = format.signBits ? 1 : 0;
    const expectedExponent = format.maxExponent;
    const expectedMantissa = (1 << format.mantissaBits) - 1;
    
    return encoded.sign === expectedSign &&
           encoded.exponent === expectedExponent &&
           encoded.mantissa === expectedMantissa;
}

function updateActiveValuePreset() {
    document.querySelectorAll('.preset-btn[data-value]:not(.output-value-preset)').forEach(btn => {
        const valueKey = btn.dataset.value;
        
        // Special handling for all-ones - compare encoded bits directly
        if (valueKey === 'all-ones') {
            if (isAllOnesMatch(currentEncoded, currentFormat)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
            return;
        }
        
        const presetValue = getPresetValue(valueKey, currentFormat);
        if (presetValue !== null && valuesMatch(currentValue, presetValue, currentFormat)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function updateActiveOutputValuePreset(outputEncoded, outputValue) {
    document.querySelectorAll('.output-value-preset').forEach(btn => {
        const valueKey = btn.dataset.value;
        
        // Special handling for all-ones
        if (valueKey === 'all-ones') {
            if (isAllOnesMatch(outputEncoded, outputFormat)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
            return;
        }
        
        const presetValue = getPresetValue(valueKey, outputFormat);
        if (presetValue !== null && valuesMatch(outputValue, presetValue, outputFormat)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function updateOutput() {
    // First decode the actual value from the input format
    const inputValue = currentFormat.decode(
        currentEncoded.sign,
        currentEncoded.exponent,
        currentEncoded.mantissa
    );
    
    // Encode the input format's actual value into the output format
    const outputEncoded = outputFormat.encode(inputValue);
    const outputValue = outputFormat.decode(
        outputEncoded.sign,
        outputEncoded.exponent,
        outputEncoded.mantissa
    );

    // Update decimal display
    document.getElementById('output-decimal').textContent = outputValue;

    // Get output section containers
    const outputSignSection = document.querySelector('#output-binary-sign-labels').closest('.bit-section-container');
    const outputExpSection = document.querySelector('#output-binary-exponent-labels').closest('.bit-section-container');

    // Update binary display (read-only)
    if (outputFormat.isInteger) {
        // For integers, hide sign and exponent sections, show single contiguous field
        outputSignSection.style.display = 'none';
        outputExpSection.style.display = 'none';
        createOutputBinaryDisplay('sign', '');
        createOutputBinaryDisplay('exponent', '');
        createOutputBinaryDisplay('mantissa', outputEncoded.mantissa.toString(2).padStart(outputFormat.bits, '0'));
    } else {
        // Show sign and exponent sections for floating-point
        outputSignSection.style.display = '';
        outputExpSection.style.display = '';
        
        const signBin = outputFormat.signBits ? outputEncoded.sign.toString() : '';
        const expBin = outputFormat.exponentBits > 0 ?
            outputEncoded.exponent.toString(2).padStart(outputFormat.exponentBits, '0') : '';
        const mantBin = outputFormat.mantissaBits > 0 ?
            outputEncoded.mantissa.toString(2).padStart(outputFormat.mantissaBits, '0') : '';

        createOutputBinaryDisplay('sign', signBin);
        createOutputBinaryDisplay('exponent', expBin);
        createOutputBinaryDisplay('mantissa', mantBin);
    }

    // Update hex display
    document.getElementById('output-hex').textContent =
        outputFormat.toHexString(outputEncoded.sign, outputEncoded.exponent, outputEncoded.mantissa);

    // Update components using shared function
    updateComponentsDisplay(outputFormat, outputEncoded, 'output');

    // Calculate precision loss - compare actual decoded values from both formats
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

    // Update output value preset highlighting
    updateActiveOutputValuePreset(outputEncoded, outputValue);
}

function createOutputBinaryDisplay(section, binaryString) {
    const labelsContainer = document.getElementById(`output-binary-${section}-labels`);
    const valuesContainer = document.getElementById(`output-binary-${section}-values`);
    const positionsContainer = document.getElementById(`output-binary-${section}-positions`);

    // Clear existing
    labelsContainer.innerHTML = '';
    valuesContainer.innerHTML = '';
    positionsContainer.innerHTML = '';

    // Handle empty binary string (for integer formats clearing sign/exponent)
    if (binaryString === '') {
        return;
    }

    if (section === 'sign' && !outputFormat.signBits) {
        return; // No sign bit
    }

    if (section === 'exponent' && outputFormat.exponentBits === 0) {
        return; // No exponent bits
    }

    if (section === 'mantissa' && outputFormat.mantissaBits === 0 && !outputFormat.isInteger) {
        return; // No mantissa bits (but allow for integers)
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
        value.className = binaryString[i] === '1' ? 'bit checked' : 'bit';
        value.textContent = binaryString[i];
        valuesContainer.appendChild(value);

        // Create position label
        const position = document.createElement('div');
        position.className = 'bit-position';
        position.textContent = startPosition - i;
        positionsContainer.appendChild(position);
    }
}

// Initialize with FP16 input and BF16 output presets
loadInputPreset('fp16');
loadOutputPreset('bf16');
