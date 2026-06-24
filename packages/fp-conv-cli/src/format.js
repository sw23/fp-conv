// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

// Human-readable terminal renderers for the plain objects returned by
// commands.js. Output is deliberately plain ASCII (no ANSI colors) so it is
// identical and clean across Windows, macOS, and Linux terminals, pipes, and
// redirected files. Use the --json flag for machine-readable output instead.

/**
 * Pad a label to a fixed width for column alignment.
 * @param {string} label
 * @returns {string}
 */
function pad(label) {
    return (label + ":").padEnd(11, " ");
}

/**
 * Split a flat binary string into sign / exponent / mantissa groups for
 * floating-point formats. Integer formats are returned unchanged.
 * @param {object} stats
 * @returns {string}
 */
function groupBinary(stats) {
    if (stats.signBits === undefined) {
        return stats.binary; // integer format: no field boundaries
    }
    const bits = stats.binary;
    const parts = [];
    let i = 0;
    if (stats.signBits) {
        parts.push(bits.slice(0, stats.signBits));
        i = stats.signBits;
    }
    if (stats.exponentBits) {
        parts.push(bits.slice(i, i + stats.exponentBits));
        i += stats.exponentBits;
    }
    parts.push(bits.slice(i));
    return parts.join(" ");
}

/**
 * Render an encoded/decoded value's statistics block.
 * @param {object} stats
 * @returns {string}
 */
export function renderStats(stats) {
    const lines = [];
    lines.push(`${pad("Value")}${stats.actualValue}`);
    lines.push(`${pad("Type")}${stats.type}`);
    lines.push(`${pad("Binary")}${groupBinary(stats)}`);
    lines.push(`${pad("Hex")}${stats.hex}`);

    if (stats.signBits === undefined) {
        // Integer format
        const signedness = stats.signed ? "signed" : "unsigned";
        lines.push(`${pad("Bits")}${stats.totalBits} total (${signedness})`);
    } else {
        lines.push(`${pad("Sign")}${stats.sign}`);
        lines.push(
            `${pad("Exponent")}${stats.exponentBiased} (biased) / ${stats.exponentActual} (actual)`
        );
        lines.push(`${pad("Mantissa")}${stats.mantissaDecimal}`);
        lines.push(
            `${pad("Bits")}${stats.totalBits} total \u2014 ${stats.signBits} sign, ` +
                `${stats.exponentBits} exponent, ${stats.mantissaBits} mantissa (bias ${stats.bias})`
        );
    }

    return lines.join("\n");
}

/**
 * Render a format-to-format conversion result.
 * @param {object} result - { input, output, precisionLoss }
 * @param {{from: string, to: string}} labels
 * @returns {string}
 */
export function renderConvert(result, labels) {
    const sections = [];
    sections.push(`Input (${labels.from}):`);
    sections.push(indent(renderStats(result.input)));
    sections.push("");
    sections.push(`Output (${labels.to}):`);
    sections.push(indent(renderStats(result.output)));
    sections.push("");

    const loss = result.precisionLoss;
    sections.push("Precision loss:");
    sections.push(`  ${pad("Lossless")}${loss.lossless ? "yes" : "no"}`);
    sections.push(`  ${pad("Absolute")}${loss.absolute}`);
    sections.push(`  ${pad("Relative")}${loss.relativePercent}%`);

    return sections.join("\n");
}

/**
 * Render detailed format information.
 * @param {object} info
 * @param {{format: string}} labels
 * @returns {string}
 */
export function renderInfo(info, labels) {
    const lines = [];
    lines.push(`Format:    ${labels.format}`);
    lines.push(`Type:      ${info.type}`);
    lines.push(`Bits:      ${info.totalBits}`);

    if (info.type === "integer") {
        lines.push(`Signed:    ${info.signed}`);
        lines.push(`Range:     ${info.minValue} .. ${info.maxValue}`);
    } else {
        lines.push(
            `Layout:    ${info.signBits} sign, ${info.exponentBits} exponent, ` +
                `${info.mantissaBits} mantissa (bias ${info.bias})`
        );
        lines.push(`Infinity:  ${info.hasInfinity}`);
        lines.push(`NaN:       ${info.hasNaN}`);
        if (info.maxNormal !== undefined) {
            lines.push(`Max normal:    ${info.maxNormal}`);
            lines.push(`Min normal:    ${info.minNormal}`);
        }
        if (info.maxSubnormal !== undefined) {
            lines.push(`Max subnormal: ${info.maxSubnormal}`);
            lines.push(`Min subnormal: ${info.minSubnormal}`);
        }
        if (info.maxValue !== undefined) {
            lines.push(`Range:         ${info.minValue} .. ${info.maxValue}`);
        }
    }

    return lines.join("\n");
}

/**
 * Render the list of available preset formats grouped by category.
 * @param {Array<object>} formats
 * @returns {string}
 */
export function renderList(formats) {
    const byCategory = new Map();
    for (const f of formats) {
        if (!byCategory.has(f.category)) {
            byCategory.set(f.category, []);
        }
        byCategory.get(f.category).push(f);
    }

    const lines = [];
    for (const [category, items] of byCategory) {
        lines.push(`${category}:`);
        for (const f of items) {
            const layout = f.isInteger
                ? `${f.bits}-bit ${f.signed ? "signed" : "unsigned"}`
                : `${f.totalBits}-bit (${f.exponentBits}e${f.mantissaBits}m)`;
            lines.push(`  ${f.key.padEnd(11, " ")}${f.name} \u2014 ${layout}`);
        }
        lines.push("");
    }

    return lines.join("\n").trimEnd();
}

/**
 * Indent a multi-line block by two spaces.
 * @param {string} text
 * @returns {string}
 */
function indent(text) {
    return text
        .split("\n")
        .map((line) => (line ? `  ${line}` : line))
        .join("\n");
}
