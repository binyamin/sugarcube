import type { ReadOptions } from "@sugarcube-sh/dtcg";
import { readOptions } from "../shared/read-options.js";
import type { LoadedConfig } from "./config/load.js";

export function tokensOnDisk(config: LoadedConfig["config"]): {
    entry: string;
    options: ReadOptions;
} {
    return { entry: config.resolver, options: readOptions(config) };
}
