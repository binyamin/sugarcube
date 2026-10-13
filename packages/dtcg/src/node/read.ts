import type { DesignSystem, ReadOptions } from "../index.js";
import { open } from "./open.js";

/**
 * Reads a design system from disk. Paths in the result are relative to the entry's folder: join
 * them with it to reach a file on disk.
 *
 * @example
 * const ds = await read("tokens/tokens.resolver.json");
 */
export async function read(entry: string, options: ReadOptions = {}): Promise<DesignSystem> {
    return (await open(entry, options)).doc;
}
