// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { runEncode, runDecode, runConvert, runInfo, runList } from "../src/commands.js";
import { TARGET_TEXT, renderConvert, renderInfo } from "../src/format.js";
import floatingPoint from "../../../lib/floating-point.js";
import { main } from "../src/index.js";
import { runCli } from "./helpers.js";

describe("command functions", () => {
    test("runEncode returns a stats object", () => {
        const stats = runEncode({ value: "1.5", format: "fp32" });
        expect(stats.actualValue).toBe(1.5);
        expect(stats.hex).toBe("0x3FC00000");
        expect(stats.binary).toMatch(/^[01]+$/);
        expect(stats.totalBits).toBe(32);
    });

    test("runEncode honors a rounding mode", () => {
        const down = runEncode({ value: "1.0009765625", format: "fp16", roundingMode: "towardZero" });
        const up = runEncode({ value: "1.0009765625", format: "fp16", roundingMode: "towardPositive" });
        expect(down.actualValue).toBeLessThanOrEqual(up.actualValue);
    });

    test("runEncode accepts a custom format object", () => {
        const stats = runEncode({
            value: "1.5",
            format: { signBits: 1, exponentBits: 8, mantissaBits: 7 },
        });
        expect(stats.totalBits).toBe(16);
        expect(stats.actualValue).toBe(1.5);
    });

    test("runDecode reverses an encode (hex)", () => {
        const stats = runDecode({ bits: "0x4248", format: "fp16" });
        expect(stats.actualValue).toBeCloseTo(3.140625, 5);
    });

    test("runDecode accepts a binary string", () => {
        const stats = runDecode({ bits: "0011110000000000", format: "fp16" });
        expect(stats.actualValue).toBe(1);
    });

    test("runConvert reports precision loss", () => {
        const result = runConvert({ value: "3.14", from: "fp32", to: "fp16" });
        expect(result.input.totalBits).toBe(32);
        expect(result.output.totalBits).toBe(16);
        expect(result.precisionLoss).toHaveProperty("lossless");
        expect(result.precisionLoss).toHaveProperty("absolute");
    });

    test("runConvert applies overflow mode only to the output", () => {
        const result = runConvert({
            value: "Infinity",
            from: "fp16",
            to: "e8m0",
            overflowMode: "saturate",
        });
        expect(result.input.hex).toBe("0x7C00");
        expect(result.input.actualValue).toBe("Infinity");
        expect(result.output.hex).toBe("0xFE");
        expect(result.output.actualValue).toBe(Math.pow(2, 127));
    });

    test("runInfo returns floating-point details", () => {
        const info = runInfo({ format: "bf16" });
        expect(info.type).toBe("floating-point");
        expect(info.exponentBits).toBe(8);
        expect(info.mantissaBits).toBe(7);
    });

    test("runInfo returns integer details", () => {
        const info = runInfo({ format: "int8" });
        expect(info.type).toBe("integer");
        expect(info.minValue).toBe(-128);
        expect(info.maxValue).toBe(127);
    });

    test("runList returns all presets with categories", () => {
        const formats = runList();
        expect(Array.isArray(formats)).toBe(true);
        const keys = formats.map((f) => f.key);
        expect(keys).toContain("fp32");
        expect(keys).toContain("int8");
        expect(formats.every((f) => typeof f.category === "string")).toBe(true);
    });
});

describe("main: text output", () => {
    test("encode renders a stats block", async () => {
        const { stdout, exitCodes } = await runCli(main, ["encode", "3.14", "--format", "fp32"]);
        expect(exitCodes).toEqual([]);
        expect(stdout).toMatch(/Value:/);
        expect(stdout).toMatch(/Binary:/);
        expect(stdout).toMatch(/Hex:/);
        expect(stdout).toMatch(/Exponent:/);
    });

    test("decode renders the decoded value", async () => {
        const { stdout } = await runCli(main, ["decode", "0x4248", "--format", "fp16"]);
        expect(stdout).toMatch(/Value:\s+3\.140625/);
    });

    test("decode of an integer format shows signedness", async () => {
        const { stdout } = await runCli(main, ["decode", "0x2A", "--format", "int8"]);
        expect(stdout).toMatch(/Value:\s+42/);
        expect(stdout).toMatch(/signed/);
    });

    test("convert renders precision loss", async () => {
        const { stdout } = await runCli(main, ["convert", "3.14", "--from", "fp32", "--to", "fp16"]);
        expect(stdout).toMatch(/Input \(fp32\):/);
        expect(stdout).toMatch(/Output \(fp16\):/);
        expect(stdout).toMatch(/Precision loss:/);
        expect(stdout).toMatch(/Lossless:/);
    });

    test("info renders format layout", async () => {
        const { stdout } = await runCli(main, ["info", "bf16"]);
        expect(stdout).toMatch(/Layout:/);
        expect(stdout).toMatch(/floating-point/);
    });

    test("info leaves out a min normal the format does not have", () => {
        const info = runInfo({
            format: { signBits: 1, exponentBits: 1, mantissaBits: 0, hasInfinity: true },
        });
        const text = renderInfo(info, { format: "s1e1m0" });
        expect(text).not.toMatch(/Min normal/);
        expect(text).not.toMatch(/undefined/);
    });

    test("info renders integer range", async () => {
        const { stdout } = await runCli(main, ["info", "int8"]);
        expect(stdout).toMatch(/Range:\s+-128 \.\. 127/);
    });

    test("list groups formats by category", async () => {
        const { stdout } = await runCli(main, ["list"]);
        expect(stdout).toMatch(/IEEE 754:/);
        expect(stdout).toMatch(/Integer:/);
        expect(stdout).toMatch(/fp32/);
    });

    test("encode accepts a custom format JSON string", async () => {
        const { stdout, exitCodes } = await runCli(main, [
            "encode",
            "1.5",
            "--format",
            '{"signBits":1,"exponentBits":8,"mantissaBits":7}',
        ]);
        expect(exitCodes).toEqual([]);
        expect(stdout).toMatch(/Value:\s+1\.5/);
    });
});

describe("main: JSON output", () => {
    test("encode --json emits valid JSON", async () => {
        const { stdout } = await runCli(main, ["encode", "3.14", "--format", "fp32", "--json"]);
        const parsed = JSON.parse(stdout);
        expect(parsed.actualValue).toBeCloseTo(3.14, 2);
        expect(parsed).toHaveProperty("binary");
        expect(parsed).toHaveProperty("hex");
    });

    test("convert --json emits precisionLoss", async () => {
        const { stdout } = await runCli(main, [
            "convert",
            "3.14",
            "--from",
            "fp32",
            "--to",
            "fp16",
            "--json",
        ]);
        const parsed = JSON.parse(stdout);
        expect(parsed).toHaveProperty("precisionLoss");
        expect(parsed.input).toHaveProperty("totalBits", 32);
    });

    test("list --json emits an array", async () => {
        const { stdout } = await runCli(main, ["list", "--json"]);
        const parsed = JSON.parse(stdout);
        expect(Array.isArray(parsed)).toBe(true);
    });
});

// The renderers look every word up in a table. A value the library can report
// but the table has no entry for would print as `undefined`, so the tables are
// checked against what the library actually produces rather than against a copy
// of the list kept alongside them.
describe("lookup table coverage", () => {
    test("every conversion loss kind has a Reason label", () => {
        for (const kind of floatingPoint.CONVERSION_LOSS_KINDS) {
            expect(typeof floatingPoint.CONVERSION_LOSS_LABELS[kind]).toBe("string");
        }
        expect(Object.keys(floatingPoint.CONVERSION_LOSS_LABELS).sort())
            .toEqual([...floatingPoint.CONVERSION_LOSS_KINDS].sort());
    });

    test("a rounding with no numbers to show still gets a Reason line", () => {
        // The difference (~1e397) is too large for a double, so there is no
        // number to print.
        const result = runConvert({
            value: "1.001e400",
            from: { signBits: 1, exponentBits: 15, mantissaBits: 10 },
            to: { signBits: 1, exponentBits: 15, mantissaBits: 5 },
        });
        expect(result.precisionLoss.kind).toBe("rounded");
        expect(renderConvert(result, { from: "a", to: "b" })).toMatch(/Reason:\s+rounded/);
    });

    test("a lost zero sign is named without a difference of 0, as in the web UI", () => {
        const result = runConvert({ value: "-0", from: "fp32", to: "uint8" });
        expect(result.precisionLoss.kind).toBe("reflected");
        const text = renderConvert(result, { from: "a", to: "b" });
        expect(text).toMatch(/Reason:\s+sign not representable/);
        expect(text).not.toMatch(/Absolute:|Relative:/);
    });

    test("a clamp with a real difference keeps both the reason and the numbers", () => {
        const result = runConvert({ value: "300", from: "fp32", to: "int8" });
        const text = renderConvert(result, { from: "a", to: "b" });
        expect(text).toMatch(/Reason:\s+saturated/);
        expect(text).toMatch(/Absolute:\s+173/);
    });

    test("TARGET_TEXT has an entry for every overflow and NaN target", () => {
        for (const { key } of runList()) {
            const info = runInfo({ format: key });
            expect(typeof TARGET_TEXT[info.overflowTarget.overflow]).toBe("string");
            expect(typeof TARGET_TEXT[info.overflowTarget.saturate]).toBe("string");
            expect(typeof TARGET_TEXT[info.nanTarget]).toBe("string");
        }
    });
});
