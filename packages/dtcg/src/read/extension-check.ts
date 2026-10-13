import type { Node } from "jsonc-parser";
import { thrownMessages } from "../error-messages.js";
import type {
    Diagnostic,
    ExtensionError,
    ExtensionMessages,
    IgnoredProperty,
    Input,
    JsonPath,
    StandardSchemaV1,
    ValueError,
} from "../index.js";
import { type DiagnosticExtra, diagnostic } from "./diagnostics.js";
import { type JsonFile, deepestNode, spanOf } from "./json.js";
import { ignoredDiagnostic, valueDiagnostic } from "./value-diagnostic.js";

export type SchemaOutput<S> = S extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<S>
    : unknown;

export type ExtensionProblem =
    | ExtensionError
    | ValueError
    | IgnoredProperty
    | { jsonPath: JsonPath; message: string };

export interface CheckedExtension {
    within: [string, ...string[]];
    messages?: ExtensionMessages | undefined;
    json: JsonFile;
    node: Node;
    path?: string | undefined;
    permutation: Input;
}

export function checkSchema(
    schema: StandardSchemaV1 | undefined,
    value: unknown,
    key: string,
): { ok: true; value: unknown } | { ok: false; problems: ExtensionProblem[] } {
    if (!schema) return { ok: true, value };
    const result = schema["~standard"].validate(value);
    if (result instanceof Promise) throw new TypeError(thrownMessages.asyncSchema(key));
    if (!result.issues) return { ok: true, value: result.value };
    return {
        ok: false,
        problems: result.issues.map(({ message, path }) => ({
            jsonPath: issuePath(path),
            message,
        })),
    };
}

function issuePath(path: StandardSchemaV1.Issue["path"]): JsonPath {
    const steps: JsonPath = [];
    for (const segment of path ?? []) {
        const key = typeof segment === "object" ? segment.key : segment;
        if (typeof key !== "string" && typeof key !== "number") break;
        steps.push(key);
    }
    return steps;
}

export function extensionDiagnostic(
    problem: ExtensionProblem,
    { within, messages, json, node, path, permutation }: CheckedExtension,
): Diagnostic {
    const jsonPath = ["$extensions", ...within, ...problem.jsonPath];
    if ("kind" in problem && problem.kind === "unknown-property") {
        const where = { node, steps: problem.jsonPath, json };
        return ignoredDiagnostic(problem, jsonPath, where, {
            ...(path !== undefined && { path }),
            permutation,
        });
    }
    const found = deepestNode(node, problem.jsonPath);
    const extra: DiagnosticExtra = {
        span: spanOf(json, found),
        ...(path !== undefined && { path }),
        permutation,
    };
    if ("kind" in problem) return valueDiagnostic(problem.detail, jsonPath, found, extra);

    const key = within[0];
    if ("message" in problem) {
        return {
            ...diagnostic("extension-invalid", { key, jsonPath }, extra),
            message: problem.message,
        };
    }
    const { reason, data } = problem;
    const invalid = diagnostic(
        "extension-invalid",
        { key, jsonPath, reason, ...(data !== undefined && { data }) },
        extra,
    );
    if (!messages || !Object.hasOwn(messages, reason)) return invalid;
    return { ...invalid, message: messages[reason]!(data) };
}
