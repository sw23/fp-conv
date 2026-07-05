// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { parseArgs, main, CLI_VERSION } from "../src/index.js";
import { runCli } from "./helpers.js";

describe("parseArgs", () => {
    test("parses a bare command", () => {
        const parsed = parseArgs(["list"]);
        expect(parsed.command).toBe("list");
        expect(parsed.positionals).toEqual(["list"]);
        expect(parsed.values.json).toBe(false);
    });

    test("parses encode with value and --format", () => {
        const parsed = parseArgs(["encode", "3.14", "--format", "fp32"]);
        expect(parsed.command).toBe("encode");
        expect(parsed.positionals).toEqual(["encode", "3.14"]);
        expect(parsed.values.format).toBe("fp32");
    });

    test("supports the -f short flag for format", () => {
        const parsed = parseArgs(["decode", "0x40", "-f", "fp16"]);
        expect(parsed.values.format).toBe("fp16");
    });

    test("parses convert --from/--to and -r rounding", () => {
        const parsed = parseArgs([
            "convert",
            "3.14",
            "--from",
            "fp32",
            "--to",
            "fp16",
            "-r",
            "towardZero",
        ]);
        expect(parsed.values.from).toBe("fp32");
        expect(parsed.values.to).toBe("fp16");
        expect(parsed.values.rounding).toBe("towardZero");
    });

    test("parses --json, --help, --version booleans", () => {
        expect(parseArgs(["list", "--json"]).values.json).toBe(true);
        expect(parseArgs(["-h"]).values.help).toBe(true);
        expect(parseArgs(["-v"]).values.version).toBe(true);
    });

    test("throws on an unknown option", () => {
        expect(() => parseArgs(["encode", "--nope"])).toThrow();
    });

    test("treats a bare negative number as a positional value", () => {
        const parsed = parseArgs(["encode", "-1.5", "--format", "fp16"]);
        expect(parsed.command).toBe("encode");
        expect(parsed.positionals).toEqual(["encode", "-1.5"]);
        expect(parsed.values.format).toBe("fp16");
    });

    test("treats -inf and -0 as positional values", () => {
        expect(parseArgs(["encode", "-inf", "-f", "fp16"]).positionals)
            .toEqual(["encode", "-inf"]);
        expect(parseArgs(["encode", "-0", "-f", "fp16"]).positionals)
            .toEqual(["encode", "-0"]);
        expect(parseArgs(["encode", "-.5", "-f", "fp16"]).positionals)
            .toEqual(["encode", "-.5"]);
    });

    test("still supports the -- separator for values", () => {
        const parsed = parseArgs(["encode", "--format", "fp16", "--", "-1.5"]);
        expect(parsed.positionals).toEqual(["encode", "-1.5"]);
        expect(parsed.values.format).toBe("fp16");
    });
});

describe("main: help and version", () => {
    test("--version prints the version to stdout", async () => {
        const { stdout, exitCodes } = await runCli(main, ["--version"]);
        expect(stdout.trim()).toBe(CLI_VERSION);
        expect(exitCodes).toEqual([]);
    });

    test("--help prints usage to stdout", async () => {
        const { stdout } = await runCli(main, ["--help"]);
        expect(stdout).toMatch(/Usage:/);
        expect(stdout).toMatch(/fp-conv/);
    });

    test("no command prints help", async () => {
        const { stdout } = await runCli(main, []);
        expect(stdout).toMatch(/Commands:/);
    });
});

describe("main: error handling", () => {
    test("unknown command exits with code 1", async () => {
        const { stderr, exitCodes } = await runCli(main, ["bogus"]);
        expect(stderr).toMatch(/Unknown command: bogus/);
        expect(exitCodes).toContain(1);
    });

    test("invalid option exits with code 1", async () => {
        const { stderr, exitCodes } = await runCli(main, ["encode", "--nope"]);
        expect(exitCodes).toContain(1);
        expect(stderr).toMatch(/fp-conv:/);
    });

    test("missing value argument exits with code 1", async () => {
        const { stderr, exitCodes } = await runCli(main, ["encode", "--format", "fp32"]);
        expect(stderr).toMatch(/Missing required argument: <value>/);
        expect(exitCodes).toContain(1);
    });

    test("missing --format option exits with code 1", async () => {
        const { stderr, exitCodes } = await runCli(main, ["encode", "3.14"]);
        expect(stderr).toMatch(/Missing required option: --format/);
        expect(exitCodes).toContain(1);
    });

    test("invalid custom format JSON exits with code 1", async () => {
        const { stderr, exitCodes } = await runCli(main, [
            "encode",
            "1.5",
            "--format",
            "{bad json",
        ]);
        expect(stderr).toMatch(/Invalid custom format JSON/);
        expect(exitCodes).toContain(1);
    });
});

describe("main: negative values", () => {
    test("encodes a negative decimal without a -- separator", async () => {
        const { stdout, stderr, exitCodes } = await runCli(main, [
            "encode",
            "-1.5",
            "--format",
            "fp16",
            "--json",
        ]);
        expect(exitCodes).toEqual([]);
        expect(stderr).toBe("");
        const data = JSON.parse(stdout);
        expect(data.actualValue).toBe(-1.5);
        expect(data.sign).toBe(1);
    });

    test("encodes -inf", async () => {
        const { stdout, exitCodes } = await runCli(main, [
            "encode",
            "-inf",
            "--format",
            "fp16",
            "--json",
        ]);
        expect(exitCodes).toEqual([]);
        const data = JSON.parse(stdout);
        expect(data.actualValue).toBe("-Infinity");
    });
});

describe("main: OCP E4M3", () => {
    test("info reports max normal 448", async () => {
        const { stdout, exitCodes } = await runCli(main, ["info", "fp8_e4m3", "--json"]);
        expect(exitCodes).toEqual([]);
        const info = JSON.parse(stdout);
        expect(info.maxNormal).toBe(448);
    });

    test("encodes 448 as a Normal value (not NaN)", async () => {
        const { stdout, exitCodes } = await runCli(main, [
            "encode",
            "448",
            "--format",
            "fp8_e4m3",
            "--json",
        ]);
        expect(exitCodes).toEqual([]);
        const data = JSON.parse(stdout);
        expect(data.type).toBe("Normal");
        expect(data.actualValue).toBe(448);
    });
});
