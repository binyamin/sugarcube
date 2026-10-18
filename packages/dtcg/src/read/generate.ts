import { applying } from "./inherit.js";
import type { Settings } from "./settings.js";
import { childPath, forbiddenInName } from "../path.js";
import type { Node } from "jsonc-parser";
import type {
    ExtensionError,
    ExtensionMessages,
    GeneratedToken,
    Generator,
    IgnoredProperty,
    Input,
    ParseOptions,
    StandardSchemaV1,
    ValueError,
} from "../index.js";
import { readReference } from "../values/references.js";
import {
    type CheckedExtension,
    type ExtensionProblem,
    type SchemaOutput,
    Reported,
    checkSchema,
    extensionAt,
    extensionDiagnostic,
} from "./extension-check.js";
import { diagnostic, type Problems } from "./diagnostics.js";
import { type JsonFile, spanOf } from "./json.js";
import { type Merged, type MergedToken, type Piece, everyGroup } from "./merge.js";
import { usableType } from "./walk.js";

interface Extension {
    value: unknown;
    json: JsonFile;
    node: Node;
    piece: Piece;
}

/**
 * Defines a {@link Generator}, checking each error `generate` returns against its `messages`. With a
 * `schema`, `generate` receives the schema's output.
 *
 * @example
 * // { "space": { "$type": "dimension", "$extensions": { "com.example": { "steps": 4 } } } }
 * const steps = defineGenerator({
 *   extension: ["com.example", "steps"],
 *   messages: {
 *     "not-a-count": ({ steps }: { steps: unknown }) =>
 *       `\`steps\` must be a whole number above 0, not ${JSON.stringify(steps)}`,
 *   },
 *   generate: (group, steps) =>
 *     typeof steps === "number"
 *       ? {
 *           ok: true,
 *           value: Array.from({ length: steps }, (_, i) => ({
 *             name: `${i + 1}`,
 *             $value: { value: i + 1, unit: "rem" },
 *           })),
 *         }
 *       : { ok: false, errors: [{ jsonPath: [], reason: "not-a-count", data: { steps } }] },
 * });
 */
export function defineGenerator<
    const M extends ExtensionMessages = Record<never, never>,
    S extends StandardSchemaV1 | undefined = undefined,
>(
    generator: Omit<Generator, "schema" | "messages" | "generate"> & {
        schema?: S;
        messages?: M;
        generate: (
            group: Parameters<Generator["generate"]>[0],
            extension: SchemaOutput<S>,
            options: ParseOptions,
        ) =>
            | { ok: true; value: GeneratedToken[]; ignored?: IgnoredProperty[] }
            | {
                  ok: false;
                  errors: (ExtensionError<NoInfer<M>> | ValueError)[];
                  ignored?: IgnoredProperty[];
              };
    },
): Generator {
    return generator;
}

export function fillGenerated(
    merged: Merged,
    generators: readonly Generator[],
    { permutation, parseOptions }: { permutation: Input; parseOptions: ParseOptions },
    diagnostics: Problems,
): void {
    const added: MergedToken[] = [];
    const addedPaths = new Set<string>();
    const reported = new Reported();
    const reportedIgnored = new Reported();

    for (const [groupPath, group] of everyGroup(merged)) {
        const settings = applying(merged, group);
        for (const generator of generators) {
            const extension = extensionOf(settings, generator.extension);
            if (!extension) continue;
            const checked: CheckedExtension = {
                within: generator.extension,
                messages: generator.messages,
                json: extension.json,
                node: extension.node,
                ...(groupPath !== undefined && { path: groupPath }),
                permutation,
            };
            const report = (problems: ExtensionProblem[], seen = reported) => {
                if (!seen.first(generator, extension.node)) return;
                for (const each of problems) diagnostics.found(extensionDiagnostic(each, checked));
            };
            const passed = checkSchema(generator.schema, extension.value, generator.extension[0]);
            if (!passed.ok) {
                report(passed.problems);
                continue;
            }
            const type = usableType(settings.type);
            const result = generator.generate(
                { ...(groupPath !== undefined && { path: groupPath }), ...(type && { type }) },
                passed.value,
                parseOptions,
            );
            if (result.ignored) report(result.ignored, reportedIgnored);
            if (!result.ok) {
                report(result.errors);
                continue;
            }
            const from = {
                ...(groupPath !== undefined && { from: groupPath }),
                extension: generator.extension,
            };
            for (const made of result.value) {
                const character = forbiddenInName(made.name);
                if (character) {
                    const detail = { name: made.name, character };
                    diagnostics.found(
                        diagnostic("invalid-name", detail, {
                            span: spanOf(extension.json, extension.node),
                            ...(groupPath !== undefined && { path: groupPath }),
                            permutation,
                        }),
                    );
                    continue;
                }
                const path = childPath(groupPath, made.name);
                const written = merged.tokens.get(path);
                if (written) merged.tokens.set(path, { ...written, generated: from });
                if (written || merged.groups.has(path) || addedPaths.has(path)) continue;
                addedPaths.add(path);
                added.push(addedToken(path, made, from, extension));
            }
        }
    }
    for (const token of added) {
        merged.tokens.set(token.path, token);
        merged.order.add(token.path);
    }
}

function extensionOf(group: Settings, extension: Generator["extension"]): Extension | undefined {
    const written = group.extensionsAt?.[extension[0]];
    const found = extensionAt(group.extensions, written, extension);
    return written && found && { ...found, json: written.json, piece: written.piece };
}

function addedToken(
    path: string,
    { $type, $value, $description, $extensions }: GeneratedToken,
    generated: { from?: string; extension: Generator["extension"] },
    { json, node, piece }: Extension,
): MergedToken {
    return {
        path,
        json,
        value: node,
        authored: $value,
        reference: readReference($value),
        span: spanOf(json, node),
        piece,
        generated,
        added: true,
        ...($type !== undefined && { type: $type }),
        ...($description !== undefined && { description: $description }),
        ...($extensions && { extensions: $extensions }),
    };
}
