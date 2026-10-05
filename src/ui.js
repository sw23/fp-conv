// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS, findFloatPresetKey, findIntPresetKey, sameValue, sameEncoding, normalizedEncoding, conversionLoss, convertEncoded, showsDecodedValue, encodingValueText, showsDecodedSignificand, CONVERSION_LOSS_LABELS, buildSearchParams, parseSearchParams, parseDecimal, modeUrlValue */
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

// ── The two format panels ─────────────────────────────────────
// The input and output panels have the same controls, named `${side}-...`
// with side 'input' or 'output', so everything about a panel is written once
// and takes the side. These four read and write that side's state.
function sideFormat(side) {
    return side === 'input' ? currentFormat : outputFormat;
}

function setSideFormat(side, format) {
    if (side === 'input') currentFormat = format;
    else outputFormat = format;
}

// The integer preset whose signedness (and symmetry, while the shape matches)
// the side's integer controls carry, or null on a floating-point layout.
function sideIntegerKey(side) {
    return side === 'input' ? currentInputFormatKey : currentOutputFormatKey;
}

function setSideIntegerKey(side, key) {
    if (side === 'input') currentInputFormatKey = key;
    else currentOutputFormatKey = key;
}

// Show the controls that apply: an integer has a width and an implicit scale,
// a float its fields and flags.
function updateFormatControlsVisibility(side, isInteger) {
    for (const name of ['sign-bits', 'exponent-bits', 'has-infinity', 'has-nan', 'has-subnormals']) {
        document.getElementById(`${side}-${name}`).closest('.input-group').style.display =
            isInteger ? 'none' : '';
    }
    document.getElementById(`${side}-fraction-bits`).closest('.input-group').style.display =
        isInteger ? '' : 'none';
    document.querySelector(`label[for="${side}-mantissa-bits"]`).textContent =
        isInteger ? 'Bits:' : 'Mantissa:';
}

// Write a layout into a side's controls. A field left undefined keeps its
// control's value (a float preset leaves the hidden fraction-bits box alone).
function setFormatControls(side, fields) {
    const control = (name) => document.getElementById(`${side}-${name}`);
    const checks = { 'sign-bits': fields.signBits === undefined ? undefined : fields.signBits === 1,
        'has-infinity': fields.hasInfinity, 'has-nan': fields.hasNaN, 'has-subnormals': fields.hasSubnormals };
    for (const [name, checked] of Object.entries(checks)) {
        if (checked !== undefined) control(name).checked = checked;
    }
    const values = { 'exponent-bits': fields.exponentBits, 'mantissa-bits': fields.mantissaBits,
        'fraction-bits': fields.fractionBits };
    for (const [name, value] of Object.entries(values)) {
        if (value !== undefined) control(name).value = value;
    }
}

// The controls an integer layout of this width and scale shows.
function integerControls(bits, fractionBits) {
    return { signBits: 0, exponentBits: 0, mantissaBits: bits, hasInfinity: false,
        hasNaN: false, hasSubnormals: false, fractionBits: fractionBits || 0 };
}

// Light the side's preset button that names the live format, and no other.
// The URL writer asks the same matchers, so a lit button and the link always
// name the same preset: a flag, a width or a scale that differs from the
// preset's turns it off, and getting back to the preset's layout by hand
// turns it on again.
function updateActiveFormatPreset(side) {
    const format = sideFormat(side);
    const key = format.isInteger ? findIntPresetKey(format) : findFloatPresetKey(format);
    document.querySelectorAll(`.${side}-preset`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === key);
    });
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

        // The fragment is navigation (the About anchor), not state: keep it.
        const query = params.toString();
        const newUrl = (query
            ? `${window.location.pathname}?${query}`
            : window.location.pathname) + window.location.hash;
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
function applyFormatDescriptor(desc, side) {
    if (desc.presetKey) {
        loadPreset(side, desc.presetKey);
        return;
    }

    const isInteger = desc.kind === 'int';
    if (isInteger) {
        // A matching-signedness integer preset carries the signedness, so the
        // integer path builds Integer(bits, signed) correctly.
        setSideIntegerKey(side, desc.signed ? 'int8' : 'uint8');
        setFormatControls(side, integerControls(desc.bits, desc.fractionBits));
    } else {
        setSideIntegerKey(side, null);
        setFormatControls(side, {
            signBits: desc.signBits,
            exponentBits: desc.exponentBits,
            mantissaBits: desc.mantissaBits,
            hasInfinity: desc.hasInfinity,
            hasNaN: desc.hasNaN,
            hasSubnormals: desc.hasSubnormals !== false,
        });
    }
    updateFormatControlsVisibility(side, isInteger);
    updateSideFormat(side);
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

// Load a named preset into a side's controls. The button highlight follows
// from the format it builds (see updateActiveFormatPreset()).
function loadPreset(side, formatKey) {
    if (!Object.prototype.hasOwnProperty.call(FORMATS, formatKey)) return;
    const format = FORMATS[formatKey];

    if (format.isInteger) {
        setFormatControls(side, integerControls(format.bits, format.fractionBits));
        setSideIntegerKey(side, formatKey);
    } else {
        setFormatControls(side, {
            signBits: format.sign,
            exponentBits: format.exponent,
            mantissaBits: format.mantissa,
            hasInfinity: format.hasInfinity !== false,
            hasNaN: format.hasNaN !== false,
            hasSubnormals: format.hasSubnormals !== false,
        });
        setSideIntegerKey(side, null);
    }
    updateFormatControlsVisibility(side, !!format.isInteger);
    updateSideFormat(side);
}

function loadInputPreset(formatKey) {
    loadPreset('input', formatKey);
}

function loadOutputPreset(formatKey) {
    loadPreset('output', formatKey);
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

// Build a side's format from its controls and refresh everything that shows
// it. A blank or unparseable width keeps the side's last one rather than
// jumping to some default while the user retypes it.
//
// There is no bias control: every layout takes the default bias, which every
// float preset also uses (tests/ui.test.js holds the presets to that).
function updateSideFormat(side) {
    const control = (name) => document.getElementById(`${side}-${name}`);
    const previous = sideFormat(side);
    const intKey = sideIntegerKey(side);
    const intPreset = intKey && FORMATS[intKey] && FORMATS[intKey].isInteger ? FORMATS[intKey] : null;

    let format;
    if (intPreset) {
        // The width comes from the controls and the signedness from the
        // preset. Integer widths are clamped to [1, 64] (the
        // Integer/resolveFormat/URL range) rather than the float mantissa's
        // [0, 112].
        const bits = clampFieldInt(control('mantissa-bits').value, 1, 64,
            previous.isInteger ? previous.bits : intPreset.bits);
        const fractionBits = clampFieldInt(control('fraction-bits').value, 0, bits - 1,
            Math.min(previous.isInteger ? previous.fractionBits : 0, bits - 1));
        // Symmetry is a property of the NAMED preset, not of a bit width, and
        // the custom integer URL grammar (i{bits}q{frac}) has no slot for it.
        // Keeping it once the user edits the shape would produce a live format
        // whose range the generated link cannot reproduce, so it is dropped the
        // moment the visible shape stops matching the preset exactly.
        const matchesPresetShape =
            bits === intPreset.bits && fractionBits === (intPreset.fractionBits || 0);
        format = new Integer(bits, intPreset.signed, {
            fractionBits,
            symmetric: intPreset.symmetric && matchesPresetShape,
        });
    } else {
        setSideIntegerKey(side, null);
        const hasInfinity = control('has-infinity').checked;
        format = new FloatingPoint(
            control('sign-bits').checked ? 1 : 0,
            clampFieldInt(control('exponent-bits').value, 0, 15, previous.exponentBits),
            clampFieldInt(control('mantissa-bits').value, 0, 112, Math.min(previous.mantissaBits, 112)),
            {
                hasInfinity,
                // NaN is the user's choice only without an Infinity (see
                // lockDecidedFlags()); with one the constructor decides it,
                // and the locked box may still hold a choice it refuses.
                hasNaN: hasInfinity ? undefined : control('has-nan').checked,
                hasSubnormals: control('has-subnormals').checked,
            });
        lockDecidedFlags(side, format);
    }
    setSideFormat(side, format);

    control('total-bits').textContent = format.totalBits;
    updateActiveFormatPreset(side);
    updateOverflowModeUi();
    if (side === 'input') {
        updateValuePresetButtons();
        updateValue();
    } else {
        updateOutput();
    }
}

function updateFormat() {
    updateSideFormat('input');
}

function updateOutputFormat() {
    updateSideFormat('output');
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
    renderBits('input', currentEncoded);
}

// Draw a side's bits: checkboxes the user can toggle on the input, read-only
// cells on the output. An integer is one contiguous field shown under the
// mantissa; a float splits its binary string at the field widths.
function renderBits(side, encoded) {
    const format = sideFormat(side);
    const binary = format.toBinaryString(encoded.sign, encoded.exponent, encoded.mantissa);
    const signWidth = format.isInteger ? 0 : format.signBits;
    const exponentWidth = format.isInteger ? 0 : format.exponentBits;
    const fields = {
        sign: binary.slice(0, signWidth),
        exponent: binary.slice(signWidth, signWidth + exponentWidth),
        mantissa: binary.slice(signWidth + exponentWidth),
    };
    for (const section of ['sign', 'exponent']) {
        document.getElementById(bitContainerId(side, section)).closest('.bit-section-container')
            .style.display = format.isInteger ? 'none' : '';
    }
    for (const section of ['sign', 'exponent', 'mantissa']) {
        renderBitSection(side, section, fields[section]);
    }
}

function bitContainerId(side, section) {
    return `${side}-binary-${section}-${side === 'input' ? 'checks' : 'values'}`;
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

function renderBitSection(side, section, binaryString) {
    const bitsContainer = document.getElementById(bitContainerId(side, section));
    const positionsContainer = document.getElementById(`${side}-binary-${section}-positions`);
    bitsContainer.innerHTML = '';
    positionsContainer.innerHTML = '';
    // An empty field (no sign bit, no exponent, an integer's sign and
    // exponent) draws nothing.
    if (binaryString === '') return;

    const startPosition = calculateBitStartPosition(sideFormat(side), section);
    for (let i = 0; i < binaryString.length; i++) {
        const isSet = binaryString[i] === '1';
        let bit;
        if (side === 'input') {
            bit = document.createElement('input');
            bit.type = 'checkbox';
            bit.className = 'bit';
            bit.id = `input-binary-${section}-bit-${i}`;
            bit.checked = isSet;
            bit.dataset.section = section;
            bit.dataset.index = String(i);
            bit.autocomplete = 'off';
            bit.addEventListener('change', handleBinaryCheckboxChange);
        } else {
            bit = document.createElement('div');
            bit.className = isSet ? 'bit checked' : 'bit';
            bit.textContent = binaryString[i];
        }
        bitsContainer.appendChild(bit);

        const position = document.createElement('div');
        position.className = 'bit-position';
        position.textContent = startPosition - i;
        positionsContainer.appendChild(position);
    }
}

function handleBinaryCheckboxChange(e) {
    const section = e.target.dataset.section;

    // Every checkbox of this section, most significant first.
    const checkboxes = document.querySelectorAll(`#${bitContainerId('input', section)} input.bit`);
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

function updateComponentsDisplay(format, encoded, idPrefix) {
    const { sign, exponent, mantissa } = encoded;

    document.getElementById(`${idPrefix}-comp-sign`).textContent =
        format.signBits ? sign : 'N/A';
    document.getElementById(`${idPrefix}-comp-exp-biased`).textContent = exponent;
    document.getElementById(`${idPrefix}-comp-exp-actual`).textContent =
        format.exponentText(exponent, mantissa);
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

    renderBits('output', outputEncoded);

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

// Initialize with FP16 input and BF16 output presets
loadInputPreset('fp16');
loadOutputPreset('bf16');

// Export for Node.js (testing). The browser loads this file as a plain script,
// so this block is inert there.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        clampFieldInt,
        updateFormatControlsVisibility,
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
        mantissaDecimalText,
        calculateBitStartPosition,
        getPresetValue,
        getPresetEncoding,
        encodingHoldsValue,
    };
}
