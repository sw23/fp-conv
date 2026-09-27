// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS, sameValue, sameEncoding, normalizedEncoding, conversionLoss, convertEncoded, showsDecodedValue, encodingValueText, showsDecodedSignificand, CONVERSION_LOSS_LABELS, buildSearchParams, parseSearchParams, parseDecimal, modeUrlValue */
// UI code - requires FloatingPoint, Integer, FORMATS and the conversion helpers
// from floating-point.js, and the URL helpers from url-state.js.

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
        const params = new URLSearchParams(buildSearchParams({
            inputFormat: currentFormat,
            outputFormat: outputFormat,
            currentValue: currentValue,
            currentValueText: currentValueText,
            currentEncoded: currentEncoded,
            roundingMode: currentRoundingMode,
            overflowMode: currentOverflowMode,
        }));

        // A display preference rather than conversion state, so mode.js owns
        // it - and decides whether it is explicit enough to share at all.
        const mode = typeof modeUrlValue === 'function' ? modeUrlValue() : null;
        if (mode) {
            params.set('mode', mode);
        }

        const query = params.toString();
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
        // handleHexInput never writes the hex field (the user is typing in it),
        // so a link must. Spell it from the committed encoding, not the link
        // text, so a rejected pattern leaves the box matching the page.
        document.getElementById('input-hex-input').value = currentFormat.toHexString(
            currentEncoded.sign, currentEncoded.exponent, currentEncoded.mantissa);
    } else {
        if (parsed.value && parsed.value.decimal !== undefined) {
            setValueFromText(parsed.value.decimal, parsed.value.text);
            document.getElementById('input-decimal-input').value = parsed.value.text;
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
            clearInputRepresentedValue();
            return;
        }
        setValueFromText(parsed, e.target.value);
        updateValue();
    });

    document.getElementById('input-represented-value').addEventListener('click', () => {
        const representedValue = currentFormat.decode(
            currentEncoded.sign,
            currentEncoded.exponent,
            currentEncoded.mantissa);
        const representedText = currentFormat.toExactDecimalString(currentEncoded);
        document.getElementById('input-decimal-input').value = representedText;
        setValueFromText(representedValue, representedText);
        updateValue();
    });

    // Hex input
    document.getElementById('input-hex-input').addEventListener('input', handleHexInput);

    // Rounding mode
    document.getElementById('rounding-mode').addEventListener('change', (e) => {
        currentRoundingMode = e.target.value;
        updateOverflowModeUi();
        updateOutput();
    });

    // Overflow behavior. The empty option means "format default", which is a
    // real third state and must not collapse to one of the two modes.
    document.getElementById('overflow-mode').addEventListener('change', (e) => {
        currentOverflowMode = e.target.value || null;
        updateOverflowModeUi();
        updateOutput();
    });

    window.addEventListener('modechange', syncUrl);
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

// Lock the flag checkboxes the library decides for itself (the rule is the
// FloatingPoint constructor's). A layout with no exponent field has no
// Infinity or NaN encoding and no binade for the subnormal flag to repurpose,
// so all three are ignored; those boxes keep the user's choice for when the
// field comes back, since the flags say nothing about such a layout and the
// generated link leaves them out. With an Infinity the layout decides NaN as
// well (the rest of the top binade, or nothing with no mantissa field), so
// that box is locked until Infinity is unchecked and shows what the format
// has: left at a stale "off" it would say the format has no NaN while the
// NaN preset works and the link reloads with the box on.
function lockDecidedFlags(prefix, format) {
    const fixed = format.exponentBits === 0;
    document.getElementById(`${prefix}-has-infinity`).disabled = fixed;
    const nan = document.getElementById(`${prefix}-has-nan`);
    nan.disabled = fixed || format.hasInfinity;
    if (format.hasInfinity) nan.checked = format.hasNaN;
    document.getElementById(`${prefix}-has-subnormals`).disabled = fixed;
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
        // NaN is the user's choice only without an Infinity (see
        // lockDecidedFlags()); with one the constructor decides it, and the
        // locked box may still hold a choice the constructor refuses.
        let formatOptions = {
            hasInfinity: hasInfinity,
            hasNaN: hasInfinity ? undefined : hasNaN,
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

        lockDecidedFlags('input', currentFormat);
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

// A preset is offered exactly when it names something in this format, which is
// the question loading and highlighting already ask. Deciding it separately
// here is how the -Infinity and Min Sub buttons once stayed enabled on formats
// whose table had no entry for them.
function updateValuePresetButtons() {
    document.querySelectorAll('.preset-btn[data-value]:not(.output-value-preset)').forEach(btn => {
        const key = btn.dataset.value;
        btn.disabled = getPresetEncoding(key, currentFormat) === null &&
            getPresetValue(key, currentFormat) === null;
    });
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
        // NaN is the user's choice only without an Infinity (see
        // lockDecidedFlags()); with one the constructor decides it, and the
        // locked box may still hold a choice the constructor refuses.
        let formatOptions = {
            hasInfinity: hasInfinity,
            hasNaN: hasInfinity ? undefined : hasNaN,
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

        lockDecidedFlags('output', outputFormat);
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

// Record a value that came from a value preset. There is no decimal literal
// behind such a value, and any literal still on record from earlier typing must
// be dropped along with it — otherwise the next re-encode would round that
// stale text instead of the value the user just picked.
function setValueFromBits(value) {
    currentValue = value;
    currentValueText = null;
    clearInputRepresentedValue();
}

// Every value readout - input, output and both "Actual Value" lines - spells a
// value that came from bits with the library's encodingValueText(), which
// WebMCP and the CLI use for the same job.

// Record a value that came from a bit pattern (checkboxes, hex field, encoding
// preset) and show the decimal those bits denote. A later re-encode must see
// the exact value: the double where it is exact, otherwise the exact decimal.
// The text shown is the double's shortest spelling, which need not be exact.
function setValueFromEncoding(format, encoded) {
    const value = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
    if (showsDecodedValue(format, encoded)) {
        setValueFromBits(value);
    } else {
        // Exact text, but still bits: no typed value for a hint to describe.
        setValueFromText(value, format.toExactDecimalString(encoded));
        clearInputRepresentedValue();
    }
    document.getElementById('input-decimal-input').value = encodingValueText(format, encoded);
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
        currentValueText !== null ? currentValueText : currentValue);
    updateInputRepresentedValue();
    updateRepresentation();
    updateOutput();
    updateActiveValuePreset();
}

function updateInputRepresentedValue() {
    const input = document.getElementById('input-decimal-input');
    const represented = document.getElementById('input-represented-value');
    const message = document.getElementById('input-representation-message');
    if (!input || !represented || !message) return;

    if (currentEncoded === null) {
        clearInputRepresentedValue();
        return;
    }

    const representedValue = currentFormat.decode(
        currentEncoded.sign,
        currentEncoded.exponent,
        currentEncoded.mantissa);

    // A decimal literal is checked exactly against what it encoded to. A value
    // with no literal ("inf", NaN, a preset like One) is checked against what
    // the format made of it, e.g. s1e0m8 holds no 1 (its maximum is 255/256).
    const inexact = currentValueText !== null
        ? !currentFormat.isExactlyRepresentable(currentValueText, currentEncoded)
        : !sameValue(currentValue, representedValue);
    if (!inexact) {
        clearInputRepresentedValue();
        return;
    }
    input.classList.add('input-inexact');
    // Always the exact decimal: clicking the hint accepts it as the new
    // literal, which must re-encode to these bits. It spells the special
    // encodings itself, so a max normal that overflows fp64 is not mislabeled.
    const displayedValue = currentFormat.toExactDecimalString(currentEncoded);
    represented.textContent = displayedValue;
    represented.title = displayedValue;
    represented.setAttribute('aria-label', `Use represented input value ${displayedValue}`);
    represented.hidden = false;
    message.hidden = false;
    represented.closest('.decimal-input-row').classList.add('has-represented-value');
}

function clearInputRepresentedValue() {
    const input = document.getElementById('input-decimal-input');
    const represented = document.getElementById('input-represented-value');
    const message = document.getElementById('input-representation-message');
    if (input) input.classList.remove('input-inexact');
    if (message) message.hidden = true;
    if (!represented) return;
    represented.textContent = '';
    represented.title = 'Use this represented value';
    represented.setAttribute('aria-label', 'Use represented input value');
    represented.hidden = true;
    represented.closest('.decimal-input-row').classList.remove('has-represented-value');
}

function updateRepresentation() {
    updateBitCheckboxes();

    // Hex representation
    const { sign, exponent, mantissa } = currentEncoded;
    document.getElementById('input-hex-input').value =
        currentFormat.toHexString(sign, exponent, mantissa);

    // Update components
    updateComponents();
}

// The input's bit checkboxes for currentEncoded.
function updateBitCheckboxes() {
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

    // Read the checkboxes as an exact bit pattern. Sign and exponent are
    // narrow, but the mantissa may exceed 53 bits; normalizeMantissa() keeps it
    // exact.
    const raw = binaryString === '' ? 0n : BigInt('0b' + binaryString);

    // Update the current encoded value
    if (section === 'sign') {
        currentEncoded.sign = Number(raw);
    } else if (section === 'exponent') {
        currentEncoded.exponent = Number(raw);
    } else if (section === 'mantissa') {
        currentEncoded.mantissa = currentFormat.normalizeMantissa(raw);
    }

    // Decode and update current value
    setValueFromEncoding(currentFormat, currentEncoded);

    // Update UI (but don't recreate checkboxes to avoid losing focus)
    document.getElementById('input-hex-input').value =
        currentFormat.toHexString(currentEncoded.sign, currentEncoded.exponent, currentEncoded.mantissa);

    updateComponents();
    updateOutput();
    updateActiveValuePreset();
}

function handleHexInput(e) {
    // The format reads the pattern, by the rule every surface shares: a
    // pattern wider than the format is refused rather than read at a fixed
    // offset (which would make its top bits the sign and exponent, reachable
    // from typing and shared URLs), leading zero digits are fine, and the
    // fields stay exact past 53 bits. Partial or invalid text mid-typing is
    // ignored, as is an empty box.
    let fields;
    try {
        fields = currentFormat.fromHexString(e.target.value);
    } catch (err) {
        if (err instanceof RangeError) return;
        throw err;
    }
    currentEncoded = fields;
    setValueFromEncoding(currentFormat, currentEncoded);

    // Not updateRepresentation(): that rewrites this field mid-typing.
    updateBitCheckboxes();
    updateComponents();
    updateOutput();
    updateActiveValuePreset();
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
    // The type name and the significand come from the library, so every
    // surface names a bit pattern the same way.
    document.getElementById(`${idPrefix}-comp-type`).textContent =
        format.typeLabel(sign, exponent, mantissa);
    document.getElementById(`${idPrefix}-comp-mantissa-dec`).textContent =
        mantissaDecimalText(format, encoded);
    document.getElementById(`${idPrefix}-comp-value`).textContent =
        encodingValueText(format, encoded);
}

// The "mantissa (decimal)" line as text: the significand's double at ten
// places where the double is the significand, and the exact decimal where it
// is not, like the value lines (toFixed(10) on the double spells u64 all-ones
// as 2^64, and a 60-bit all-ones normal significand as 2.0000000000).
function mantissaDecimalText(format, encoded) {
    const { exponent, mantissa } = encoded;
    if (!showsDecodedSignificand(format, exponent, mantissa)) {
        return format.exactSignificandString(exponent, mantissa);
    }
    return format.significand(exponent, mantissa).toFixed(10);
}

function updateComponents() {
    updateComponentsDisplay(currentFormat, currentEncoded, 'input');
}

function loadValuePreset(valueKey) {
    // A preset that names a bit pattern is loaded as bits: a round trip through
    // a double would round it, or turn a max normal past fp64's range into
    // Infinity.
    const encoded = getPresetEncoding(valueKey, currentFormat);
    if (encoded !== null) {
        currentEncoded = encoded;
        setValueFromEncoding(currentFormat, encoded);
        updateRepresentation();
        updateOutput();
        updateActiveValuePreset();
        return;
    }

    // What is left is a value the format may not hold exactly (One on a
    // fixed-point layout). getPresetValue() is the single source of truth, so
    // the button and the highlight agree; updateValue() shows the result.
    const value = getPresetValue(valueKey, currentFormat);
    if (value === null) return;
    setValueFromBits(value);

    document.getElementById('input-decimal-input').value = currentValue;
    updateValue();
}

// The encoding a preset names, or null for a value preset (One, NaN) or one the
// format lacks. Loading and highlighting both match on bits, which keeps Max
// and +Infinity apart where the max normal overflows a double.
function getPresetEncoding(valueKey, format) {
    if (format.isInteger) {
        switch (valueKey) {
            case 'all-ones':
                // maxMantissa is exact at any width; 2^bits - 1 would round.
                return normalizedEncoding(format, 0, 0, format.maxMantissa);
            case 'zero':
                return format.getZero();
            case 'max-norm':
                return format.getMaxValue();
            case 'min-norm':
                return format.getMinValue();
            default:
                return null;
        }
    }

    switch (valueKey) {
        case 'all-ones':
            return normalizedEncoding(format, format.signBits ? 1 : 0,
                format.maxExponent, format.maxMantissa);
        case 'zero':
            // A format with no zero encoding (E8M0) has no such value to show.
            return format.hasSubnormals ? format.getZero() : null;
        case 'max-norm': {
            // s1e1m0 with an Infinity has no finite pattern but its zero,
            // which Zero already names.
            const max = format.getMaxNormal(false);
            return max.isZero ? null : max;
        }
        case 'min-norm':
            return format.getMinNormal();
        case 'max-subnorm':
            return format.getMaxSubnormal();
        case 'min-subnorm':
            return format.getMinSubnormal();
        case 'infinity':
            return format.hasInfinity ? format.getInfinity(false) : null;
        case 'neg-infinity':
            // An unsigned format's getInfinity(true) is +Infinity, which the
            // +Inf preset already names.
            return format.hasInfinity && format.signBits ? format.getInfinity(true) : null;
        default:
            // 'one' and 'nan' are values: a format rounds or substitutes them.
            return null;
    }
}

// The value a preset stands for, for the presets that name a value rather than
// a bit pattern: One, which a format rounds, and NaN, which a format with a NaN
// encoding holds. A format without one substitutes a number for NaN, and that
// number's own pattern preset is the one that lights up; offering NaN there
// would light two buttons for one encoding. Every other preset is a pattern
// and loads through getPresetEncoding().
function getPresetValue(valueKey, format) {
    switch (valueKey) {
        case 'one':
            return 1;
        case 'nan':
            return format.nanTarget() === 'nan' ? NaN : null;
        default:
            return null;
    }
}

// Does this encoding hold the value a value preset names? One is matched on
// bits, against what the format makes of 1 (the format's own default rounding,
// which cannot matter for a power of two): the decoded double is not enough,
// since a mantissa wider than 53 bits rounds 1 + 2^-60 to 1. NaN is any NaN
// pattern, payload included; a format without one substitutes a number, and
// getPresetValue() offers no NaN there.
function encodingHoldsValue(format, encoded, value) {
    if (Number.isNaN(value)) {
        return Number.isNaN(format.decode(encoded.sign, encoded.exponent, encoded.mantissa));
    }
    return sameEncoding(format, encoded, format.encode(value));
}

// Is this preset the one currently shown? Every preset matches on bits, so
// two can never light up for one encoding unless they name the same pattern.
function presetMatches(valueKey, format, encoded) {
    const presetEncoded = getPresetEncoding(valueKey, format);
    if (presetEncoded !== null) {
        return sameEncoding(format, encoded, presetEncoded);
    }
    const presetValue = getPresetValue(valueKey, format);
    return presetValue !== null && encodingHoldsValue(format, encoded, presetValue);
}

function updateActiveValuePreset() {
    document.querySelectorAll('.preset-btn[data-value]:not(.output-value-preset)').forEach(btn => {
        btn.classList.toggle('active',
            presetMatches(btn.dataset.value, currentFormat, currentEncoded));
    });
}

function updateActiveOutputValuePreset(outputEncoded) {
    document.querySelectorAll('.output-value-preset').forEach(btn => {
        btn.classList.toggle('active',
            presetMatches(btn.dataset.value, outputFormat, outputEncoded));
    });
}

function updateOutput() {
    // Convert from the input encoding's exact value, not its decoded double,
    // which rounds fields wider than 53 bits and overflows past fp64's range.
    const outputEncoded = convertEncoded(currentFormat, currentEncoded, outputFormat, {
        roundingMode: currentRoundingMode,
        overflowMode: currentOverflowMode || undefined,
    });
    // Spelled like the input box (see encodingValueText()).
    document.getElementById('output-decimal').textContent =
        encodingValueText(outputFormat, outputEncoded);

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

    // Precision loss. conversionLoss() in floating-point.js decides what
    // happened, on the exact values, so this row and WebMCP's
    // precisionLoss.kind always agree. A clamped finite value gets both a word
    // and the numbers.
    const loss = conversionLoss(currentFormat, currentEncoded, outputFormat, outputEncoded, {
        roundingMode: currentRoundingMode,
    });
    const precisionLossElement = document.querySelector('.precision-loss');
    if (loss.kind === 'exact') {
        precisionLossElement.style.display = 'none';
    } else {
        precisionLossElement.style.display = 'flex';
        // A rounding is described by its numbers, and is named only when there
        // are none (a difference too large for a double). Other kinds are
        // named, with the numbers unless the difference is 0 (a dropped sign).
        // A zero input has no ratio, and conversionLoss() reports it as 0.
        const hasNumbers = loss.absolute !== null;
        const label = loss.kind === 'rounded' && hasNumbers
            ? null
            : CONVERSION_LOSS_LABELS[loss.kind];
        const measured = hasNumbers && !(label && loss.absolute === 0)
            ? `${loss.absolute.toExponential(6)} ` +
                `(${loss.relativePercent === 0 ? '0' : loss.relativePercent.toFixed(6)}%)`
            : '';
        document.getElementById('output-precision-loss').textContent =
            label && measured ? `${label} — ${measured}` : (label || measured);
    }

    // Update output value preset highlighting
    updateActiveOutputValuePreset(outputEncoded);

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
        updateInputRepresentedValue,
        updateOutput,
        handleHexInput,
        encodingValueText,
        mantissaDecimalText,
        formatExponentActual,
        calculateBitStartPosition,
        getPresetValue,
        getPresetEncoding,
        encodingHoldsValue,
    };
}
