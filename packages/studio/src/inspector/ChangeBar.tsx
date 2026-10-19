import { Icon } from "../components/ui/icon/Icons";
import { useStudioState } from "../providers/studio-context";

export function ChangeBar() {
    const count = useStudioState((state) => state.changes);

    return (
        <div className="change-bar">
            <div
                className="inspector-actions repel"
                role="toolbar"
                aria-label="Pending changes actions"
            >
                <button type="button" className="button inspector-actions-trigger" disabled>
                    <span className="tabular-nums">{count}</span>
                    <span className="text-quiet">{count === 1 ? "change" : "changes"}</span>
                    <Icon name="caret-sort" className="inspector-actions-trigger-icon" />
                </button>
                <div className="cluster" data-cluster-wrap="nowrap">
                    <button type="button" className="button" data-role="tertiary" disabled>
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
