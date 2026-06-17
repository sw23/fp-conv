// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { parseArgs, main } from "../src/index.js";
import { SERVER_VERSION } from "../src/server.js";
import { spyOn } from "./helpers.js";

describe("parseArgs", () => {
    test("defaults to stdio mode", () => {
        const opts = parseArgs([]);
        expect(opts).toEqual({
            help: false,
            version: false,
            http: false,
            host: "127.0.0.1",
            port: 3001,
        });
    });

    test("parses --help and -h", () => {
        expect(parseArgs(["--help"]).help).toBe(true);
        expect(parseArgs(["-h"]).help).toBe(true);
    });

    test("parses --version and -v", () => {
        expect(parseArgs(["--version"]).version).toBe(true);
        expect(parseArgs(["-v"]).version).toBe(true);
    });

    test("parses --http with custom host and port", () => {
        const opts = parseArgs(["--http", "--host", "0.0.0.0", "--port", "8080"]);
        expect(opts.http).toBe(true);
        expect(opts.host).toBe("0.0.0.0");
        expect(opts.port).toBe(8080);
    });

    test("rejects a non-numeric port", () => {
        expect(() => parseArgs(["--port", "abc"])).toThrow(/Invalid --port/);
    });

    test("rejects an out-of-range port", () => {
        expect(() => parseArgs(["--port", "0"])).toThrow(/Invalid --port/);
        expect(() => parseArgs(["--port", "70000"])).toThrow(/Invalid --port/);
    });

    test("rejects an unknown argument", () => {
        expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument: --nope/);
    });
});

describe("main", () => {
    let argv;
    let stderr;

    beforeEach(() => {
        argv = process.argv;
        stderr = spyOn(process.stderr, "write");
    });

    afterEach(() => {
        process.argv = argv;
        stderr.restore();
    });

    test("--help prints usage to stderr and returns", async () => {
        process.argv = ["node", "index.js", "--help"];
        await expect(main()).resolves.toBeUndefined();
        const output = stderr.calls.map((c) => c[0]).join("");
        expect(output).toMatch(/Usage:/);
        expect(output).toMatch(/fp-conv-mcp/);
    });

    test("--version prints the version to stderr and returns", async () => {
        process.argv = ["node", "index.js", "--version"];
        await expect(main()).resolves.toBeUndefined();
        const output = stderr.calls.map((c) => c[0]).join("");
        expect(output).toContain(SERVER_VERSION);
    });

    test("invalid arguments exit with code 1 after printing help", async () => {
        process.argv = ["node", "index.js", "--bogus"];
        const exit = spyOn(process, "exit", () => {
            throw new Error("process.exit called");
        });

        try {
            await expect(main()).rejects.toThrow("process.exit called");
            const output = stderr.calls.map((c) => c[0]).join("");
            expect(output).toMatch(/Unknown argument: --bogus/);
            expect(exit.calls).toContainEqual([1]);
        } finally {
            exit.restore();
        }
    });
});
