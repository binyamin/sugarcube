import type { JsonPath } from "@sugarcube-sh/dtcg";
import {
    type FormattingOptions,
    type Node,
    applyEdits,
    findNodeAtLocation,
    getNodeValue,
    modify,
    parseTree,
} from "jsonc-parser";
import type { Json } from "./index.js";

/**
 * Sets a value in JSON text, changing nothing else. Groups missing on the way are created. New
 * lines are indented the way the file already is.
 */
export function setAt(text: string, path: JsonPath, value: Json): string {
    return edit(text, path, value);
}

/** Removes a value from JSON text, changing nothing else. Text without the path comes back unchanged. */
export function removeAt(text: string, path: JsonPath): string {
    return edit(text, path, undefined);
}

/**
 * Renames a key in JSON text, keeping its value and position.
 *
 * @returns the new text, or `undefined` when the path is not there
 */
export function renameKeyAt(text: string, path: JsonPath, name: string): string | undefined {
    const key = propertyAt(text, path)?.children?.[0];
    if (!key) return undefined;
    return text.slice(0, key.offset) + JSON.stringify(name) + text.slice(key.offset + key.length);
}

/**
 * Moves a key to a new position among its siblings. Each property keeps its own text, comments
 * inside it included, and the spacing between properties stays where it was.
 *
 * @returns the new text, or `undefined` when the path is not there
 */
export function reorderKeyAt(text: string, path: JsonPath, index: number): string | undefined {
    const property = propertyAt(text, path);
    const properties = property?.parent?.children;
    if (!property || !properties) return undefined;

    const from = properties.indexOf(property);
    const to = Math.max(0, Math.min(index, properties.length - 1));
    if (to === from) return text;

    const texts = properties.map((each) => text.slice(each.offset, each.offset + each.length));
    const separators = properties.slice(1).map((each, i) => {
        const previous = properties[i] as Node;
        return text.slice(previous.offset + previous.length, each.offset);
    });

    const [moved] = texts.splice(from, 1);
    texts.splice(to, 0, moved as string);
    const rebuilt = texts.reduce((acc, each, i) => acc + (separators[i - 1] ?? "") + each);

    const first = properties[0] as Node;
    const last = properties[properties.length - 1] as Node;
    return text.slice(0, first.offset) + rebuilt + text.slice(last.offset + last.length);
}

/**
 * The value at a path in JSON text, as plain JSON.
 *
 * @returns the value, or `undefined` when the path is not there
 */
export function nodeAt(text: string, path: JsonPath): Json | undefined {
    const node = find(text, path);
    return node === undefined ? undefined : (getNodeValue(node) as Json);
}

function find(text: string, path: JsonPath): Node | undefined {
    const root = parseTree(text);
    return root === undefined ? undefined : findNodeAtLocation(root, path);
}

function propertyAt(text: string, path: JsonPath): Node | undefined {
    const parent = find(text, path)?.parent;
    return parent?.type === "property" ? parent : undefined;
}

function edit(text: string, path: JsonPath, value: Json | undefined): string {
    return applyEdits(text, modify(text, path, value, { formattingOptions: formatting(text) }));
}

const LEADING = /^[\t ]*/;

function formatting(text: string): FormattingOptions {
    const steps = new Map<number, number>();
    let tabs = 0;
    let spaces = 0;
    let previous = 0;

    for (const line of text.split("\n")) {
        if (line.trim() === "") continue;

        const indent = LEADING.exec(line)?.[0] ?? "";
        if (indent.includes("\t")) tabs += 1;
        else if (indent.length > 0) spaces += 1;

        const step = indent.length - previous;
        if (step > 0) steps.set(step, (steps.get(step) ?? 0) + 1);
        previous = indent.length;
    }

    if (tabs > spaces) return { tabSize: 1, insertSpaces: false };

    let best = 2;
    let seen = 0;
    for (const [step, count] of steps) {
        if (count > seen) {
            best = step;
            seen = count;
        }
    }
    return { tabSize: best, insertSpaces: true };
}
