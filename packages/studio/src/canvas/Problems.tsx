import { useMemo } from "react";
import { problemList } from "../controllers/views";
import { useStudioState } from "../providers/studio-context";

export function Problems() {
    const problems = useStudioState((state) => state.problems);
    const lines = useMemo(() => problemList(problems), [problems]);
    if (lines.length === 0) return null;

    return (
        <section aria-label="Problems">
            <h2>Problems</h2>
            <pre>{lines.join("\n")}</pre>
        </section>
    );
}
