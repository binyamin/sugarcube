import type { JsonPath } from "@sugarcube-sh/dtcg";

export { removeAt, renameKeyAt, setAt } from "./text-edits.js";

/** Moves a key to a new position among its siblings. */
export function reorderKeyAt(text: string, path: JsonPath, index: number): string {
    throw new Error("not implemented yet");
}
