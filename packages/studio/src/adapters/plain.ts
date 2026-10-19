import {
    type CSSBlockInput,
    type CSSNaming,
    cssBlocks,
    cssText,
    cssWriter,
} from "@sugarcube-sh/dtcg/css";
import type { BuildAdapter } from "../controllers/adapter";

export interface PlainSettings {
    readonly naming?: CSSNaming;
    readonly blocks?: readonly CSSBlockInput[];
}

const DEFAULT_BLOCKS: readonly CSSBlockInput[] = [{ input: {}, selector: ":root" }];

export function plain({ naming, blocks = DEFAULT_BLOCKS }: PlainSettings = {}): BuildAdapter {
    return {
        read: {},
        write(tokens) {
            const values = cssWriter({ naming, references: "values" });
            return {
                value: (token) => values.written(token)?.css,
                css: cssText(cssBlocks(tokens, blocks, { writer: cssWriter({ naming }) })),
                problems: tokens.diagnostics,
            };
        },
    };
}
