// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { runEncode, runDecode, runConvert, runInfo, runList } from "../src/commands.js";
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
