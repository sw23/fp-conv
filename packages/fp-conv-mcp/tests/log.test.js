// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { log } from "../src/log.js";
import { spyOn } from "./helpers.js";

describe("log", () => {
    test("writes a prefixed line to stderr", () => {
        const spy = spyOn(process.stderr, "write");
        try {
            log("hello world");
        } finally {
            spy.restore();
        }
        expect(spy.calls).toEqual([["[fp-conv-mcp] hello world\n"]]);
    });

    test("does not write to stdout", () => {
        const stdoutSpy = spyOn(process.stdout, "write");
        const stderrSpy = spyOn(process.stderr, "write");
        try {
            log("diagnostic");
        } finally {
            stdoutSpy.restore();
            stderrSpy.restore();
        }
        expect(stdoutSpy.calls).toHaveLength(0);
        expect(stderrSpy.calls).toHaveLength(1);
    });
});
