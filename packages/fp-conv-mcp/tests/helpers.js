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
