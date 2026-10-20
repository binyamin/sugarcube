export function Choice<C extends string>({
    label,
    chosen,
    choices,
    names,
    onChoose,
}: {
    label: string;
    chosen: string;
    choices: readonly C[];
    names?: Partial<Record<C, string>>;
    onChoose(choice: C): void;
}) {
    return (
        <select
            aria-label={label}
            value={chosen}
            onChange={(event) => {
                const choice = choices.find((each) => each === event.target.value);
                if (choice !== undefined) onChoose(choice);
            }}
        >
            {chosen === "" && <option value="">Choose</option>}
            {choices.map((each) => (
                <option key={each} value={each}>
                    {names?.[each] ?? each}
                </option>
            ))}
        </select>
    );
}
