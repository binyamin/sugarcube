import { useStudio, useStudioState } from "../providers/studio-context";

export function Showing() {
    const studio = useStudio();
    const tokens = useStudioState((state) => state.tokens);
    const showing = useStudioState((state) => state.showing);

    if (tokens.permutations.length < 2) return null;

    return (
        <p>
            <label>
                Showing{" "}
                <select
                    value={tokens.permutations.indexOf(showing)}
                    onChange={(event) => {
                        const chosen = tokens.permutations[Number(event.target.value)];
                        if (chosen) studio.show(chosen.input);
                    }}
                >
                    {tokens.permutations.map((permutation, index) => (
                        <option key={permutation.label} value={index}>
                            {permutation.label}
                        </option>
                    ))}
                </select>
            </label>
        </p>
    );
}
