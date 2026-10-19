import { type LoadedConfig, tokensOnDisk } from "@sugarcube-sh/core";
import type { Reported } from "@sugarcube-sh/core/client";
import type { DesignTokens } from "@sugarcube-sh/dtcg";
import type { StudioMessage } from "../protocol";
import { studioMessage } from "./message";
import { type Saved, saveEdits } from "./save";

export interface StudioFiles {
    message(): StudioMessage;
    onChange(listener: () => void): () => void;
    save(sent: unknown): Promise<Saved>;
}

export interface FilesNow {
    readonly config: LoadedConfig["config"];
    readonly tokens: DesignTokens;
    readonly configProblems: readonly Reported[];
}

export function studioFiles(now: () => FilesNow, onChange: StudioFiles["onChange"]): StudioFiles {
    return {
        message() {
            const { config, tokens, configProblems } = now();
            return studioMessage(config, tokens, configProblems);
        },
        onChange,
        save(sent) {
            return saveEdits(tokensOnDisk(now().config), sent);
        },
    };
}
