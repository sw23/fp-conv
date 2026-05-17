// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS */
// Shared JavaScript for format documentation pages.
// Requires floating-point.js to be loaded first.

// In Node.js (testing), import from the library; in browser, rely on globals.
let _FloatingPoint, _Integer, _FORMATS;
if (typeof require !== 'undefined') {
    const lib = require('../lib/floating-point.js');
    _FloatingPoint = lib.FloatingPoint;
    _Integer = lib.Integer;
    _FORMATS = lib.FORMATS;
} else {
    /* istanbul ignore next */
    _FloatingPoint = FloatingPoint;
    /* istanbul ignore next */
    _Integer = Integer;
    /* istanbul ignore next */
    _FORMATS = FORMATS;
}

// ── Format metadata for navigation and pages ─────────────────
const FORMAT_PAGES = {
    // IEEE 754
    fp64:         { file: 'fp64.html',      label: 'FP64',      group: 'ieee' },
    fp32:         { file: 'fp32.html',      label: 'FP32',      group: 'ieee' },
    fp16:         { file: 'fp16.html',      label: 'FP16',      group: 'ieee' },
    // ML
    bf16:         { file: 'bf16.html',      label: 'BF16',      group: 'ml' },
    tf32:         { file: 'tf32.html',      label: 'TF32',      group: 'ml' },
    // OCP
    fp8_e5m2:     { file: 'fp8-e5m2.html',  label: 'FP8 E5M2',  group: 'ocp' },
    fp8_e4m3:     { file: 'fp8-e4m3.html',  label: 'FP8 E4M3',  group: 'ocp' },
    fp6_e3m2:     { file: 'fp6-e3m2.html',  label: 'FP6 E3M2',  group: 'ocp' },
    fp6_e2m3:     { file: 'fp6-e2m3.html',  label: 'FP6 E2M3',  group: 'ocp' },
    fp4_e2m1:     { file: 'fp4-e2m1.html',  label: 'FP4 E2M1',  group: 'ocp' },
    // Integer
    int32:        { file: 'int32.html',     label: 'INT32',     group: 'int' },
    uint32:       { file: 'uint32.html',    label: 'UINT32',    group: 'int' },
    int16:        { file: 'int16.html',     label: 'INT16',     group: 'int' },
    uint16:       { file: 'uint16.html',    label: 'UINT16',    group: 'int' },
    int8:         { file: 'int8.html',      label: 'INT8',      group: 'int' },
    uint8:        { file: 'uint8.html',     label: 'UINT8',     group: 'int' },
    int4:         { file: 'int4.html',      label: 'INT4',      group: 'int' },
    uint4:        { file: 'uint4.html',     label: 'UINT4',     group: 'int' },
};

const GROUP_LABELS = {
    ieee: 'IEEE 754',
    ml:   'ML',
    ocp:  'OCP',
    int:  'Integer',
};

// ── Navigation renderer ──────────────────────────────────────
function renderNav(currentKey) {
    const nav = document.getElementById('format-nav');
    if (!nav) return;

    let html = '<a class="back-link" href="../index.html">← Back to Converter</a>';
    html += '<div class="nav-groups">';

    const groups = {};
    for (const [key, info] of Object.entries(FORMAT_PAGES)) {
        if (!groups[info.group]) groups[info.group] = [];
        groups[info.group].push({ key, ...info });
    }

    let first = true;
    for (const [groupId, items] of Object.entries(groups)) {
        if (!first) html += '<div class="nav-separator"></div>';
        first = false;
        html += `<div class="nav-group">`;
        html += `<span class="nav-group-label">${GROUP_LABELS[groupId]}:</span>`;
        for (const item of items) {
            const active = item.key === currentKey ? ' active' : '';
            html += `<a class="nav-link${active}" href="${item.file}">${item.label}</a>`;
        }
        html += '</div>';
    }

    html += '</div>';
    nav.innerHTML = html;
}

// ── Bit layout diagram renderer ──────────────────────────────
function renderBitLayout(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const fields = [];

    if (config.isInteger) {
        // Integer: show sign bit separately for signed, then value bits
        if (config.signed) {
            fields.push({ label: 'Sign', bits: 1, cls: 'sign' });
            fields.push({ label: 'Value', bits: config.totalBits - 1, cls: 'integer' });
        } else {
            fields.push({ label: 'Value', bits: config.totalBits, cls: 'integer' });
        }
    } else {
        if (config.signBits) fields.push({ label: 'Sign', bits: 1, cls: 'sign' });
        if (config.exponentBits) fields.push({ label: 'Exponent', bits: config.exponentBits, cls: 'exponent' });
        if (config.mantissaBits) fields.push({ label: 'Mantissa', bits: config.mantissaBits, cls: 'mantissa' });
    }

    let html = '';
    for (const field of fields) {
        // Use collapsed view for fields > 16 bits
        if (field.bits > 16) {
            html += `<div class="bit-field-collapsed ${field.cls}">`;
            html += `<span class="bit-field-label">${field.label}</span>`;
            html += `<div class="collapsed-box">${field.bits} bits</div>`;
            html += `<span class="bit-field-width">${field.bits} bits</span>`;
            html += '</div>';
        } else {
            html += `<div class="bit-field ${field.cls}">`;
            html += `<span class="bit-field-label">${field.label}</span>`;
            html += '<div class="bit-field-boxes">';
            for (let i = 0; i < field.bits; i++) {
                html += `<div class="bit-box">${field.label === 'Sign' ? 'S' : (field.label === 'Exponent' ? 'E' : (field.label === 'Mantissa' ? 'M' : 'V'))}</div>`;
            }
            html += '</div>';
            html += `<span class="bit-field-width">${field.bits} bit${field.bits > 1 ? 's' : ''}</span>`;
            html += '</div>';
        }
    }

    container.innerHTML = html;
}

// ── Dynamic range table renderer ─────────────────────────────
function formatValue(val) {
    if (val === Infinity) return '+Infinity';
    if (val === -Infinity) return '-Infinity';
    if (isNaN(val)) return 'NaN';
    if (Object.is(val, -0)) return '-0';

    const abs = Math.abs(val);
    if (abs === 0) return '0';

    // Very large or very small: use scientific notation
    if (abs >= 1e10 || (abs < 1e-4 && abs > 0)) {
        // Use toPrecision for clean output
        const str = val.toPrecision(10).replace(/\.?0+e/, 'e').replace(/\.?0+$/, '');
        return str;
    }

    // Normal range
    const str = val.toPrecision(10).replace(/\.?0+$/, '');
    return str;
}

function renderRangeTable(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (config.isInteger) {
        const fmt = config.signed
            ? new _Integer(config.totalBits, true)
            : new _Integer(config.totalBits, false);
        const fmtU = config.signed
            ? new _Integer(config.totalBits, false)
            : null;

        let html = '<table class="info-table">';
        html += '<tr><th>Property</th>';
        if (config.signed) {
            html += `<th>Signed (INT${config.totalBits})</th><th>Unsigned (UINT${config.totalBits})</th>`;
        } else {
            html += `<th>Value</th>`;
        }
        html += '</tr>';

        const rows = config.signed ? [
            ['Total Bits', config.totalBits, config.totalBits],
            ['Minimum Value', fmt.minValue, fmtU.minValue],
            ['Maximum Value', fmt.maxValue, fmtU.maxValue],
            ['Representable Values', Math.pow(2, config.totalBits), Math.pow(2, config.totalBits)],
        ] : [
            ['Total Bits', config.totalBits],
            ['Minimum Value', fmt.minValue],
            ['Maximum Value', fmt.maxValue],
            ['Representable Values', Math.pow(2, config.totalBits)],
        ];

        for (const row of rows) {
            html += '<tr>';
            html += `<td class="text-cell">${row[0]}</td>`;
            for (let i = 1; i < row.length; i++) {
                html += `<td>${typeof row[i] === 'number' ? row[i].toLocaleString() : row[i]}</td>`;
            }
            html += '</tr>';
        }
        html += '</table>';
        container.innerHTML = html;
        return;
    }

    // Floating-point format
    const fp = new _FloatingPoint(config.signBits, config.exponentBits, config.mantissaBits, {
        bias: config.bias,
        hasInfinity: config.hasInfinity,
        hasNaN: config.hasNaN,
    });

    const maxNorm = fp.getMaxNormal(false);
    const maxNormVal = fp.decode(maxNorm.sign, maxNorm.exponent, maxNorm.mantissa);

    const minNormVal = fp.decode(0, 1, 0);

    const maxSubMant = fp.mantissaBits > 0 ? Math.pow(2, fp.mantissaBits) - 1 : 0;
    const maxSubVal = fp.decode(0, 0, maxSubMant);

    const minSubVal = fp.mantissaBits > 0 ? fp.decode(0, 0, 1) : 0;

    const epsilon = fp.mantissaBits > 0 ? Math.pow(2, -fp.mantissaBits) : 1;

    const decimalDigits = fp.mantissaBits > 0
        ? Math.floor(fp.mantissaBits * Math.log10(2) * 10) / 10
        : 0;

    // Count representable values
    const totalBitPatterns = Math.pow(2, fp.totalBits);

    const rows = [
        ['Max Positive (Normal)', formatValue(maxNormVal)],
        ['Min Positive (Normal)', formatValue(minNormVal)],
        ['Max Subnormal', formatValue(maxSubVal)],
        ['Min Positive (Subnormal)', formatValue(minSubVal)],
        ['Machine Epsilon (at 1.0)', formatValue(epsilon)],
        ['Approx. Decimal Digits', '~' + decimalDigits.toFixed(1)],
        ['Exponent Bias', fp.bias.toString()],
        ['Exponent Range', `2^${1 - fp.bias} to 2^${fp.maxExponent - (fp.hasInfinity ? 1 : 0) - fp.bias}`],
        ['Total Bit Patterns', totalBitPatterns.toLocaleString()],
        ['Supports Infinity', fp.hasInfinity ? 'Yes' : 'No'],
        ['Supports NaN', fp.hasNaN ? 'Yes' : 'No'],
    ];

    let html = '<table class="info-table">';
    html += '<tr><th>Property</th><th>Value</th></tr>';
    for (const [label, value] of rows) {
        html += `<tr><td class="text-cell">${label}</td><td>${value}</td></tr>`;
    }
    html += '</table>';
    container.innerHTML = html;
}

// ── Special values table renderer ────────────────────────────
function renderSpecialValues(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (config.isInteger) {
        renderIntegerSpecialValues(container, config);
        return;
    }

    const fp = new _FloatingPoint(config.signBits, config.exponentBits, config.mantissaBits, {
        bias: config.bias,
        hasInfinity: config.hasInfinity,
        hasNaN: config.hasNaN,
    });

    const entries = [];

    // +0
    entries.push({ name: '+0', sign: 0, exp: 0, mant: 0 });

    // -0
    if (fp.signBits) {
        entries.push({ name: '-0', sign: 1, exp: 0, mant: 0 });
    }

    // Min subnormal
    if (fp.mantissaBits > 0) {
        entries.push({ name: 'Min Subnormal', sign: 0, exp: 0, mant: 1 });
    }

    // Max subnormal
    if (fp.mantissaBits > 0) {
        const maxSub = Math.pow(2, fp.mantissaBits) - 1;
        entries.push({ name: 'Max Subnormal', sign: 0, exp: 0, mant: maxSub });
    }

    // Min normal
    entries.push({ name: 'Min Normal', sign: 0, exp: 1, mant: 0 });

    // Max normal
    const maxN = fp.getMaxNormal(false);
    entries.push({ name: 'Max Normal', sign: 0, exp: maxN.exponent, mant: maxN.mantissa });

    // Infinity
    if (fp.hasInfinity) {
        entries.push({ name: '+Infinity', sign: 0, exp: fp.maxExponent, mant: 0 });
        if (fp.signBits) {
            entries.push({ name: '-Infinity', sign: 1, exp: fp.maxExponent, mant: 0 });
        }
    }

    // NaN
    if (fp.hasNaN) {
        const nan = fp.getNaN();
        entries.push({ name: 'NaN', sign: 0, exp: nan.exponent, mant: nan.mantissa });
    }

    let html = '<table class="info-table special-table">';
    html += '<tr><th>Value</th><th>Bit Pattern</th><th>Decimal</th></tr>';

    for (const entry of entries) {
        const signStr = fp.signBits ? entry.sign.toString() : '';
        const expStr = entry.exp.toString(2).padStart(fp.exponentBits, '0');
        const mantStr = entry.mant.toString(2).padStart(fp.mantissaBits, '0');

        const bitPattern = `<span class="sign-bits">${signStr}</span>` +
            (signStr && expStr ? ' ' : '') +
            `<span class="exp-bits">${expStr}</span>` +
            (expStr && mantStr ? ' ' : '') +
            `<span class="mant-bits">${mantStr}</span>`;

        const decoded = fp.decode(entry.sign, entry.exp, entry.mant);

        html += `<tr>`;
        html += `<td class="text-cell">${entry.name}</td>`;
        html += `<td class="bit-pattern">${bitPattern}</td>`;
        html += `<td>${formatValue(decoded)}</td>`;
        html += '</tr>';
    }

    html += '</table>';
    container.innerHTML = html;
}

function renderIntegerSpecialValues(container, config) {
    const fmtS = new _Integer(config.totalBits, true);
    const fmtU = new _Integer(config.totalBits, false);

    const entries = [
        { name: 'Zero', raw: 0 },
        { name: 'One', raw: 1 },
        { name: 'Max Unsigned', raw: Math.pow(2, config.totalBits) - 1 },
    ];
    if (config.totalBits > 1) {
        entries.push({ name: 'Max Signed', raw: Math.pow(2, config.totalBits - 1) - 1 });
        entries.push({ name: 'Min Signed (-1)', raw: Math.pow(2, config.totalBits) - 1 });
        entries.push({ name: `Min Signed (-${Math.pow(2, config.totalBits - 1)})`, raw: Math.pow(2, config.totalBits - 1) });
    }

    let html = '<table class="info-table special-table">';
    html += `<tr><th>Value</th><th>Bit Pattern</th><th>Signed</th><th>Unsigned</th></tr>`;

    for (const entry of entries) {
        const bits = entry.raw.toString(2).padStart(config.totalBits, '0');
        const signedVal = fmtS.decode(0, 0, entry.raw);
        const unsignedVal = fmtU.decode(0, 0, entry.raw);

        html += '<tr>';
        html += `<td class="text-cell">${entry.name}</td>`;
        html += `<td class="bit-pattern"><span class="exp-bits">${bits}</span></td>`;
        html += `<td>${signedVal}</td>`;
        html += `<td>${unsignedVal}</td>`;
        html += '</tr>';
    }

    html += '</table>';
    container.innerHTML = html;
}

// ── Comparison table renderer ────────────────────────────────
function renderComparisonTable(containerId, currentKey, compareKeys) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const allKeys = [currentKey, ...compareKeys];
    const allConfigs = allKeys.map(key => {
        const fmt = _FORMATS[key + '_ocp'] || _FORMATS[key] || _FORMATS[key.replace('-', '_')];
        return { key, fmt };
    });

    let html = '<div class="comparison-table"><table class="info-table">';
    html += '<tr><th>Property</th>';
    for (const { key } of allConfigs) {
        const page = FORMAT_PAGES[key];
        const cls = key === currentKey ? ' class="current-format"' : '';
        html += `<th${cls}>${page ? page.label : key}</th>`;
    }
    html += '</tr>';

    // Rows: total bits, sign, exponent, mantissa, bias, max value, min normal, epsilon, decimal digits
    const rows = [];
    const fpInstances = allConfigs.map(({ fmt }) => {
        if (fmt.isInteger) return null;
        return new _FloatingPoint(fmt.sign, fmt.exponent, fmt.mantissa, {
            bias: fmt.bias,
            hasInfinity: fmt.hasInfinity,
            hasNaN: fmt.hasNaN,
        });
    });

    const isAllFloat = fpInstances.every(fp => fp !== null);
    const isAllInt = fpInstances.every(fp => fp === null);

    if (isAllFloat) {
        rows.push(['Total Bits', ...fpInstances.map(fp => fp.totalBits)]);
        rows.push(['Sign Bits', ...fpInstances.map(fp => fp.signBits)]);
        rows.push(['Exponent Bits', ...fpInstances.map(fp => fp.exponentBits)]);
        rows.push(['Mantissa Bits', ...fpInstances.map(fp => fp.mantissaBits)]);
        rows.push(['Bias', ...fpInstances.map(fp => fp.bias)]);
        rows.push(['Max Value', ...fpInstances.map(fp => {
            const m = fp.getMaxNormal(false);
            return formatValue(fp.decode(m.sign, m.exponent, m.mantissa));
        })]);
        rows.push(['Min Normal', ...fpInstances.map(fp => formatValue(fp.decode(0, 1, 0)))]);
        rows.push(['Epsilon', ...fpInstances.map(fp => formatValue(Math.pow(2, -fp.mantissaBits)))]);
        rows.push(['~Decimal Digits', ...fpInstances.map(fp => '~' + (fp.mantissaBits * Math.log10(2)).toFixed(1))]);
        rows.push(['Has Infinity', ...fpInstances.map(fp => fp.hasInfinity ? 'Yes' : 'No')]);
        rows.push(['Has NaN', ...fpInstances.map(fp => fp.hasNaN ? 'Yes' : 'No')]);
    } else if (isAllInt) {
        const intInstances = allConfigs.map(({ fmt }) => ({
            s: new _Integer(fmt.bits, true),
            u: new _Integer(fmt.bits, false),
            bits: fmt.bits,
        }));
        rows.push(['Total Bits', ...intInstances.map(i => i.bits)]);
        rows.push(['Signed Min', ...intInstances.map(i => i.s.minValue.toLocaleString())]);
        rows.push(['Signed Max', ...intInstances.map(i => i.s.maxValue.toLocaleString())]);
        rows.push(['Unsigned Max', ...intInstances.map(i => i.u.maxValue.toLocaleString())]);
        rows.push(['Values', ...intInstances.map(i => Math.pow(2, i.bits).toLocaleString())]);
    }

    for (const row of rows) {
        html += '<tr>';
        html += `<td class="text-cell">${row[0]}</td>`;
        for (let i = 1; i < row.length; i++) {
            const cls = allKeys[i - 1] === currentKey ? ' class="current-format"' : '';
            html += `<td${cls}>${row[i]}</td>`;
        }
        html += '</tr>';
    }

    html += '</table></div>';
    container.innerHTML = html;
}

// ── Interactive Visualizer ───────────────────────────────────
function initVisualizer(config) {
    const vizContainer = document.getElementById('visualizer');
    if (!vizContainer) return;

    let format;
    let isInteger = false;

    if (config.isInteger) {
        isInteger = true;
        format = new _Integer(config.totalBits, config.signed !== false);
    } else {
        format = new _FloatingPoint(config.signBits, config.exponentBits, config.mantissaBits, {
            bias: config.bias,
            hasInfinity: config.hasInfinity,
            hasNaN: config.hasNaN,
        });
    }

    // State
    let currentSign = 0;
    let currentExponent = 0;
    let currentMantissa = 0;

    // Build the bit display
    const binaryContainer = vizContainer.querySelector('.viz-binary');
    const decimalInput = vizContainer.querySelector('.viz-decimal-input');
    const componentsContainer = vizContainer.querySelector('.viz-components');
    const hexInput = vizContainer.querySelector('#viz-hex');

    if (!binaryContainer) return;

    function buildBits() {
        binaryContainer.innerHTML = '';

        if (isInteger) {
            // Single section for all bits
            const section = document.createElement('div');
            section.className = 'viz-bit-section integer-section';
            const label = document.createElement('div');
            label.className = 'viz-section-label';
            label.textContent = config.signed !== false ? 'Signed Integer' : 'Unsigned Integer';
            section.appendChild(label);

            const bitsDiv = document.createElement('div');
            bitsDiv.className = 'viz-bits';
            for (let i = format.totalBits - 1; i >= 0; i--) {
                const bit = document.createElement('div');
                bit.className = 'viz-bit';
                bit.dataset.index = i;
                bit.dataset.field = 'mantissa'; // integers use mantissa field
                bit.textContent = '0';
                bit.addEventListener('click', () => toggleBit('mantissa', i));
                bitsDiv.appendChild(bit);
            }
            section.appendChild(bitsDiv);
            binaryContainer.appendChild(section);
        } else {
            // Sign section
            if (format.signBits) {
                const section = document.createElement('div');
                section.className = 'viz-bit-section sign-section';
                const label = document.createElement('div');
                label.className = 'viz-section-label';
                label.textContent = 'Sign';
                section.appendChild(label);

                const bitsDiv = document.createElement('div');
                bitsDiv.className = 'viz-bits';
                const bit = document.createElement('div');
                bit.className = 'viz-bit';
                bit.dataset.index = '0';
                bit.dataset.field = 'sign';
                bit.textContent = '0';
                bit.addEventListener('click', () => toggleBit('sign', 0));
                bitsDiv.appendChild(bit);
                section.appendChild(bitsDiv);
                binaryContainer.appendChild(section);
            }

            // Exponent section
            if (format.exponentBits) {
                const section = document.createElement('div');
                section.className = 'viz-bit-section exponent-section';
                const label = document.createElement('div');
                label.className = 'viz-section-label';
                label.textContent = 'Exponent';
                section.appendChild(label);

                const bitsDiv = document.createElement('div');
                bitsDiv.className = 'viz-bits';
                for (let i = format.exponentBits - 1; i >= 0; i--) {
                    const bit = document.createElement('div');
                    bit.className = 'viz-bit';
                    bit.dataset.index = i;
                    bit.dataset.field = 'exponent';
                    bit.textContent = '0';
                    bit.addEventListener('click', () => toggleBit('exponent', i));
                    bitsDiv.appendChild(bit);
                }
                section.appendChild(bitsDiv);
                binaryContainer.appendChild(section);
            }

            // Mantissa section
            if (format.mantissaBits) {
                const section = document.createElement('div');
                section.className = 'viz-bit-section mantissa-section';
                const label = document.createElement('div');
                label.className = 'viz-section-label';
                label.textContent = 'Mantissa';
                section.appendChild(label);

                const bitsDiv = document.createElement('div');
                bitsDiv.className = 'viz-bits';
                for (let i = format.mantissaBits - 1; i >= 0; i--) {
                    const bit = document.createElement('div');
                    bit.className = 'viz-bit';
                    bit.dataset.index = i;
                    bit.dataset.field = 'mantissa';
                    bit.textContent = '0';
                    bit.addEventListener('click', () => toggleBit('mantissa', i));
                    bitsDiv.appendChild(bit);
                }
                section.appendChild(bitsDiv);
                binaryContainer.appendChild(section);
            }
        }
    }

    // Safe bit helpers - JS bitwise ops truncate to 32 bits, which
    // breaks FP64 (52-bit mantissa) and INT32 (bit 31 sign issues).
    function getBit(value, index) {
        return Math.floor(value / Math.pow(2, index)) % 2;
    }
    function flipBit(value, index) {
        const bitVal = Math.pow(2, index);
        return getBit(value, index) ? value - bitVal : value + bitVal;
    }

    function toggleBit(field, index) {
        if (field === 'sign') {
            currentSign = currentSign ? 0 : 1;
        } else if (field === 'exponent') {
            currentExponent = flipBit(currentExponent, index);
        } else {
            currentMantissa = flipBit(currentMantissa, index);
        }
        updateDisplay();
    }

    function updateDisplay() {
        const decoded = format.decode(currentSign, currentExponent, currentMantissa);

        // Update decimal input (without triggering re-encode)
        if (decimalInput && document.activeElement !== decimalInput) {
            decimalInput.value = formatValue(decoded);
        }

        // Update bits display
        if (!isInteger) {
            // Sign bits
            binaryContainer.querySelectorAll('.sign-section .viz-bit').forEach(bit => {
                const val = currentSign;
                bit.textContent = val;
                bit.classList.toggle('checked', val === 1);
            });
            // Exponent bits
            binaryContainer.querySelectorAll('.exponent-section .viz-bit').forEach(bit => {
                const idx = parseInt(bit.dataset.index);
                const val = getBit(currentExponent, idx);
                bit.textContent = val;
                bit.classList.toggle('checked', val === 1);
            });
            // Mantissa bits
            binaryContainer.querySelectorAll('.mantissa-section .viz-bit').forEach(bit => {
                const idx = parseInt(bit.dataset.index);
                const val = getBit(currentMantissa, idx);
                bit.textContent = val;
                bit.classList.toggle('checked', val === 1);
            });
        } else {
            binaryContainer.querySelectorAll('.integer-section .viz-bit').forEach(bit => {
                const idx = parseInt(bit.dataset.index);
                const val = getBit(currentMantissa, idx);
                bit.textContent = val;
                bit.classList.toggle('checked', val === 1);
            });
        }

        // Update hex
        if (hexInput && document.activeElement !== hexInput) {
            hexInput.value = format.toHexString(currentSign, currentExponent, currentMantissa);
        }

        // Update components
        if (componentsContainer && !isInteger) {
            const expActual = currentExponent === 0
                ? 1 - format.bias
                : currentExponent - format.bias;

            const mantDec = currentExponent === 0
                ? (format.mantissaBits > 0 ? currentMantissa / Math.pow(2, format.mantissaBits) : 0)
                : (format.mantissaBits > 0 ? 1 + currentMantissa / Math.pow(2, format.mantissaBits) : 1);

            let type = 'Normal';
            if (currentExponent === 0 && currentMantissa === 0) type = 'Zero';
            else if (currentExponent === 0) type = 'Subnormal';
            else if (currentExponent === format.maxExponent) {
                if (format.hasInfinity && currentMantissa === 0) type = 'Infinity';
                else if (format.hasNaN) {
                    const maxMant = Math.pow(2, format.mantissaBits) - 1;
                    if (format.hasInfinity ? currentMantissa !== 0 : currentMantissa === maxMant) type = 'NaN';
                    else type = 'Normal';
                } else type = 'Normal';
            }

            componentsContainer.innerHTML = `
                <div class="viz-component"><span class="viz-comp-label">Sign:</span> <span class="viz-comp-value">${currentSign} (${currentSign ? '-' : '+'})</span></div>
                <div class="viz-component"><span class="viz-comp-label">Exponent (biased):</span> <span class="viz-comp-value">${currentExponent}</span></div>
                <div class="viz-component"><span class="viz-comp-label">Exponent (actual):</span> <span class="viz-comp-value">${expActual}</span></div>
                <div class="viz-component"><span class="viz-comp-label">Mantissa (decimal):</span> <span class="viz-comp-value">${mantDec}</span></div>
                <div class="viz-component"><span class="viz-comp-label">Type:</span> <span class="viz-comp-value">${type}</span></div>
                <div class="viz-component"><span class="viz-comp-label">Decoded Value:</span> <span class="viz-comp-value">${formatValue(decoded)}</span></div>
            `;
        } else if (componentsContainer && isInteger) {
            const signedFmt = new _Integer(config.totalBits, true);
            const unsignedFmt = new _Integer(config.totalBits, false);
            const signedVal = signedFmt.decode(0, 0, currentMantissa);
            const unsignedVal = unsignedFmt.decode(0, 0, currentMantissa);

            componentsContainer.innerHTML = `
                <div class="viz-component"><span class="viz-comp-label">Signed Value:</span> <span class="viz-comp-value">${signedVal}</span></div>
                <div class="viz-component"><span class="viz-comp-label">Unsigned Value:</span> <span class="viz-comp-value">${unsignedVal}</span></div>
                <div class="viz-component"><span class="viz-comp-label">Raw Bits:</span> <span class="viz-comp-value">${currentMantissa}</span></div>
            `;
        }

        // Sync distribution chart if available
        if (window._vdApi) {
            window._vdApi.setEncoding(currentSign, currentExponent, currentMantissa);
        }

        // Update active preset button highlighting
        updateActivePreset();
    }

    function getPresetEncoding(preset) {
        if (isInteger) {
            switch (preset) {
                case 'zero': return format.encode(0);
                case 'one': return format.encode(1);
                case 'neg-one': return format.encode(-1);
                case 'max': return format.getMaxValue();
                case 'min': return format.getMinValue();
                case 'all-ones': return { sign: 0, exponent: 0, mantissa: Math.pow(2, format.totalBits) - 1 };
                default: return null;
            }
        } else {
            switch (preset) {
                case 'zero': return format.encode(0);
                case 'one': return format.encode(1);
                case 'neg-one': return format.encode(-1);
                case 'max': return format.getMaxNormal(false);
                case 'min-normal': return { sign: 0, exponent: 1, mantissa: 0 };
                case 'min-sub': return { sign: 0, exponent: 0, mantissa: 1 };
                case 'inf': return format.hasInfinity ? format.getInfinity(false) : null;
                case 'nan': return format.hasNaN ? format.getNaN() : null;
                case 'all-ones': return {
                    sign: format.signBits ? 1 : 0,
                    exponent: format.maxExponent,
                    mantissa: Math.pow(2, format.mantissaBits) - 1
                };
                default: return null;
            }
        }
    }

    function updateActivePreset() {
        vizContainer.querySelectorAll('.viz-preset-btn').forEach(btn => {
            const expected = getPresetEncoding(btn.dataset.preset);
            if (expected &&
                currentSign === expected.sign &&
                currentExponent === expected.exponent &&
                currentMantissa === expected.mantissa) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function encodeFromDecimal(str) {
        const val = parseFloat(str);
        if (isNaN(val) && str.toLowerCase() !== 'nan') return;

        const encoded = format.encode(isNaN(val) ? NaN : val);
        currentSign = encoded.sign;
        currentExponent = encoded.exponent;
        currentMantissa = encoded.mantissa;
        updateDisplay();
    }

    function encodeFromHex(str) {
        const hex = str.replace(/^0x/i, '').trim();
        if (!/^[0-9a-f]+$/i.test(hex) || hex.length === 0) return;
        const totalBits = isInteger ? format.totalBits : format.signBits + format.exponentBits + format.mantissaBits;
        const expectedHexLen = Math.ceil(totalBits / 4);
        const padded = hex.padStart(expectedHexLen, '0');
        if (padded.length > expectedHexLen) return;
        let binary = '';
        for (let i = 0; i < padded.length; i++) {
            binary += parseInt(padded[i], 16).toString(2).padStart(4, '0');
        }
        // Trim leading bits if total isn't a multiple of 4
        binary = binary.slice(binary.length - totalBits);

        if (isInteger) {
            currentSign = 0;
            currentExponent = 0;
            currentMantissa = parseInt(binary, 2);
        } else {
            let pos = 0;
            currentSign = format.signBits ? parseInt(binary[pos++], 2) : 0;
            currentExponent = parseInt(binary.substr(pos, format.exponentBits), 2);
            pos += format.exponentBits;
            currentMantissa = parseInt(binary.substr(pos, format.mantissaBits), 2);
        }
        updateDisplay();
    }

    // Decimal input handler
    if (decimalInput) {
        decimalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                encodeFromDecimal(decimalInput.value);
            }
        });
        decimalInput.addEventListener('blur', () => {
            encodeFromDecimal(decimalInput.value);
        });
    }

    // Hex input handler
    if (hexInput) {
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                encodeFromHex(hexInput.value);
            }
        });
        hexInput.addEventListener('blur', () => {
            encodeFromHex(hexInput.value);
        });
    }

    // Preset buttons
    vizContainer.querySelectorAll('.viz-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            let encoded;

            if (isInteger) {
                switch (preset) {
                    case 'zero': encoded = format.encode(0); break;
                    case 'one': encoded = format.encode(1); break;
                    case 'neg-one': encoded = format.encode(-1); break;
                    case 'max': encoded = format.getMaxValue(); break;
                    case 'min': encoded = format.getMinValue(); break;
                    case 'all-ones':
                        currentSign = 0;
                        currentExponent = 0;
                        currentMantissa = Math.pow(2, format.totalBits) - 1;
                        updateDisplay();
                        return;
                    default: return;
                }
            } else {
                switch (preset) {
                    case 'zero': encoded = format.encode(0); break;
                    case 'one': encoded = format.encode(1); break;
                    case 'neg-one': encoded = format.encode(-1); break;
                    case 'max': encoded = format.getMaxNormal(false); break;
                    case 'min-normal': encoded = { sign: 0, exponent: 1, mantissa: 0 }; break;
                    case 'min-sub': encoded = { sign: 0, exponent: 0, mantissa: 1 }; break;
                    case 'inf':
                        if (format.hasInfinity) encoded = format.getInfinity(false);
                        else return;
                        break;
                    case 'nan':
                        if (format.hasNaN) encoded = format.getNaN();
                        else return;
                        break;
                    case 'all-ones':
                        currentSign = format.signBits ? 1 : 0;
                        currentExponent = format.maxExponent;
                        currentMantissa = Math.pow(2, format.mantissaBits) - 1;
                        updateDisplay();
                        return;
                    default: return;
                }
            }

            currentSign = encoded.sign;
            currentExponent = encoded.exponent;
            currentMantissa = encoded.mantissa;
            updateDisplay();
        });
    });

    // Build and initialize
    buildBits();

    // Load initial value
    if (config.initialValue !== undefined) {
        encodeFromDecimal(String(config.initialValue));
    } else {
        updateDisplay();
    }

    // Expose API for cross-component sync
    window._vizApi = {
        setState: function(s, e, m) {
            currentSign = s;
            currentExponent = e;
            currentMantissa = m;
            updateDisplay();
        },
        getState: function() {
            return { sign: currentSign, exponent: currentExponent, mantissa: currentMantissa };
        },
    };
}

// ── Value Distribution Chart ─────────────────────────────────

function generatePositiveValues(fp) {
    const maxExp = fp.maxExponent;
    const mantCount = fp.mantissaBits > 0 ? Math.pow(2, fp.mantissaBits) : 1;
    const totalPositive = (maxExp + 1) * mantCount;
    const MAX_POINTS = 2000;
    const data = [];

    if (totalPositive <= MAX_POINTS) {
        for (let e = 0; e <= maxExp; e++) {
            for (let m = 0; m < mantCount; m++) {
                const val = fp.decode(0, e, m);
                if (val === Infinity || isNaN(val)) continue;
                data.push({
                    globalIndex: e * mantCount + m,
                    exponent: e,
                    mantissa: m,
                    value: val,
                    isSubnormal: e === 0,
                });
            }
        }
    } else {
        // Sample with a dedicated subnormal budget so they're always well-represented
        const subBudget = Math.min(mantCount, Math.max(50, Math.floor(MAX_POINTS * 0.15)));
        const normBudget = MAX_POINTS - subBudget;
        const normExpCount = maxExp; // exponents 1..maxExp
        const perNormExp = Math.max(3, normExpCount > 0 ? Math.floor(normBudget / normExpCount) : 3);

        // Subnormals (exponent 0)
        for (let s = 0; s < subBudget; s++) {
            const m = Math.round(s * (mantCount - 1) / Math.max(1, subBudget - 1));
            const val = fp.decode(0, 0, m);
            if (val === Infinity || isNaN(val)) continue;
            data.push({
                globalIndex: m,
                exponent: 0,
                mantissa: m,
                value: val,
                isSubnormal: true,
            });
        }
        // Normals (exponents 1..maxExp)
        for (let e = 1; e <= maxExp; e++) {
            for (let s = 0; s < perNormExp; s++) {
                const m = Math.round(s * (mantCount - 1) / Math.max(1, perNormExp - 1));
                const val = fp.decode(0, e, m);
                if (val === Infinity || isNaN(val)) continue;
                data.push({
                    globalIndex: e * mantCount + m,
                    exponent: e,
                    mantissa: m,
                    value: val,
                    isSubnormal: false,
                });
            }
        }
    }

    // Compute analytical step sizes (ULP at each exponent)
    for (let i = 0; i < data.length; i++) {
        const e = data[i].exponent;
        if (data[i].value === 0 && data[i].mantissa === 0) {
            // Step from zero to min subnormal
            data[i].step = fp.mantissaBits > 0
                ? Math.pow(2, 1 - fp.bias - fp.mantissaBits)
                : Math.pow(2, 1 - fp.bias);
        } else if (e === 0) {
            // Subnormal step
            data[i].step = Math.pow(2, 1 - fp.bias - fp.mantissaBits);
        } else {
            // Normal step
            data[i].step = Math.pow(2, e - fp.bias - fp.mantissaBits);
        }
    }

    return data;
}

function formatAxisLabel(val) {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1e15) return val.toExponential(0);
    if (abs >= 1e12) {
        const v = val / 1e12;
        return (v === Math.floor(v) ? v.toFixed(0) : v.toFixed(1)) + 'T';
    }
    if (abs >= 1e9) {
        const v = val / 1e9;
        return (v === Math.floor(v) ? v.toFixed(0) : v.toFixed(1)) + 'B';
    }
    if (abs >= 1e6) {
        const v = val / 1e6;
        return (v === Math.floor(v) ? v.toFixed(0) : v.toFixed(1)) + 'M';
    }
    if (abs >= 1e4) return (val / 1e3).toFixed(0) + 'K';
    if (abs >= 1000) return (val / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    if (abs >= 1) {
        const s = val.toPrecision(3);
        return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
    }
    if (abs >= 0.001) {
        const s = val.toPrecision(2);
        return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
    }
    return val.toExponential(0);
}

function computeNiceTicks(maxVal, targetCount) {
    if (maxVal === 0 || !isFinite(maxVal)) return [0];
    const rawStep = maxVal / targetCount;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / magnitude;
    let niceStep;
    if (residual <= 1.5) niceStep = magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    const ticks = [0];
    for (var i = 1; i <= targetCount + 2; i++) {
        var tick = i * niceStep;
        if (!isFinite(tick) || tick > maxVal * 1.05) break;
        ticks.push(tick);
    }
    return ticks;
}

function initValueDistribution(config) {
    const container = document.getElementById(config.valueDistributionId);
    if (!container || config.isInteger) return;

    const fp = new _FloatingPoint(config.signBits, config.exponentBits, config.mantissaBits, {
        bias: config.bias,
        hasInfinity: config.hasInfinity,
        hasNaN: config.hasNaN,
    });

    const data = generatePositiveValues(fp);
    if (data.length < 2) return;

    // Split data into subnormal and normal arrays
    var subData = data.filter(function(d) { return d.isSubnormal; });
    var normData = data.filter(function(d) { return !d.isSubnormal; });
    // Index where normal range starts in the full data array
    var normalStartIdx = subData.length;

    // Find exponent boundary indices within normData
    var normExpBounds = [0];
    for (var i = 1; i < normData.length; i++) {
        if (normData[i].exponent !== normData[i - 1].exponent) {
            normExpBounds.push(i);
        }
    }
    normExpBounds.push(normData.length);

    var mantCount = fp.mantissaBits > 0 ? Math.pow(2, fp.mantissaBits) : 1;

    // Build DOM - two side-by-side charts
    var hasSubnormals = subData.length > 1; // more than just zero
    container.innerHTML =
        '<div class="vd-charts-row">' +
            (hasSubnormals ?
            '<div class="vd-chart-col vd-sub-col">' +
                '<div class="vd-chart-title sub-title">Subnormal Range (Linear)</div>' +
                '<div class="vd-chart-wrap"><canvas class="vd-canvas vd-sub-canvas"></canvas></div>' +
            '</div>' : '') +
            (normData.length > 0 ?
            '<div class="vd-chart-col vd-norm-col">' +
                '<div class="vd-chart-title norm-title">Normal Range (Logarithmic)</div>' +
                '<div class="vd-chart-wrap"><canvas class="vd-canvas vd-norm-canvas"></canvas></div>' +
            '</div>' : '') +
        '</div>' +
        '<div class="vd-slider-row">' +
            '<button class="vd-step-btn" data-dir="-1" aria-label="Previous encoding">\u25C0</button>' +
            '<input type="range" class="vd-slider" min="0" max="1000" value="500" aria-label="Encoding index">' +
            '<button class="vd-step-btn" data-dir="1" aria-label="Next encoding">\u25B6</button>' +
        '</div>' +
        '<div class="vd-readout">' +
            '<div class="vd-readout-item"><span class="vd-readout-label">Value:</span> <span class="vd-readout-value vd-ro-val">0</span></div>' +
            '<div class="vd-readout-item"><span class="vd-readout-label">Exponent:</span> <span class="vd-readout-value vd-ro-exp">0</span></div>' +
            '<div class="vd-readout-item"><span class="vd-readout-label">Type:</span> <span class="vd-readout-value vd-ro-type">Zero</span></div>' +
        '</div>' +
        '<div class="vd-legend">' +
            '<span class="vd-legend-item vd-legend-sub">\u25A0 Subnormal</span>' +
            '<span class="vd-legend-item vd-legend-norm">\u25A0 Normal</span>' +
            '<span class="vd-legend-item vd-legend-cursor">\u25CF Current</span>' +
        '</div>';

    var subCanvas = container.querySelector('.vd-sub-canvas');
    var normCanvas = container.querySelector('.vd-norm-canvas');
    var subCol = container.querySelector('.vd-sub-col');
    var normCol = container.querySelector('.vd-norm-col');
    var slider = container.querySelector('.vd-slider');
    var subCtx = subCanvas ? subCanvas.getContext('2d') : null;
    var normCtx = normCanvas ? normCanvas.getContext('2d') : null;

    var roVal = container.querySelector('.vd-ro-val');
    var roExp = container.querySelector('.vd-ro-exp');
    var roType = container.querySelector('.vd-ro-type');

    var currentIndex = 0;
    var currentSign = 0;
    var syncing = false; // prevent infinite loops in bidirectional sync

    // ── Weighted slider mapping ──
    // Slider covers full signed range: negative (left) → zero (center) → positive (right).
    // Each half mirrors the positive data array with weighted subnormal allocation.
    var SLIDER_MID = 500; // center = zero
    var subFraction = normalStartIdx / data.length; // natural fraction
    // If subnormals are < 25% of data, boost them to 30%; otherwise keep natural ratio
    var halfSubEnd = Math.round(SLIDER_MID * (subFraction < 0.25 && hasSubnormals ? 0.30 : subFraction));

    // Map a half-slider value (0..SLIDER_MID) to a data index
    function halfSliderToIndex(hv) {
        if (!hasSubnormals || normalStartIdx <= 1) return Math.round(hv / SLIDER_MID * (data.length - 1));
        if (hv <= halfSubEnd) {
            return Math.round(hv / halfSubEnd * (normalStartIdx - 1));
        }
        var t = (hv - halfSubEnd - 1) / (SLIDER_MID - halfSubEnd - 1);
        return normalStartIdx + Math.round(t * (data.length - 1 - normalStartIdx));
    }

    // Map a data index to a half-slider value (0..SLIDER_MID)
    function indexToHalfSlider(idx) {
        if (!hasSubnormals || normalStartIdx <= 1) return Math.round(idx / (data.length - 1) * SLIDER_MID);
        if (idx < normalStartIdx) {
            return Math.round(idx / (normalStartIdx - 1) * halfSubEnd);
        }
        var t = (idx - normalStartIdx) / Math.max(1, data.length - 1 - normalStartIdx);
        return halfSubEnd + 1 + Math.round(t * (SLIDER_MID - halfSubEnd - 1));
    }

    function sliderToSignedState(sv) {
        if (sv < SLIDER_MID) {
            // Negative half: slider 0 = max negative, slider MID-1 = negative zero
            var hv = SLIDER_MID - sv; // invert so 0→max, MID→0
            return { sign: 1, index: halfSliderToIndex(hv) };
        }
        // Positive half: slider MID = positive zero, slider MAX = max positive
        return { sign: 0, index: halfSliderToIndex(sv - SLIDER_MID) };
    }

    function signedStateToSlider(sign, idx) {
        var hv = indexToHalfSlider(idx);
        if (sign === 1) {
            return SLIDER_MID - hv; // invert for negative half
        }
        return SLIDER_MID + hv;
    }

    // Apply gradient to slider track: negative (red) | subnormal (green) | normal (gray)
    function updateSliderGradient() {
        var stops = [];
        var subPct = (halfSubEnd / SLIDER_MID * 50).toFixed(1);
        // Negative half (mirrored: normal then subnormal approaching center)
        stops.push('rgba(239,68,68,0.15) 0%');
        stops.push('rgba(239,68,68,0.15) ' + (50 - parseFloat(subPct)).toFixed(1) + '%');
        if (hasSubnormals && halfSubEnd > 0) {
            stops.push('rgba(239,68,68,0.08) ' + (50 - parseFloat(subPct)).toFixed(1) + '%');
            stops.push('rgba(239,68,68,0.08) 50%');
        }
        // Positive half (subnormal then normal)
        if (hasSubnormals && halfSubEnd > 0) {
            stops.push('rgba(16,185,129,0.25) 50%');
            stops.push('rgba(16,185,129,0.25) ' + (50 + parseFloat(subPct)).toFixed(1) + '%');
            stops.push('var(--border) ' + (50 + parseFloat(subPct)).toFixed(1) + '%');
        } else {
            stops.push('var(--border) 50%');
        }
        stops.push('var(--border) 100%');
        slider.style.background = 'linear-gradient(to right, ' + stops.join(', ') + ')';
    }
    updateSliderGradient();

    function updateReadout() {
        var d = data[currentIndex];
        var displayVal = currentSign === 1 && d.value !== 0 ? -d.value : d.value;
        roVal.textContent = formatValue(displayVal);

        var expActual = d.exponent === 0 ? (1 - fp.bias) : (d.exponent - fp.bias);
        roExp.textContent = d.exponent + ' (2^' + expActual + ')';

        var typeStr;
        if (d.value === 0) typeStr = currentSign === 1 ? '\u22120' : 'Zero';
        else if (d.isSubnormal) typeStr = currentSign === 1 ? '\u2212 Subnormal' : 'Subnormal';
        else typeStr = currentSign === 1 ? '\u2212 Normal' : 'Normal';
        roType.textContent = typeStr;

        // Highlight active chart column
        var inSub = currentIndex < normalStartIdx;
        if (subCol) {
            subCol.classList.toggle('vd-active', inSub);
            subCol.classList.toggle('vd-inactive', !inSub);
        }
        if (normCol) {
            normCol.classList.toggle('vd-active', !inSub);
            normCol.classList.toggle('vd-inactive', inSub);
        }
    }

    // Chart geometry
    var MARGIN = { left: 55, right: 12, top: 20, bottom: 26 };
    var CHART_H = 240;
    var FONT = '10px -apple-system, BlinkMacSystemFont, sans-serif';

    // ── Subnormal chart (linear/linear) ──
    function renderSubnormalChart() {
        if (!subCtx || subData.length < 1) return;

        var rect = subCanvas.parentElement.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        var w = rect.width;
        subCanvas.width = w * dpr;
        subCanvas.height = CHART_H * dpr;
        subCanvas.style.height = CHART_H + 'px';
        subCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var pw = w - MARGIN.left - MARGIN.right;
        var ph = CHART_H - MARGIN.top - MARGIN.bottom;

        var maxIdx = subData.length - 1 || 1;
        var maxVal = subData.length > 0 ? subData[subData.length - 1].value : 1;
        if (maxVal === 0) maxVal = 1;

        function xScale(idx) { return MARGIN.left + (idx / maxIdx) * pw; }
        function yScale(v) { return MARGIN.top + ph - (v / maxVal) * ph; }

        subCtx.clearRect(0, 0, w, CHART_H);

        // Background
        subCtx.fillStyle = 'rgba(16, 185, 129, 0.06)';
        subCtx.fillRect(MARGIN.left, MARGIN.top, pw, ph);

        // Y grid
        var yTicks = computeNiceTicks(maxVal, 4);
        subCtx.strokeStyle = '#e2e8f0';
        subCtx.lineWidth = 1;
        for (var ti = 0; ti < yTicks.length; ti++) {
            var y = yScale(yTicks[ti]);
            subCtx.beginPath();
            subCtx.moveTo(MARGIN.left, y);
            subCtx.lineTo(MARGIN.left + pw, y);
            subCtx.stroke();
        }

        // Value line
        subCtx.beginPath();
        subCtx.strokeStyle = '#10b981';
        subCtx.lineWidth = 2;
        for (var i = 0; i < subData.length; i++) {
            var px = xScale(i);
            var py = yScale(subData[i].value);
            if (i === 0) subCtx.moveTo(px, py);
            else subCtx.lineTo(px, py);
        }
        subCtx.stroke();

        // Dots
        var dotR = subData.length <= 32 ? 5 : (subData.length <= 128 ? 3 : 0);
        if (dotR > 0) {
            for (var j = 0; j < subData.length; j++) {
                subCtx.beginPath();
                subCtx.arc(xScale(j), yScale(subData[j].value), dotR, 0, Math.PI * 2);
                subCtx.fillStyle = '#10b981';
                subCtx.fill();
            }
        }

        // Cursor (only if currently in subnormal range)
        if (currentIndex < normalStartIdx) {
            var ci = currentIndex;
            var cx = xScale(ci);
            var cy = yScale(subData[ci].value);
            var cursorColor = currentSign === 1 ? '#f97316' : '#ef4444';
            var cursorAlpha = currentSign === 1 ? '0.4' : '0.4';
            var cursorAlpha2 = currentSign === 1 ? '0.25' : '0.25';

            subCtx.save();
            subCtx.strokeStyle = currentSign === 1 ? 'rgba(249,115,22,' + cursorAlpha + ')' : 'rgba(239, 68, 68, 0.4)';
            subCtx.lineWidth = 1.5;
            subCtx.setLineDash([4, 4]);
            subCtx.beginPath();
            subCtx.moveTo(cx, MARGIN.top);
            subCtx.lineTo(cx, MARGIN.top + ph);
            subCtx.stroke();
            subCtx.strokeStyle = currentSign === 1 ? 'rgba(249,115,22,' + cursorAlpha2 + ')' : 'rgba(239, 68, 68, 0.25)';
            subCtx.beginPath();
            subCtx.moveTo(MARGIN.left, cy);
            subCtx.lineTo(cx, cy);
            subCtx.stroke();
            subCtx.restore();

            subCtx.beginPath();
            subCtx.arc(cx, cy, 6, 0, Math.PI * 2);
            subCtx.fillStyle = cursorColor;
            subCtx.fill();
            subCtx.strokeStyle = '#fff';
            subCtx.lineWidth = 2;
            subCtx.stroke();
        }

        // Y-axis labels
        subCtx.fillStyle = '#64748b';
        subCtx.font = FONT;
        subCtx.textAlign = 'right';
        subCtx.textBaseline = 'middle';
        for (var yi = 0; yi < yTicks.length; yi++) {
            subCtx.fillText(formatAxisLabel(yTicks[yi]), MARGIN.left - 6, yScale(yTicks[yi]));
        }

        // X-axis: mantissa index labels
        subCtx.textAlign = 'center';
        subCtx.textBaseline = 'top';
        var subXTickCount = Math.min(6, Math.floor(pw / 60));
        if (subData.length > 1) {
            var sgiMin = subData[0].globalIndex;
            var sgiMax = subData[maxIdx].globalIndex;
            var sgiRange = sgiMax - sgiMin;
            var sRawStep = sgiRange / Math.max(1, subXTickCount);
            var sMag = Math.pow(10, Math.floor(Math.log10(Math.max(1, sRawStep))));
            var sRes = sRawStep / sMag;
            var sNiceStep;
            if (sRes <= 1.5) sNiceStep = 1 * sMag;
            else if (sRes <= 3.5) sNiceStep = 2 * sMag;
            else if (sRes <= 7.5) sNiceStep = 5 * sMag;
            else sNiceStep = 10 * sMag;
            sNiceStep = Math.max(1, Math.round(sNiceStep));
            var sgiStart = Math.ceil(sgiMin / sNiceStep) * sNiceStep;
            function sgiToX(gi) {
                return MARGIN.left + ((gi - sgiMin) / (sgiRange || 1)) * pw;
            }
            var sDrawn = [];
            function drawSubXTick(gi) {
                var tx = sgiToX(gi);
                for (var dp = 0; dp < sDrawn.length; dp++) {
                    if (Math.abs(tx - sDrawn[dp]) < 35) return;
                }
                sDrawn.push(tx);
                subCtx.fillText(formatAxisLabel(gi), tx, MARGIN.top + ph + 4);
            }
            drawSubXTick(sgiMin);
            for (var sgTick = sgiStart; sgTick <= sgiMax; sgTick += sNiceStep) {
                drawSubXTick(sgTick);
            }
            drawSubXTick(sgiMax);
        }

        // Axes
        subCtx.strokeStyle = '#94a3b8';
        subCtx.lineWidth = 1;
        subCtx.beginPath();
        subCtx.moveTo(MARGIN.left, MARGIN.top);
        subCtx.lineTo(MARGIN.left, MARGIN.top + ph);
        subCtx.lineTo(MARGIN.left + pw, MARGIN.top + ph);
        subCtx.stroke();

        // Y-axis title
        subCtx.save();
        subCtx.fillStyle = '#94a3b8';
        subCtx.font = FONT;
        subCtx.translate(10, MARGIN.top + ph / 2);
        subCtx.rotate(-Math.PI / 2);
        subCtx.textAlign = 'center';
        subCtx.textBaseline = 'middle';
        subCtx.fillText('Value', 0, 0);
        subCtx.restore();
    }

    // ── Normal chart (linear x, log y) ──
    function renderNormalChart() {
        if (!normCtx || normData.length < 1) return;

        var rect = normCanvas.parentElement.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        var w = rect.width;
        normCanvas.width = w * dpr;
        normCanvas.height = CHART_H * dpr;
        normCanvas.style.height = CHART_H + 'px';
        normCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var pw = w - MARGIN.left - MARGIN.right;
        var ph = CHART_H - MARGIN.top - MARGIN.bottom;

        var maxNormIdx = normData.length - 1 || 1;

        // Log scale for y
        var minVal = normData[0].value;
        var maxVal = normData[normData.length - 1].value;
        if (minVal <= 0) minVal = normData.find(function(d) { return d.value > 0; }).value;
        if (maxVal <= 0) maxVal = 1;
        var logMin = Math.log10(minVal);
        var logMax = Math.log10(maxVal);
        var logRange = logMax - logMin || 1;

        function xScale(idx) { return MARGIN.left + (idx / maxNormIdx) * pw; }
        function yLogScale(v) {
            if (v <= 0) return MARGIN.top + ph;
            var logV = Math.log10(v);
            return MARGIN.top + ph - ((logV - logMin) / logRange) * ph;
        }

        normCtx.clearRect(0, 0, w, CHART_H);

        // Solid background
        normCtx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        normCtx.fillRect(MARGIN.left, MARGIN.top, pw, ph);

        // Y-axis gridlines and labels (log scale)
        normCtx.fillStyle = '#64748b';
        normCtx.font = FONT;
        normCtx.textAlign = 'right';
        normCtx.textBaseline = 'middle';
        var startPow = Math.ceil(logMin);
        var endPow = Math.floor(logMax);
        var powStep = Math.max(1, Math.ceil((endPow - startPow + 1) / 6));
        // Minor gridlines (all integer multiples 2–9 per decade)
        // Only draw when decades are few enough for lines to be distinguishable
        var totalDecades = endPow - startPow + 1;
        if (totalDecades <= 12) {
            normCtx.strokeStyle = '#cbd5e1';
            normCtx.lineWidth = 0.75;
            for (var mp = Math.floor(logMin) - 1; mp <= endPow; mp++) {
                for (var mi = 1; mi <= 9; mi++) {
                    var minorVal = mi * Math.pow(10, mp);
                    if (minorVal <= minVal || minorVal >= maxVal) continue;
                    // Skip if this coincides with a displayed major gridline
                    if (mi === 1 && mp >= startPow && mp <= endPow && (mp - startPow) % powStep === 0) continue;
                    var my = yLogScale(minorVal);
                    normCtx.beginPath();
                    normCtx.moveTo(MARGIN.left + 1, my);
                    normCtx.lineTo(MARGIN.left + pw, my);
                normCtx.stroke();
            }
        }
        }

        // Major gridlines and labels (powers of 10)
        var yLabelPositions = [];
        for (var p = startPow; p <= endPow; p += powStep) {
            var tickVal = Math.pow(10, p);
            var ty = yLogScale(tickVal);
            normCtx.strokeStyle = '#94a3b8';
            normCtx.lineWidth = 1;
            normCtx.beginPath();
            normCtx.moveTo(MARGIN.left, ty);
            normCtx.lineTo(MARGIN.left + pw, ty);
            normCtx.stroke();
            normCtx.fillStyle = '#64748b';
            normCtx.fillText(formatAxisLabel(tickVal), MARGIN.left - 6, ty);
            yLabelPositions.push(ty);
        }
        // Always show min and max labels if not already covered by a major tick
        var topTickPow = startPow + Math.floor((endPow - startPow) / powStep) * powStep;
        function yLabelFits(y) {
            for (var lp = 0; lp < yLabelPositions.length; lp++) {
                if (Math.abs(y - yLabelPositions[lp]) < 14) return false;
            }
            return true;
        }
        if (logMin < startPow - 0.1) {
            var minY = yLogScale(minVal);
            if (yLabelFits(minY)) {
                normCtx.fillText(formatAxisLabel(minVal), MARGIN.left - 6, minY);
                yLabelPositions.push(minY);
            }
        }
        if (logMax > topTickPow + 0.1) {
            var maxY = yLogScale(maxVal);
            if (yLabelFits(maxY)) {
                normCtx.fillText(formatAxisLabel(maxVal), MARGIN.left - 6, maxY);
            }
        }

        // Value line
        normCtx.beginPath();
        normCtx.strokeStyle = '#2563eb';
        normCtx.lineWidth = 2;
        for (var i = 0; i < normData.length; i++) {
            var px = xScale(i);
            var py = yLogScale(normData[i].value);
            if (i === 0) normCtx.moveTo(px, py);
            else normCtx.lineTo(px, py);
        }
        normCtx.stroke();

        // Dots for small datasets
        if (normData.length <= 200) {
            var dotR = normData.length <= 64 ? 4 : 2.5;
            for (var j = 0; j < normData.length; j++) {
                normCtx.beginPath();
                normCtx.arc(xScale(j), yLogScale(normData[j].value), dotR, 0, Math.PI * 2);
                normCtx.fillStyle = '#2563eb';
                normCtx.fill();
            }
        }

        // Cursor (only if in normal range)
        if (currentIndex >= normalStartIdx) {
            var ni = currentIndex - normalStartIdx;
            var cx = xScale(ni);
            var cy = yLogScale(normData[ni].value);
            var cursorColor = currentSign === 1 ? '#f97316' : '#ef4444';

            normCtx.save();
            normCtx.strokeStyle = currentSign === 1 ? 'rgba(249,115,22,0.4)' : 'rgba(239, 68, 68, 0.4)';
            normCtx.lineWidth = 1.5;
            normCtx.setLineDash([4, 4]);
            normCtx.beginPath();
            normCtx.moveTo(cx, MARGIN.top);
            normCtx.lineTo(cx, MARGIN.top + ph);
            normCtx.stroke();
            normCtx.strokeStyle = currentSign === 1 ? 'rgba(249,115,22,0.25)' : 'rgba(239, 68, 68, 0.25)';
            normCtx.beginPath();
            normCtx.moveTo(MARGIN.left, cy);
            normCtx.lineTo(cx, cy);
            normCtx.stroke();
            normCtx.restore();

            normCtx.beginPath();
            normCtx.arc(cx, cy, 6, 0, Math.PI * 2);
            normCtx.fillStyle = cursorColor;
            normCtx.fill();
            normCtx.strokeStyle = '#fff';
            normCtx.lineWidth = 2;
            normCtx.stroke();
        }

        // X-axis ticks – pick nice round globalIndex values
        normCtx.fillStyle = '#64748b';
        normCtx.textAlign = 'center';
        normCtx.textBaseline = 'top';
        var xTickCount = Math.min(6, Math.floor(pw / 60));
        var giMin = normData[0].globalIndex;
        var giMax = normData[maxNormIdx].globalIndex;
        var giRange = giMax - giMin;
        var rawStep = giRange / Math.max(1, xTickCount);
        // Round step to a nice number (1, 2, 5 × 10^n)
        var magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
        var residual = rawStep / magnitude;
        var niceStep;
        if (residual <= 1.5) niceStep = 1 * magnitude;
        else if (residual <= 3.5) niceStep = 2 * magnitude;
        else if (residual <= 7.5) niceStep = 5 * magnitude;
        else niceStep = 10 * magnitude;
        niceStep = Math.max(1, Math.round(niceStep));
        var giStart = Math.ceil(giMin / niceStep) * niceStep;
        // Interpolate pixel x from globalIndex value
        function giToX(gi) {
            return MARGIN.left + ((gi - giMin) / (giRange || 1)) * pw;
        }
        var drawnPositions = [];
        function drawNormXTick(gi) {
            var tx = giToX(gi);
            for (var dp = 0; dp < drawnPositions.length; dp++) {
                if (Math.abs(tx - drawnPositions[dp]) < 35) return;
            }
            drawnPositions.push(tx);
            normCtx.fillText(formatAxisLabel(gi), tx, MARGIN.top + ph + 4);
        }
        drawNormXTick(giMin);
        for (var gTick = giStart; gTick <= giMax; gTick += niceStep) {
            drawNormXTick(gTick);
        }
        drawNormXTick(giMax);

        // Axes
        normCtx.strokeStyle = '#94a3b8';
        normCtx.lineWidth = 1;
        normCtx.beginPath();
        normCtx.moveTo(MARGIN.left, MARGIN.top);
        normCtx.lineTo(MARGIN.left, MARGIN.top + ph);
        normCtx.lineTo(MARGIN.left + pw, MARGIN.top + ph);
        normCtx.stroke();

        // Y-axis title
        normCtx.save();
        normCtx.fillStyle = '#94a3b8';
        normCtx.font = FONT;
        normCtx.translate(10, MARGIN.top + ph / 2);
        normCtx.rotate(-Math.PI / 2);
        normCtx.textAlign = 'center';
        normCtx.textBaseline = 'middle';
        normCtx.fillText('Value (log\u2081\u2080)', 0, 0);
        normCtx.restore();
    }

    function render() {
        renderSubnormalChart();
        renderNormalChart();
    }

    // ── Interaction helpers ──

    function findClosestSubIdx(canvasX, canvasWidth) {
        var pw = canvasWidth - MARGIN.left - MARGIN.right;
        var maxIdx = subData.length - 1 || 1;
        var target = ((canvasX - MARGIN.left) / pw) * maxIdx;
        return Math.max(0, Math.min(subData.length - 1, Math.round(target)));
    }

    function findClosestNormIdx(canvasX, canvasWidth) {
        var pw = canvasWidth - MARGIN.left - MARGIN.right;
        var maxIdx = normData.length - 1 || 1;
        var target = ((canvasX - MARGIN.left) / pw) * maxIdx;
        return Math.max(0, Math.min(normData.length - 1, Math.round(target)));
    }

    function setIndex(idx) {
        currentIndex = Math.max(0, Math.min(data.length - 1, idx));
        slider.value = signedStateToSlider(currentSign, currentIndex);
        render();
        updateReadout();
        syncToVisualizer();
    }

    function syncToVisualizer() {
        if (syncing) return;
        syncing = true;
        var d = data[currentIndex];
        if (window._vizApi) {
            window._vizApi.setState(currentSign, d.exponent, d.mantissa);
        }
        syncing = false;
    }

    // Slider
    slider.addEventListener('input', function() {
        var state = sliderToSignedState(parseInt(slider.value));
        currentSign = state.sign;
        currentIndex = state.index;
        render();
        updateReadout();
        syncToVisualizer();
    });

    // Step buttons - step through the full signed encoding space
    container.querySelectorAll('.vd-step-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var dir = parseInt(btn.dataset.dir);
            if (currentSign === 0) {
                // Positive side
                if (dir === -1 && currentIndex === 0) {
                    // Cross from +0 to -0
                    currentSign = 1;
                    currentIndex = 0;
                } else {
                    currentIndex = Math.max(0, Math.min(data.length - 1, currentIndex + dir));
                }
            } else {
                // Negative side: "right" (dir=1) decreases magnitude, "left" (dir=-1) increases
                if (dir === 1 && currentIndex === 0) {
                    // Cross from -0 to +0
                    currentSign = 0;
                    currentIndex = 0;
                } else {
                    // On negative side, right arrow decreases index (toward zero), left increases
                    currentIndex = Math.max(0, Math.min(data.length - 1, currentIndex - dir));
                }
            }
            slider.value = signedStateToSlider(currentSign, currentIndex);
            render();
            updateReadout();
            syncToVisualizer();
        });
    });

    // Canvas click/drag for subnormal chart
    if (subCanvas) {
        subCanvas.addEventListener('click', function(e) {
            var rect = subCanvas.getBoundingClientRect();
            setIndex(findClosestSubIdx(e.clientX - rect.left, rect.width));
        });
        var subDragging = false;
        subCanvas.addEventListener('mousedown', function(e) {
            subDragging = true;
            var rect = subCanvas.getBoundingClientRect();
            setIndex(findClosestSubIdx(e.clientX - rect.left, rect.width));
        });
        subCanvas.addEventListener('mousemove', function(e) {
            if (!subDragging) return;
            var rect = subCanvas.getBoundingClientRect();
            setIndex(findClosestSubIdx(e.clientX - rect.left, rect.width));
        });
        document.addEventListener('mouseup', function() { subDragging = false; });
    }

    // Canvas click/drag for normal chart
    if (normCanvas) {
        normCanvas.addEventListener('click', function(e) {
            var rect = normCanvas.getBoundingClientRect();
            setIndex(normalStartIdx + findClosestNormIdx(e.clientX - rect.left, rect.width));
        });
        var normDragging = false;
        normCanvas.addEventListener('mousedown', function(e) {
            normDragging = true;
            var rect = normCanvas.getBoundingClientRect();
            setIndex(normalStartIdx + findClosestNormIdx(e.clientX - rect.left, rect.width));
        });
        normCanvas.addEventListener('mousemove', function(e) {
            if (!normDragging) return;
            var rect = normCanvas.getBoundingClientRect();
            setIndex(normalStartIdx + findClosestNormIdx(e.clientX - rect.left, rect.width));
        });
        document.addEventListener('mouseup', function() { normDragging = false; });
    }

    // Resize
    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 150);
    });

    // Expose API for bidirectional sync from visualizer
    window._vdApi = {
        setEncoding: function(sign, exp, mant) {
            if (syncing) return;
            syncing = true;
            currentSign = sign;
            // Find closest data point matching (exp, mant)
            var best = 0;
            var bestDist = Infinity;
            for (var i = 0; i < data.length; i++) {
                // Exact match preferred
                if (data[i].exponent === exp && data[i].mantissa === mant) {
                    best = i;
                    break;
                }
                // Nearest by global index
                var gi = exp * mantCount + mant;
                var dist = Math.abs(data[i].globalIndex - gi);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
            currentIndex = best;
            slider.value = signedStateToSlider(currentSign, currentIndex);
            render();
            updateReadout();
            syncing = false;
        },
    };

    // Initial render + sync - start at zero (slider center)
    slider.value = SLIDER_MID;
    render();
    updateReadout();
    syncToVisualizer();
}

// ── Auto-init on DOMContentLoaded ────────────────────────────
// Pages should set window.FORMAT_CONFIG before this script runs,
// or set it and call initPage() manually.
function initPage() {
    const cfg = window.FORMAT_CONFIG;
    if (!cfg) return;

    if (cfg.navKey) renderNav(cfg.navKey);
    if (cfg.bitLayoutId) renderBitLayout(cfg.bitLayoutId, cfg);
    if (cfg.rangeTableId) renderRangeTable(cfg.rangeTableId, cfg);
    if (cfg.specialTableId) renderSpecialValues(cfg.specialTableId, cfg);
    if (cfg.comparisonTableId && cfg.compareWith) {
        renderComparisonTable(cfg.comparisonTableId, cfg.navKey, cfg.compareWith);
    }
    if (cfg.hasVisualizer !== false) initVisualizer(cfg);
    if (cfg.valueDistributionId) initValueDistribution(cfg);
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initPage);
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FORMAT_PAGES,
        GROUP_LABELS,
        renderNav,
        renderBitLayout,
        formatValue,
        renderRangeTable,
        renderSpecialValues,
        renderIntegerSpecialValues,
        renderComparisonTable,
        initVisualizer,
        generatePositiveValues,
        formatAxisLabel,
        computeNiceTicks,
        initValueDistribution,
        initPage,
    };
}
