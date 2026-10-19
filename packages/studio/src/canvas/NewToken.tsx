import type { Group, TokenType } from "@sugarcube-sh/dtcg";
import { create } from "@sugarcube-sh/dtcg-edit";
import { tokenTypes } from "@sugarcube-sh/dtcg/values";
import { useId, useState } from "react";
import { newToken, parsedJson } from "../controllers/token-page";
import { useStudio } from "../providers/studio-context";
import { JsonInput } from "./JsonInput";
import { useEdit } from "./use-edit";

export function NewToken({ group }: { group: Group }) {
    const studio = useStudio();
    const edit = useEdit();
    const [name, setName] = useState("");
    const [type, setType] = useState<TokenType>(group.type ?? "color");
    const [value, setValue] = useState("");
    const parsed = parsedJson(value);
    const valueId = useId();

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                if (!parsed) return;
                const made = edit.run(
                    create(
                        studio.state.tokens,
                        `${group.path}.${name}`,
                        newToken({ type, value: parsed.value }, group),
                    ),
                );
                if (made) {
                    setName("");
                    setValue("");
                }
            }}
        >
            <h2>New token</h2>
            <label>
                Name <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>{" "}
            <label>
                Type{" "}
                <select
                    value={type}
                    onChange={(event) =>
                        setType(tokenTypes.find((each) => each === event.target.value) ?? type)
                    }
                >
                    {tokenTypes.map((each) => (
                        <option key={each} value={each}>
                            {each}
                        </option>
                    ))}
                </select>
            </label>{" "}
            <label htmlFor={valueId}>Value</label>{" "}
            <JsonInput id={valueId} text={value} onText={setValue} />{" "}
            <button type="submit" disabled={name === "" || !parsed}>
                Add
            </button>
            {edit.view}
        </form>
    );
}
