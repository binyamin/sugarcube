import type { InternalConfig, Reported } from "@sugarcube-sh/core/client";
import type { DesignTokens } from "@sugarcube-sh/dtcg";
import type { StudioMessage } from "../protocol";

export function studioMessage(
    config: InternalConfig,
    tokens: DesignTokens,
    configProblems: readonly Reported[],
): StudioMessage {
    const { entry, files } = tokens.toMemory();
    return JSON.parse(JSON.stringify({ config, entry, files, configProblems }));
}
