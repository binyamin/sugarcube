import type { LoadedConfig } from "@sugarcube-sh/core";
import type { Reported } from "@sugarcube-sh/core/client";
import type { DesignTokens } from "@sugarcube-sh/dtcg";

export interface FilesNow {
    readonly config: LoadedConfig["config"];
    readonly tokens: DesignTokens;
    readonly configProblems: readonly Reported[];
}

export interface StudioFiles {
    now(): FilesNow;
    onChange(listener: () => void): () => void;
}
