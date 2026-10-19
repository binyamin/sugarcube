import {
    type Change,
    type DesignTokens,
    type Input,
    type Permutation,
    readFromMemory,
    sameJson,
} from "@sugarcube-sh/dtcg";
import {
    type Clash,
    type Committed,
    type Edits,
    type OpResult,
    createSession,
} from "@sugarcube-sh/dtcg-edit";
import type { Saved, SentAdapter, StudioMessage } from "../protocol";
import type { BuildAdapter, BuildProblem, BuildOutput } from "./adapter";

export interface StudioState {
    readonly tokens: DesignTokens;
    readonly showing: Permutation;
    readonly value: BuildOutput["value"];
    readonly css: string;
    readonly problems: readonly BuildProblem[];
    readonly changes: readonly Change[];
    readonly clashes: readonly Clash[];
}

export interface Studio {
    readonly state: StudioState;
    readonly unsaved: Edits;
    subscribe(listener: () => void): () => void;
    destroy(): void;
    show(input: Input): void;
    receive(message: StudioMessage): void;
    do(result: OpResult): Committed;
    discard(): void;
    restore(edits: Edits): void;
    idOf(path: string): string | undefined;
    pathOf(id: string): string | undefined;
    save?(): Promise<Saved>;
}

export function createStudio(
    first: StudioMessage,
    adapterFor: (sent: SentAdapter) => BuildAdapter,
    saveEdits?: (edits: Edits) => Promise<Saved>,
): Studio {
    let message = first;
    let adapter = adapterFor(first.adapter);
    const session = createSession(read(first, adapter));
    const listeners = new Set<() => void>();
    let clashes: readonly Clash[] = [];
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
            changes: session.changes(),
            clashes,
        };
    }

    function publish(next: StudioState) {
        state = next;
        for (const listener of listeners) listener();
    }

    const stopSession = session.subscribe(() => publish(built(state.showing.input)));

    const save = saveEdits
        ? async () => {
              const sent = session.unsaved;
              const saved = await saveEdits(sent);
              if (!saved.conflicts && session.unsaved === sent) session.markSaved();
              return saved;
          }
        : undefined;

    return {
        ...(save && { save }),
        get state() {
            return state;
        },
        get unsaved() {
            return session.unsaved;
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
        do(result) {
            return session.do(result);
        },
        discard() {
            session.discard();
        },
        restore(edits) {
            clashes = session.restore(edits);
            publish(built(state.showing.input));
        },
        idOf(path) {
            return session.idOf(path);
        },
        pathOf(id) {
            return session.pathOf(id);
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
