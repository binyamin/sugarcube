import {
    type DesignTokens,
    type Input,
    type Permutation,
    readFromMemory,
    sameJson,
} from "@sugarcube-sh/dtcg";
import { createSession } from "@sugarcube-sh/dtcg-edit";
import type { SentAdapter, StudioMessage } from "../protocol";
import type { BuildAdapter, BuildProblem, BuildOutput } from "./adapter";

export interface StudioState {
    readonly tokens: DesignTokens;
    readonly showing: Permutation;
    readonly value: BuildOutput["value"];
    readonly css: string;
    readonly problems: readonly BuildProblem[];
    readonly changes: number;
}

export interface Studio {
    readonly state: StudioState;
    subscribe(listener: () => void): () => void;
    destroy(): void;
    show(input: Input): void;
    receive(message: StudioMessage): void;
}

export function createStudio(
    first: StudioMessage,
    adapterFor: (sent: SentAdapter) => BuildAdapter,
): Studio {
    let message = first;
    let adapter = adapterFor(first.adapter);
    const session = createSession(read(first, adapter));
    const listeners = new Set<() => void>();
    let state = built(session.tokens.permutation().input);

    function built(showing: Input): StudioState {
        const { tokens } = session;
        const written = adapter.write(tokens);
        return {
            tokens,
            showing: tokens.permutations.matching(showing) ?? tokens.permutation(),
            value: written.value,
            css: written.css,
            problems: [...message.adapter.problems, ...written.problems],
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
            if (
                next.entry !== previous.entry ||
                next.adapter.name !== previous.adapter.name ||
                !sameJson(next.adapter.settings, previous.adapter.settings)
            ) {
                adapter = adapterFor(next.adapter);
                session.rebase(read(next, adapter));
                return;
            }
            const fresh = session.opened.rereadAll(next.files);
            if (fresh !== session.opened) session.rebase(fresh);
            else if (!sameJson(next.adapter.problems, previous.adapter.problems))
                publish(built(state.showing.input));
        },
    };
}

function read({ files, entry }: StudioMessage, adapter: BuildAdapter): DesignTokens {
    return readFromMemory({ files, entry }, adapter.read);
}
