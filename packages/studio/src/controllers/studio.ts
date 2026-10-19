import { type Reported, cssFrom, readOptions } from "@sugarcube-sh/core/client";
import {
    type DesignTokens,
    type Input,
    type Permutation,
    readFromMemory,
    sameJson,
} from "@sugarcube-sh/dtcg";
import { createSession } from "@sugarcube-sh/dtcg-edit";
import type { StudioMessage } from "../protocol";

export interface StudioState {
    readonly tokens: DesignTokens;
    readonly showing: Permutation;
    readonly css: string;
    readonly problems: readonly Reported[];
    readonly changes: number;
}

export interface Studio {
    readonly state: StudioState;
    subscribe(listener: () => void): () => void;
    destroy(): void;
    show(input: Input): void;
    receive(message: StudioMessage): void;
}

export function createStudio(first: StudioMessage): Studio {
    let message = first;
    const session = createSession(read(first));
    const listeners = new Set<() => void>();
    let state = built(session.tokens.permutation().input);

    function built(showing: Input): StudioState {
        const { tokens } = session;
        const made = cssFrom(tokens, message.config, { utilities: false });
        return {
            tokens,
            showing:
                tokens.permutations.find((p) => sameJson(p.input, showing)) ?? tokens.permutation(),
            css: made.variables.map((file) => file.css).join("\n"),
            problems: [...message.problems, ...made.diagnostics],
            changes: session.changes().length,
        };
    }

    function publish(next: StudioState) {
        state = next;
        for (const listener of listeners) listener();
    }

    const stopSession = session.subscribe(() => publish(built(state.showing.input)));

    return {
        get state() {
            return state;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        destroy() {
            stopSession();
            listeners.clear();
        },
        show(input) {
            publish({ ...state, showing: state.tokens.permutation(input) });
        },
        receive(next) {
            const previous = message;
            message = next;
            if (next.entry !== previous.entry || !sameJson(next.config, previous.config)) {
                session.rebase(read(next));
                return;
            }
            const fresh = session.opened.rereadAll(next.files);
            if (fresh !== session.opened) session.rebase(fresh);
            else if (!sameJson(next.problems, previous.problems))
                publish(built(state.showing.input));
        },
    };
}

function read({ files, entry, config }: StudioMessage): DesignTokens {
    return readFromMemory({ files, entry }, readOptions(config));
}
