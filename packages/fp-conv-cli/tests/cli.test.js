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
