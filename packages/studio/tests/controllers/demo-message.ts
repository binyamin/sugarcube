import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type InternalConfig, fillDefaults } from "@sugarcube-sh/core";
import type { Reported } from "@sugarcube-sh/core/client";
import type { StudioMessage } from "../../src/protocol";

const DEMO = join(__dirname, "../../demo");

export const ENTRY = "tokens.resolver.json";

export function demoFiles(): Record<string, string> {
    return Object.fromEntries(
        readdirSync(DEMO)
            .filter((name) => name.endsWith(".json"))
            .map((name) => [name, readFileSync(join(DEMO, name), "utf8")]),
    );
}

export function asSent(
    config: Parameters<typeof fillDefaults>[0] = { resolver: ENTRY },
): InternalConfig {
    return JSON.parse(JSON.stringify(fillDefaults(config)));
}

export function demoMessage(change: Partial<StudioMessage> = {}): StudioMessage {
    return { config: asSent(), entry: ENTRY, files: demoFiles(), configProblems: [], ...change };
}

export function withFile(file: string, text: string, message = demoMessage()): StudioMessage {
    return { ...message, files: { ...message.files, [file]: text } };
}

export const configProblem: Reported = {
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
};
