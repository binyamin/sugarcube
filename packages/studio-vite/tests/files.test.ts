import type { SugarcubePluginContext } from "@sugarcube-sh/vite";
import { describe, expect, it, vi } from "vitest";
import { viteFiles } from "../src/files";

const configProblem = {
    kind: "invalid-config",
    severity: "error",
    message: "`variables.prefix` must be a string",
    docs: "https://sugarcube.sh/errors/invalid-config",
    detail: {
        reason: "wrong-type",
        setting: "variables.prefix",
        expected: ["string"],
        received: "number",
    },
} as const;

function context() {
    const listeners = new Set<() => void>();
    const files = { "tokens.resolver.json": "{}", "base.json": '{ "a": 1 }' };
    const ctx = {
        config: { resolver: "tokens/tokens.resolver.json", variables: {} },
        tokens: { toMemory: () => ({ entry: "tokens.resolver.json", files }) },
        configProblems: [configProblem],
        onReload: (fn: () => void) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    } as unknown as SugarcubePluginContext;
    return { ctx, files, readAgain: () => listeners.forEach((fn) => fn()) };
}

describe("Studio's files under Vite", () => {
    it("sends the files sugarcube's plugin read, with the config's problems", () => {
        const { ctx, files } = context();

        const message = viteFiles(ctx).message();

        expect(message.files).toEqual(files);
        expect(message.entry).toBe("tokens.resolver.json");
        expect(message.configProblems).toEqual([configProblem]);
    });

    it("tells Studio whenever sugarcube's plugin reads the tokens again", () => {
        const { ctx, readAgain } = context();
        const listener = vi.fn();

        viteFiles(ctx).onChange(listener);
        readAgain();

        expect(listener).toHaveBeenCalledTimes(1);
    });
});
