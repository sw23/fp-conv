// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS, buildSearchParams, parseSearchParams, decimalToString, parseDecimal */
// UI code - requires FloatingPoint, Integer, and FORMATS from floating-point.js
// and the URL helpers from url-state.js.

// Clamp a raw numeric-field string to an integer within [min, max], falling
// back when unparseable. Keeps out-of-range typing from throwing out of the
// FloatingPoint/Integer constructors (which reject e.g. exponentBits > 15).
function clampFieldInt(raw, min, max, fallback) {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

// Application State
let currentFormat = new FloatingPoint(1, 8, 23);
let outputFormat = new FloatingPoint(1, 5, 10); // FP16 by default
let currentValue = 3.140625;
// The decimal literal currentValue was parsed from, when it came from typed or
// linked text. Kept so that re-encodes triggered by a rounding-mode or format
// change can still round the original decimal exactly; null whenever the value
// came from bits, hex or a preset and so has no literal behind it.
//
// The two always move together, so nothing assigns them directly: text goes
// through setValueFromText() and everything else through setValueFromBits().
// Leaving a stale literal behind would silently re-encode it in place of what
// the bits now say.
let currentValueText = null;
let currentEncoded = null;
let currentInputFormatKey = null;  // Track if an integer preset is active
let currentOutputFormatKey = null; // Track if an integer preset is active
let currentRoundingMode = 'tiesToEven';
// null means "leave it to the format". That is a distinct third state from the
// two modes: FP32 defaults to overflow while FP8 E4M3 defaults to saturate, so
// a two-valued control could not express "whatever this format normally does"
// without silently changing one of them.
let currentOverflowMode = null;
let urlSyncEnabled = false; // Suppress URL writes until initial state is loaded

// Helper functions to show/hide format controls for integer vs floating-point
function updateInputFormatControlsVisibility(isInteger) {
    const signGroup = document.getElementById('input-sign-bits').closest('.input-group');
    const expGroup = document.getElementById('input-exponent-bits').closest('.input-group');
    const infGroup = document.getElementById('input-has-infinity').closest('.input-group');
    const nanGroup = document.getElementById('input-has-nan').closest('.input-group');
    const subGroup = document.getElementById('input-has-subnormals').closest('.input-group');
    const fracGroup = document.getElementById('input-fraction-bits').closest('.input-group');
    const mantissaLabel = document.querySelector('label[for="input-mantissa-bits"]');
    
    if (isInteger) {
        signGroup.style.display = 'none';
        expGroup.style.display = 'none';
        infGroup.style.display = 'none';
        nanGroup.style.display = 'none';
        subGroup.style.display = 'none';
        fracGroup.style.display = '';
        mantissaLabel.textContent = 'Bits:';
    } else {
        signGroup.style.display = '';
        expGroup.style.display = '';
        infGroup.style.display = '';
        nanGroup.style.display = '';
        subGroup.style.display = '';
        fracGroup.style.display = 'none';
        mantissaLabel.textContent = 'Mantissa:';
    }
}

function updateOutputFormatControlsVisibility(isInteger) {
    const signGroup = document.getElementById('output-sign-bits').closest('.input-group');
    const expGroup = document.getElementById('output-exponent-bits').closest('.input-group');
    const infGroup = document.getElementById('output-has-infinity').closest('.input-group');
    const nanGroup = document.getElementById('output-has-nan').closest('.input-group');
    const subGroup = document.getElementById('output-has-subnormals').closest('.input-group');
    const fracGroup = document.getElementById('output-fraction-bits').closest('.input-group');
    const mantissaLabel = document.querySelector('label[for="output-mantissa-bits"]');
    
    if (isInteger) {
        signGroup.style.display = 'none';
        expGroup.style.display = 'none';
        infGroup.style.display = 'none';
        nanGroup.style.display = 'none';
        subGroup.style.display = 'none';
        fracGroup.style.display = '';
        mantissaLabel.textContent = 'Bits:';
    } else {
        signGroup.style.display = '';
        expGroup.style.display = '';
        infGroup.style.display = '';
        nanGroup.style.display = '';
        subGroup.style.display = '';
        fracGroup.style.display = 'none';
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

    // Restore any state encoded in the URL, then start keeping the URL in sync.
    const restored = applyStateFromUrl();
    enableUrlSync();
    if (restored) {
        syncUrl();
    }
});

// Start reflecting state in the address bar. Writes are suppressed until this
// runs so that restoring a link cannot overwrite the link being restored.
function enableUrlSync() {
    urlSyncEnabled = true;
}

// Reflect the current conversion in the URL so it can be bookmarked or shared.
function syncUrl() {
    if (!urlSyncEnabled) return;
    if (typeof history === 'undefined' || !history.replaceState) return;
    try {
        const query = buildSearchParams({
            inputFormat: currentFormat,
            outputFormat: outputFormat,
            currentValue: currentValue,
            currentEncoded: currentEncoded,
            roundingMode: currentRoundingMode,
            overflowMode: currentOverflowMode,
        });
        const newUrl = query
            ? `${window.location.pathname}?${query}`
            : window.location.pathname;
        history.replaceState(null, '', newUrl);
    } catch {
        // Ignore URL update failures (e.g. sandboxed environments).
    }
}

// Copy the current page URL to the clipboard and give brief visual feedback.
function copyShareLink(button) {
    const url = window.location.href;
    const showCopied = () => {
        const original = button.dataset.label || button.textContent;
        button.dataset.label = original;
        button.textContent = 'Copied!';
        button.classList.add('copied');
        clearTimeout(button._copyTimer);
        button._copyTimer = setTimeout(() => {
            button.textContent = button.dataset.label;
            button.classList.remove('copied');
        }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showCopied).catch(() => fallbackCopy(url, showCopied));
    } else {
        fallbackCopy(url, showCopied);
    }
}

// Clipboard fallback for insecure contexts or older browsers.
function fallbackCopy(text, onSuccess) {
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        onSuccess();
    } catch {
        // Clipboard access is unavailable; leave the URL in the address bar.
    }
}

// Apply a parsed format descriptor to the input or output controls.
function applyFormatDescriptor(desc, which) {
    const isInput = which === 'input';
    if (desc.presetKey) {
        if (isInput) {
            loadInputPreset(desc.presetKey);
        } else {
            loadOutputPreset(desc.presetKey);
        }
        return;
    }

    const ids = isInput
        ? { sign: 'input-sign-bits', exp: 'input-exponent-bits', mant: 'input-mantissa-bits', inf: 'input-has-infinity', nan: 'input-has-nan', sub: 'input-has-subnormals', frac: 'input-fraction-bits', preset: '.input-preset' }
        : { sign: 'output-sign-bits', exp: 'output-exponent-bits', mant: 'output-mantissa-bits', inf: 'output-has-infinity', nan: 'output-has-nan', sub: 'output-has-subnormals', frac: 'output-fraction-bits', preset: '.output-preset' };

    if (desc.kind === 'int') {
        // Use a matching-signedness integer preset as the signedness carrier so
        // the existing integer code path builds Integer(bits, signed) correctly.
        const carrier = desc.signed ? 'int8' : 'uint8';
        if (isInput) {
            currentInputFormatKey = carrier;
        } else {
            currentOutputFormatKey = carrier;
        }
        document.getElementById(ids.sign).checked = false;
        document.getElementById(ids.exp).value = 0;
        document.getElementById(ids.mant).value = desc.bits;
        document.getElementById(ids.inf).checked = false;
        document.getElementById(ids.nan).checked = false;
        document.getElementById(ids.sub).checked = false;
        document.getElementById(ids.frac).value = desc.fractionBits || 0;
        document.querySelectorAll(ids.preset).forEach(btn => btn.classList.remove('active'));
        if (isInput) {
            updateInputFormatControlsVisibility(true);
            updateFormat();
        } else {
            updateOutputFormatControlsVisibility(true);
            updateOutputFormat();
        }
        return;
    }

    // Custom floating-point format.
    if (isInput) {
        currentInputFormatKey = null;
    } else {
        currentOutputFormatKey = null;
    }
    document.getElementById(ids.sign).checked = desc.signBits === 1;
    document.getElementById(ids.exp).value = desc.exponentBits;
    document.getElementById(ids.mant).value = desc.mantissaBits;
    document.getElementById(ids.inf).checked = desc.hasInfinity;
    document.getElementById(ids.nan).checked = desc.hasNaN;
    document.getElementById(ids.sub).checked = desc.hasSubnormals !== false;
    document.querySelectorAll(ids.preset).forEach(btn => btn.classList.remove('active'));
    if (isInput) {
        updateInputFormatControlsVisibility(false);
        updateFormat();
    } else {
        updateOutputFormatControlsVisibility(false);
        updateOutputFormat();
    }
}

// Restore state from the page URL. Returns true if any parameter was applied.
function applyStateFromUrl() {
    const parsed = parseSearchParams(window.location.search);
    if (!parsed) return false;

    if (parsed.roundingMode) {
        currentRoundingMode = parsed.roundingMode;
        const select = document.getElementById('rounding-mode');
        if (select) select.value = parsed.roundingMode;
    }

    if (parsed.overflowMode) {
        currentOverflowMode = parsed.overflowMode;
        const select = document.getElementById('overflow-mode');
        if (select) select.value = parsed.overflowMode;
    }

    if (parsed.input) applyFormatDescriptor(parsed.input, 'input');
    if (parsed.output) applyFormatDescriptor(parsed.output, 'output');

    if (parsed.value && parsed.value.hex !== undefined) {
        // Exact bit pattern: set bits directly without re-encoding the decimal.
        // handleHexInput refreshes the active preset highlight itself.
        handleHexInput({ target: { value: parsed.value.hex } });
    } else {
        if (parsed.value && parsed.value.decimal !== undefined) {
            setValueFromText(parsed.value.decimal, parsed.value.text);
            document.getElementById('input-decimal-input').value = decimalToString(currentValue);
        }
        updateValue();
    }

    return true;
}

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

    // Copy the current shareable URL to the clipboard.
    const copyLinkBtn = document.getElementById('copy-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => copyShareLink(copyLinkBtn));
    }

    // Input format inputs
    document.getElementById('input-sign-bits').addEventListener('change', updateFormat);
    document.getElementById('input-exponent-bits').addEventListener('input', updateFormat);
    document.getElementById('input-mantissa-bits').addEventListener('input', updateFormat);
    document.getElementById('input-has-infinity').addEventListener('change', updateFormat);
    document.getElementById('input-has-nan').addEventListener('change', updateFormat);
    document.getElementById('input-has-subnormals').addEventListener('change', updateFormat);
    document.getElementById('input-fraction-bits').addEventListener('input', updateFormat);

    // Output format inputs
    document.getElementById('output-sign-bits').addEventListener('change', updateOutputFormat);
    document.getElementById('output-exponent-bits').addEventListener('input', updateOutputFormat);
    document.getElementById('output-mantissa-bits').addEventListener('input', updateOutputFormat);
    document.getElementById('output-has-infinity').addEventListener('change', updateOutputFormat);
    document.getElementById('output-has-nan').addEventListener('change', updateOutputFormat);
    document.getElementById('output-has-subnormals').addEventListener('change', updateOutputFormat);
    document.getElementById('output-fraction-bits').addEventListener('input', updateOutputFormat);

    // Value input
    document.getElementById('input-decimal-input').addEventListener('input', (e) => {
        const parsed = parseDecimal(e.target.value);
        if (parsed === null) {
            // Transient/unparseable input ("-", "1e", ".", "3.14abc", ""):
            // keep the last valid value instead of resetting the UI to zero.
            return;
        }
        setValueFromText(parsed, e.target.value);
        updateValue();
    });

    // Hex input
    document.getElementById('input-hex-input').addEventListener('input', handleHexInput);

    // Rounding mode
    document.getElementById('rounding-mode').addEventListener('change', (e) => {
        currentRoundingMode = e.target.value;
        updateOverflowModeUi();
        updateValue();
    });

    // Overflow behavior. The empty option means "format default", which is a
    // real third state and must not collapse to one of the two modes.
    document.getElementById('overflow-mode').addEventListener('change', (e) => {
        currentOverflowMode = e.target.value || null;
        updateOverflowModeUi();
        updateValue();
    });
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
        document.getElementById('input-has-subnormals').checked = false;
        document.getElementById('input-fraction-bits').value = format.fractionBits || 0;
        
        // Store the integer format key for reference
        currentInputFormatKey = formatKey;
        updateInputFormatControlsVisibility(true);
    } else {
        document.getElementById('input-sign-bits').checked = format.sign === 1;
        document.getElementById('input-exponent-bits').value = format.exponent;
        document.getElementById('input-mantissa-bits').value = format.mantissa;
        document.getElementById('input-has-infinity').checked = format.hasInfinity !== false;
        document.getElementById('input-has-nan').checked = format.hasNaN !== false;
        document.getElementById('input-has-subnormals').checked = format.hasSubnormals !== false;
        
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
        document.getElementById('output-has-subnormals').checked = false;
        document.getElementById('output-fraction-bits').value = format.fractionBits || 0;
        
        // Store the integer format key for reference
        currentOutputFormatKey = formatKey;
        updateOutputFormatControlsVisibility(true);
    } else {
        document.getElementById('output-sign-bits').checked = format.sign === 1;
        document.getElementById('output-exponent-bits').value = format.exponent;
        document.getElementById('output-mantissa-bits').value = format.mantissa;
        document.getElementById('output-has-infinity').checked = format.hasInfinity !== false;
        document.getElementById('output-has-nan').checked = format.hasNaN !== false;
        document.getElementById('output-has-subnormals').checked = format.hasSubnormals !== false;
        
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
    const exponentBits = exponentBitsInput === '' ? 8 : clampFieldInt(exponentBitsInput, 0, 15, 8);
    const mantissaBitsInput = document.getElementById('input-mantissa-bits').value;
    const mantissaBits = mantissaBitsInput === '' ? 23 : clampFieldInt(mantissaBitsInput, 0, 112, 23);
    const hasInfinity = document.getElementById('input-has-infinity').checked;
    const hasNaN = document.getElementById('input-has-nan').checked;
    const hasSubnormals = document.getElementById('input-has-subnormals').checked;
    const fractionBitsInput = document.getElementById('input-fraction-bits').value;

    // Check if this matches an integer format
    if (currentInputFormatKey && FORMATS[currentInputFormatKey] && FORMATS[currentInputFormatKey].isInteger) {
        const intFormat = FORMATS[currentInputFormatKey];
        // Use the bits from UI input, but preserve signedness from the preset.
        // Integer widths are clamped to [1, 64] (the Integer/resolveFormat/URL
        // range) rather than the float mantissa's [0, 112].
        const bitsFromUI = clampFieldInt(mantissaBitsInput, 1, 64, intFormat.bits);
        const presetFractionBits = intFormat.fractionBits || 0;
        const fractionBits = clampFieldInt(fractionBitsInput, 0, bitsFromUI - 1, 0);
        // Symmetry is a property of the NAMED preset, not of a bit width, and
        // the custom integer URL grammar (i{bits}q{frac}) has no slot for it.
        // Keeping it once the user edits the shape would produce a live format
        // whose range the generated link cannot reproduce, so it is dropped the
        // moment the visible shape stops matching the preset exactly.
        const matchesPresetShape =
            bitsFromUI === intFormat.bits && fractionBits === presetFractionBits;
        currentFormat = new Integer(bitsFromUI, intFormat.signed, {
            fractionBits,
            symmetric: intFormat.symmetric && matchesPresetShape,
        });

        // Custom shape: this is no longer the named preset.
        if (!matchesPresetShape) {
            document.querySelectorAll('.input-preset').forEach(btn => btn.classList.remove('active'));
        }
    } else {
        // Reset integer format key if UI changed
        currentInputFormatKey = null;
        
        // Find matching format to get bias
        let formatOptions = {
            hasInfinity: hasInfinity,
            hasNaN: hasNaN,
            hasSubnormals: hasSubnormals
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
    updateOverflowModeUi();
    updateValue();
}

// Why the format resolves the way it does, so "Output format's default" is
// legible rather than mysterious.
function overflowAuthority(format) {
    if (format.isInteger) return 'Saturate (Ints always clamp)';
    if (format.hasInfinity) return 'Infinity (IEEE 754)';
    if (format.overflowTarget('overflow') === 'nan') return 'Saturate (OCP OFP8 "SAT")';
    return 'Saturate (no Inf/NaN)';
}

// Refresh the overflow control: the deferral option names the behavior the
// active OUTPUT format would use on its own, so it reads as a real choice
// rather than a mystery. The caveats (IEEE 754 §7.4 directed rounding, formats
// where both modes coincide) live in the About section rather than beside the
// control.
function updateOverflowModeUi() {
    const defaultOption = document.getElementById('overflow-mode-default');
    if (!defaultOption) return;

    defaultOption.textContent = `Output's default \u2014 ${overflowAuthority(outputFormat)}`;
}

function updateValuePresetButtons() {
    // Enable/disable value preset buttons based on format capabilities
    const infinityBtn = document.querySelector('.preset-btn[data-value="infinity"]');
    const negInfinityBtn = document.querySelector('.preset-btn[data-value="neg-infinity"]');
    const nanBtn = document.querySelector('.preset-btn[data-value="nan"]');
    const maxSubnormBtn = document.querySelector('.preset-btn[data-value="max-subnorm"]');
    const minSubnormBtn = document.querySelector('.preset-btn[data-value="min-subnorm"]');
    const zeroBtn = document.querySelector('.preset-btn[data-value="zero"]');

    // Integer formats don't support infinity, NaN, or subnormals
    const isInteger = currentFormat.isInteger;
    // A format with no subnormal regime (E8M0) has no subnormals and no zero.
    const hasSubnormals = !isInteger && currentFormat.hasSubnormals &&
        currentFormat.mantissaBits > 0;

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
        maxSubnormBtn.disabled = !hasSubnormals;
    }
    if (minSubnormBtn) {
        minSubnormBtn.disabled = !hasSubnormals;
    }
    if (zeroBtn) {
        zeroBtn.disabled = !isInteger && !currentFormat.hasSubnormals;
    }
}

function updateOutputFormat() {
    const signBits = document.getElementById('output-sign-bits').checked ? 1 : 0;
    const exponentBitsInput = document.getElementById('output-exponent-bits').value;
    const exponentBits = exponentBitsInput === '' ? 5 : clampFieldInt(exponentBitsInput, 0, 15, 5);
    const mantissaBitsInput = document.getElementById('output-mantissa-bits').value;
    const mantissaBits = mantissaBitsInput === '' ? 10 : clampFieldInt(mantissaBitsInput, 0, 112, 10);
    const hasInfinity = document.getElementById('output-has-infinity').checked;
    const hasNaN = document.getElementById('output-has-nan').checked;
    const hasSubnormals = document.getElementById('output-has-subnormals').checked;
    const fractionBitsInput = document.getElementById('output-fraction-bits').value;

    // Check if this matches an integer format
    if (currentOutputFormatKey && FORMATS[currentOutputFormatKey] && FORMATS[currentOutputFormatKey].isInteger) {
        const intFormat = FORMATS[currentOutputFormatKey];
        // Use the bits from UI input, but preserve signedness from the preset.
        // Integer widths are clamped to [1, 64] (the Integer/resolveFormat/URL
        // range) rather than the float mantissa's [0, 112].
        const bitsFromUI = clampFieldInt(mantissaBitsInput, 1, 64, intFormat.bits);
        const presetFractionBits = intFormat.fractionBits || 0;
        const fractionBits = clampFieldInt(fractionBitsInput, 0, bitsFromUI - 1, 0);
        // Same exact-shape rule as updateFormat(); see the comment there.
        const matchesPresetShape =
            bitsFromUI === intFormat.bits && fractionBits === presetFractionBits;
        outputFormat = new Integer(bitsFromUI, intFormat.signed, {
            fractionBits,
            symmetric: intFormat.symmetric && matchesPresetShape,
        });

        // Custom shape: this is no longer the named preset.
        if (!matchesPresetShape) {
            document.querySelectorAll('.output-preset').forEach(btn => btn.classList.remove('active'));
        }
    } else {
        // Reset integer format key if UI changed
        currentOutputFormatKey = null;
        
        // Find matching format to get bias
        let formatOptions = {
            hasInfinity: hasInfinity,
            hasNaN: hasNaN,
            hasSubnormals: hasSubnormals
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

    updateOverflowModeUi();
    updateOutput();
}

// Record a value that came from a bit pattern or a value preset. There is no
// decimal literal behind such a value, and any literal still on record from
// earlier typing must be dropped along with it — otherwise the next re-encode
// would round that stale text instead of the bits the user just set.
function setValueFromBits(value) {
    currentValue = value;
    currentValueText = null;
}

// Record a value the user typed or that arrived in a link. The literal is kept
// alongside the parsed number so that a later re-encode can round the original
// decimal exactly rather than the double it was parsed into. Text that is not a
// plain decimal ("inf", "nan", hex) has no exact form, so it records no literal.
function setValueFromText(value, text) {
    currentValue = value;
    currentValueText =
        typeof text === 'string' && FloatingPoint.isDecimalLiteral(text) ? text : null;
}

// Re-encode whatever value is currently on record. The literal, if there is one,
// is handed to the encoder as a string: it rounds the exact decimal straight to
// the format, where going through the parsed double first double-rounds and can
// land on the wrong neighbour for the narrow formats. That is why a rounding-mode
// or format change re-encodes through here rather than through the double.
function updateValue() {
    currentEncoded = currentFormat.encode(
        currentValueText !== null ? currentValueText : currentValue,
        { roundingMode: currentRoundingMode, overflowMode: currentOverflowMode || undefined });
    updateRepresentation();
    updateOutput();
    updateActiveValuePreset();
}

function updateRepresentation() {
    const { sign, exponent, mantissa } = currentEncoded;

    // Get section containers
    const signSection = document.querySelector('#input-binary-sign-checks').closest('.bit-section-container');
    const expSection = document.querySelector('#input-binary-exponent-checks').closest('.bit-section-container');

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
    const checksContainer = document.getElementById(`input-binary-${section}-checks`);
    const positionsContainer = document.getElementById(`input-binary-${section}-positions`);

    // Clear existing
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

    // Create checkboxes and positions for each bit
    for (let i = 0; i < binaryString.length; i++) {
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

    // Convert binary to integer safely
    const value = binaryString === '' ? 0 : Number(BigInt('0b' + binaryString));

    // Update the current encoded value
    if (section === 'sign') {
        currentEncoded.sign = value;
    } else if (section === 'exponent') {
        currentEncoded.exponent = value;
    } else if (section === 'mantissa') {
        currentEncoded.mantissa = value;
    }

    // Decode and update current value
    setValueFromBits(currentFormat.decode(
        currentEncoded.sign,
        currentEncoded.exponent,
        currentEncoded.mantissa
    ));

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

    // Reject patterns wider than the format. Otherwise the fixed-offset
    // substring below would read the TOP bits as sign/exponent/mantissa and
    // silently produce a wrong value (reachable from typing and shared URLs).
    if (hexValue.length > Math.ceil(currentFormat.totalBits / 4)) {
        return;
    }

    // Convert hex to binary (BigInt-safe for >53 bits)
    const rawBinary = BigInt('0x' + hexValue).toString(2);
    if (rawBinary.length > currentFormat.totalBits) {
        return; // Overlong even after accounting for a partial leading nibble.
    }
    const binary = rawBinary.padStart(currentFormat.totalBits, '0');

    // Handle integer formats
    if (currentFormat.isInteger) {
        const mantissa = Number(BigInt('0b' + binary));
        currentEncoded = { sign: 0, exponent: 0, mantissa };
        setValueFromBits(currentFormat.decode(0, 0, mantissa));
        
        // Update UI
        document.getElementById('input-decimal-input').value = currentValue;
        createBinaryCheckboxes('sign', '');
        createBinaryCheckboxes('exponent', '');
        createBinaryCheckboxes('mantissa', mantissa.toString(2).padStart(currentFormat.bits, '0'));
        
        updateComponents();
        updateOutput();
        updateActiveValuePreset();
        return;
    }

    // Extract components for floating point
    let bitIndex = 0;
    const sign = currentFormat.signBits ? parseInt(binary.substring(bitIndex, bitIndex + currentFormat.signBits), 2) : 0;
    bitIndex += currentFormat.signBits;
    const exponent = currentFormat.exponentBits ? parseInt(binary.substring(bitIndex, bitIndex + currentFormat.exponentBits), 2) : 0;
    bitIndex += currentFormat.exponentBits;
    const mantissa = currentFormat.mantissaBits > 0 ? Number(BigInt('0b' + binary.substring(bitIndex, bitIndex + currentFormat.mantissaBits))) : 0;

    // Update current encoded
    currentEncoded = { sign, exponent, mantissa };

    // Decode to get value
    setValueFromBits(currentFormat.decode(sign, exponent, mantissa));

    // Update UI
    document.getElementById('input-decimal-input').value = currentValue;
    createBinaryCheckboxes('sign', currentFormat.signBits ? sign.toString() : '');
    createBinaryCheckboxes('exponent', currentFormat.exponentBits > 0 ?
        exponent.toString(2).padStart(currentFormat.exponentBits, '0') : '');
    createBinaryCheckboxes('mantissa', currentFormat.mantissaBits > 0 ?
        mantissa.toString(2).padStart(currentFormat.mantissaBits, '0') : '');

    updateComponents();
    updateOutput();
    updateActiveValuePreset();
}

function determineFloatType(format, sign, exponent, mantissa) {
    // Handle integer formats
    if (format.isInteger) {
        const value = format.decode(sign, exponent, mantissa);
        if (value === 0) {
            return 'Zero';
        }
        // A format with an implicit scale (MXINT8) does not hold integers.
        const noun = format.fractionBits ? 'Fixed-point' : 'Integer';
        return value > 0 ? `Positive ${noun}` : `Negative ${noun}`;
    }

    if (format.exponentBits === 0) {
        // Fixed-point format
        if (mantissa === 0) {
            return sign ? '-Zero' : '+Zero';
        }
        return 'Fixed-point';
    }

    // Floating-point classification lives in the library so every surface agrees.
    const kind = format.classify(sign, exponent, mantissa);
    switch (kind) {
        case 'Zero': return sign ? '-Zero' : '+Zero';
        case 'Infinity': return sign ? '-Infinity' : '+Infinity';
        case 'NaN': return 'NaN';
        default: return kind; // 'Normal' | 'Subnormal'
    }
}

function calculateMantissaDecimal(format, exponent, mantissa) {
    // For integer formats, return the raw value
    if (format.isInteger) {
        return format.decode(0, 0, mantissa);
    }

    // Exponent field 0 only carries the implicit-bit-less "0.x" significand in a
    // format that HAS a subnormal regime. Where it does not (E8M0), field 0 is
    // an ordinary normal binade and its significand is 1.x like any other.
    const subnormalRegime = exponent === 0 && format.hasSubnormals;

    if (format.mantissaBits === 0) {
        return subnormalRegime ? 0 : 1.0;
    }
    return subnormalRegime ?
        mantissa / Math.pow(2, format.mantissaBits) :
        1.0 + mantissa / Math.pow(2, format.mantissaBits);
}

function formatExponentActual(format, exponent, mantissa) {
    // Integer formats don't have exponents
    if (format.isInteger) {
        return 'N/A';
    }
    
    if (format.exponentBits === 0) {
        return 'N/A';
    }
    // Subnormals share the smallest normal's exponent, 1 - bias. A format with
    // no subnormals uses field 0 as a normal binade of its own, so it falls
    // through to the ordinary formula and reads 0 - bias.
    if (exponent === 0 && format.hasSubnormals) {
        return `1 - ${format.bias} = ${1 - format.bias}`;
    } else if (exponent === format.maxExponent) {
        // Only genuine Infinity/NaN encodings are "Special"; a normal value at
        // maxExponent (OCP-style) shows the real exponent. Sign is irrelevant
        // to the classification here.
        const kind = format.classify(0, exponent, mantissa);
        if (kind === 'Infinity' || kind === 'NaN') {
            return 'Special';
        }
        return `${exponent} - ${format.bias} = ${exponent - format.bias}`;
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
        formatExponentActual(format, exponent, mantissa);
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
                mantissa: Math.pow(2, currentFormat.bits) - 1,
                isInteger: true
            };
        } else {
            currentEncoded = {
                sign: currentFormat.signBits ? 1 : 0,
                exponent: currentFormat.maxExponent,
                mantissa: Math.pow(2, currentFormat.mantissaBits) - 1
            };
        }
        setValueFromBits(currentFormat.decode(
            currentEncoded.sign,
            currentEncoded.exponent,
            currentEncoded.mantissa
        ));
        document.getElementById('input-decimal-input').value = currentValue;
        updateRepresentation();
        updateOutput();
        updateActiveValuePreset();
        return;
    }

    // Every remaining preset is a value the format either has or does not.
    // getPresetValue() is the single source of truth for which, so the button
    // and the highlight can never disagree about it.
    const value = getPresetValue(valueKey, currentFormat);
    if (value === null) return;
    setValueFromBits(value);

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
                return format.maxRealValue;
            case 'min-norm':
                return format.minRealValue;
            default:
                return null;
        }
    }
    
    switch (valueKey) {
        case 'zero':
            // A format with no zero encoding (E8M0) has no such value to show.
            return format.hasSubnormals ? 0 : null;
        case 'one':
            return 1;
        case 'max-norm': {
            const maxNormal = format.getMaxNormal(false);
            return format.decode(maxNormal.sign, maxNormal.exponent, maxNormal.mantissa);
        }
        case 'min-norm':
            // A format with no subnormals uses exponent field 0 as its smallest
            // normal binade instead of reserving it.
            return format.decode(0, format.hasSubnormals ? 1 : 0, 0);
        case 'max-subnorm':
            // Needs both a subnormal regime and a mantissa field to hold one.
            if (!format.hasSubnormals || format.mantissaBits === 0) return null;
            return format.decode(
                0,
                0,
                Math.pow(2, format.mantissaBits) - 1
            );
        case 'min-subnorm':
            if (!format.hasSubnormals || format.mantissaBits === 0) return null;
            return format.decode(0, 0, 1);
        case 'infinity':
            return format.hasInfinity ? Infinity : null;
        case 'neg-infinity':
            return format.hasInfinity ? -Infinity : null;
        case 'nan':
            return format.hasNaN ? NaN : null;
        default:
            return null;
    }
}

function valuesMatch(a, b, format) {
    // Handle NaN comparison
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    // Compare the encoded representations under the active rounding mode so the
    // preset highlight matches the encoding the user actually sees.
    const encodedA = format.encode(a, { roundingMode: currentRoundingMode, overflowMode: currentOverflowMode || undefined });
    const encodedB = format.encode(b, { roundingMode: currentRoundingMode, overflowMode: currentOverflowMode || undefined });
    return encodedA.sign === encodedB.sign &&
           encodedA.exponent === encodedB.exponent &&
           encodedA.mantissa === encodedB.mantissa;
}

function isAllOnesMatch(encoded, format) {
    // Check if encoded value has all bits set to 1
    if (format.isInteger) {
        const expectedMantissa = Math.pow(2, format.bits) - 1;
        return encoded.mantissa === expectedMantissa;
    }
    
    const expectedSign = format.signBits ? 1 : 0;
    const expectedExponent = format.maxExponent;
    const expectedMantissa = Math.pow(2, format.mantissaBits) - 1;
    
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
    const outputEncoded = outputFormat.encode(inputValue, { roundingMode: currentRoundingMode, overflowMode: currentOverflowMode || undefined });
    const outputValue = outputFormat.decode(
        outputEncoded.sign,
        outputEncoded.exponent,
        outputEncoded.mantissa
    );

    // Update decimal display
    document.getElementById('output-decimal').textContent = outputValue;

    // Get output section containers
    const outputSignSection = document.querySelector('#output-binary-sign-values').closest('.bit-section-container');
    const outputExpSection = document.querySelector('#output-binary-exponent-values').closest('.bit-section-container');

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
    const relativeLoss = (inputValue !== 0 && isFinite(inputValue))
        ? (loss / Math.abs(inputValue) * 100).toFixed(6)
        : '0';

    // Show/hide precision loss based on whether there's actual loss
    const precisionLossElement = document.querySelector('.precision-loss');
    if (loss === 0 || isNaN(loss)) {
        precisionLossElement.style.display = 'none';
    } else {
        precisionLossElement.style.display = 'flex';
        if (!isFinite(loss)) {
            // Finite input rounded to Infinity in the output format: the
            // relative loss is meaningless, so label it plainly.
            document.getElementById('output-precision-loss').textContent = 'overflow';
        } else {
            document.getElementById('output-precision-loss').textContent =
                `${loss.toExponential(6)} (${relativeLoss}%)`;
        }
    }

    // Update output value preset highlighting
    updateActiveOutputValuePreset(outputEncoded, outputValue);

    // Keep the shareable URL in sync with the latest conversion. updateOutput()
    // is the single chokepoint reached by every state change.
    syncUrl();
}

function createOutputBinaryDisplay(section, binaryString) {
    const valuesContainer = document.getElementById(`output-binary-${section}-values`);
    const positionsContainer = document.getElementById(`output-binary-${section}-positions`);

    // Clear existing
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

    // Create value displays and positions for each bit
    for (let i = 0; i < binaryString.length; i++) {
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

// Export for Node.js (testing). The browser loads this file as a plain script,
// so this block is inert there.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        clampFieldInt,
        updateInputFormatControlsVisibility,
        updateOutputFormatControlsVisibility,
        applyFormatDescriptor,
        applyStateFromUrl,
        enableUrlSync,
        setupEventListeners,
        loadInputPreset,
        loadOutputPreset,
        loadValuePreset,
        updateFormat,
        updateOutputFormat,
        updateValue,
        updateOutput,
        handleHexInput,
        determineFloatType,
        calculateMantissaDecimal,
        formatExponentActual,
        calculateBitStartPosition,
        getPresetValue,
        valuesMatch,
        isAllOnesMatch,
    };
}
