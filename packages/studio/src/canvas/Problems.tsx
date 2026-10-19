import { useMemo } from "react";
import { problemRows } from "../controllers/views";
import { useStudioState } from "../providers/studio-context";

export function Problems() {
    const problems = useStudioState((state) => state.problems);
    const rows = useMemo(() => problemRows(problems), [problems]);
    if (rows.length === 0) return null;

    return (
        <section aria-label="Problems">
            <h2>Problems</h2>
            <ul>
                {rows.map((row) => (
                    <li key={`${row.place} ${row.kind} ${row.message} ${row.inPermutations}`}>
                        {row.place && <code>{row.place}</code>} {row.severity}: {row.message}
                        {row.inPermutations && ` (in ${row.inPermutations})`}{" "}
                        <small>{row.kind}</small>
                    </li>
                ))}
            </ul>
        </section>
    );
}
