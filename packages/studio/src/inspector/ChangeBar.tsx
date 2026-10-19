import { useMemo, useState } from "react";
import { Icon } from "../components/ui/icon/Icons";
import { type ChangeLine, changeLines } from "../controllers/views";
import { useStudio, useStudioState } from "../providers/studio-context";

export function ChangeBar() {
    const studio = useStudio();
    const changes = useStudioState((state) => state.changes);
    const lines = useMemo(() => changeLines(changes), [changes]);
    const [open, setOpen] = useState(false);
    const count = lines.length;

    return (
        <div className="change-bar">
            {open && count > 0 && (
                <ul>
                    {lines.map((line) => (
                        <li key={`${line.kind} ${line.from} ${line.path} ${line.inPermutations}`}>
                            <Line line={line} />
                        </li>
                    ))}
                </ul>
            )}
            <div
                className="inspector-actions repel"
                role="toolbar"
                aria-label="Pending changes actions"
            >
                <button
                    type="button"
                    className="button inspector-actions-trigger"
                    disabled={count === 0}
                    aria-expanded={open && count > 0}
                    onClick={() => setOpen((was) => !was)}
                >
                    <span className="tabular-nums">{count}</span>
                    <span className="text-quiet">{count === 1 ? "change" : "changes"}</span>
                    <Icon name="caret-sort" className="inspector-actions-trigger-icon" />
                </button>
                <div className="cluster" data-cluster-wrap="nowrap">
                    <button
                        type="button"
                        className="button"
                        data-role="tertiary"
                        disabled={count === 0}
                        onClick={() => studio.discard()}
                    >
                        Discard
                    </button>
                    <button type="button" className="button" data-role="primary" disabled>
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

function Line({ line }: { line: ChangeLine }) {
    const theme = line.inPermutations && ` (${line.inPermutations})`;
    if (line.kind === "renamed" || line.kind === "group-renamed") {
        return (
            <>
                <code>{line.from}</code> renamed to <code>{line.path}</code>
                {theme}
            </>
        );
    }
    return (
        <>
            {line.path ? <code>{line.path}</code> : "Top level"} {doneWord[line.kind]}
            {theme}
        </>
    );
}

const doneWord: Record<Exclude<ChangeLine["kind"], "renamed" | "group-renamed">, string> = {
    "added": "added",
    "removed": "removed",
    "changed": "changed",
    "group-added": "added",
    "group-removed": "removed",
    "group-changed": "changed",
    "top-level-changed": "changed",
};
