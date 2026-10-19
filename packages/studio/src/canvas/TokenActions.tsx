import { type OpResult, remove, rename } from "@sugarcube-sh/dtcg-edit";
import { useState } from "react";
import { useStudio } from "../providers/studio-context";
import { useEdit } from "./use-edit";

export function TokenActions({ path }: { path: string }) {
    const studio = useStudio();
    const edit = useEdit();
    const [name, setName] = useState(path.slice(path.lastIndexOf(".") + 1));
    const [breaking, setBreaking] = useState<{ result: OpResult; broken: readonly string[] }>();

    return (
        <>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    edit.run(rename(studio.state.tokens, path, name));
                }}
            >
                <label>
                    Name <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>{" "}
                <button type="submit">Rename</button>
            </form>
            {breaking ? (
                <p>
                    Breaks{" "}
                    {breaking.broken.map((each, index) => (
                        <span key={each}>
                            {index > 0 && ", "}
                            <code>{each}</code>
                        </span>
                    ))}
                    .{" "}
                    <button type="button" onClick={() => edit.run(breaking.result)}>
                        Remove anyway
                    </button>{" "}
                    <button type="button" onClick={() => setBreaking(undefined)}>
                        Cancel
                    </button>
                </p>
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        const result = remove(studio.state.tokens, path);
                        const broken = (result.ops && result.broken) || [];
                        if (broken.length > 0) setBreaking({ result, broken });
                        else edit.run(result);
                    }}
                >
                    Remove
                </button>
            )}
            {edit.view}
        </>
    );
}
