// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * Temporarily replace a method on an object, capturing its call arguments.
 *
 * Avoids depending on the `jest` global, which is not injected under native
 * ESM (`transform: {}`) without importing `@jest/globals`.
 *
 * @param {object} obj - Target object.
 * @param {string} method - Method name to replace.
 * @param {(...args: any[]) => any} [impl] - Optional replacement implementation.
 * @returns {{calls: any[][], restore: () => void}}
 */
export function spyOn(obj, method, impl = () => true) {
    const original = obj[method];
    const calls = [];
    obj[method] = (...args) => {
        calls.push(args);
        return impl(...args);
    };
    return {
        calls,
        restore() {
            obj[method] = original;
        },
    };
}

/**
 * Run main() with a given argv, capturing stdout/stderr and any process.exit.
 *
 * @param {() => Promise<void>} mainFn - The CLI main function.
 * @param {string[]} args - Arguments after `node script` (i.e. argv.slice(2)).
 * @returns {Promise<{stdout: string, stderr: string, exitCodes: number[]}>}
 */
export async function runCli(mainFn, args) {
    const savedArgv = process.argv;
    process.argv = ["node", "fp-conv", ...args];

    const stdout = spyOn(process.stdout, "write");
    const stderr = spyOn(process.stderr, "write");
    const exit = spyOn(process, "exit", () => {
        throw new ExitSignal();
    });

    try {
        await mainFn();
    } catch (err) {
        if (!(err instanceof ExitSignal)) {
            throw err;
        }
    } finally {
        process.argv = savedArgv;
        stdout.restore();
        stderr.restore();
        exit.restore();
    }

    return {
        stdout: stdout.calls.map((c) => c[0]).join(""),
        stderr: stderr.calls.map((c) => c[0]).join(""),
        exitCodes: exit.calls.map((c) => c[0]),
    };
}

/** Sentinel thrown by the mocked process.exit to unwind main(). */
class ExitSignal extends Error {}
