import {
  fillOptionText,
  type CompileStepOption,
} from "src/compile/steps/abstract-compile-step";
import {
  formatAside,
  templateLabel,
  type PandocTemplateChoice,
} from "src/model/pandoc-templates-utils";

/**
 * How a compile step's option is presented right now: whether another option is
 * currently overriding it, what description to show, and what a dropdown's
 * entries are called.
 *
 * Lives apart from the two components that render options — the classic compile
 * pane (`CompileStepView.svelte`) and the matrix step editor
 * (`compile-matrix/CompileMatrix.svelte`) — because both must agree, and because
 * that is what makes the rules testable without mounting Svelte.
 */

/** One entry of a Dropdown option: the value stored, and what the user reads. */
export interface DropdownChoice {
  value: string;
  label: string;
}

/**
 * Whether `option` is currently overridden by the option it declares as
 * `disabledBy`. A whitespace-only value doesn't count — the steps themselves
 * trim before deciding (see `resolveBuiltinFormat`).
 */
export function optionIsInert(
  option: CompileStepOption,
  optionValues: Record<string, unknown>
): boolean {
  return overridingValue(option, optionValues) !== null;
}

/**
 * The description to show under `option`: its `disabledDescription` while it is
 * overridden, otherwise its own.
 *
 * `templates` answers the `{format}` placeholder — a preset that overrides the
 * Format option should say *which* format it imposes, and only the preset list
 * knows that. Absent or unreadable, the sentence simply omits the aside.
 */
export function optionDescription(
  option: CompileStepOption,
  optionValues: Record<string, unknown>,
  templates: PandocTemplateChoice[] = []
): string {
  const value = overridingValue(option, optionValues);
  if (value === null || !option.disabledDescription) return option.description;
  const ext = templates.find((t) => t.name === value)?.ext ?? "";
  return fillOptionText(option.disabledDescription, {
    value,
    format: formatAside(ext),
  });
}

/** The trimmed value of the option overriding this one, or null if none does. */
function overridingValue(
  option: CompileStepOption,
  optionValues: Record<string, unknown>
): string | null {
  if (!option.disabledBy) return null;
  const raw = optionValues[option.disabledBy];
  // Every option that can override one today is a text field or a dropdown, so a
  // non-string value means the step declared a `disabledBy` it shouldn't have.
  const value = typeof raw === "string" ? raw.trim() : "";
  return value ? value : null;
}

/**
 * The entries of a Dropdown option. Static `choices` are their own labels;
 * `dynamicChoices: "pandoc-templates"` resolves to the downloaded presets, each
 * labelled with the format it exports to — the answer to "which of these gives
 * me a Word file?", which otherwise means opening the preset's yaml.
 */
export function dropdownChoices(
  option: CompileStepOption,
  templates: PandocTemplateChoice[]
): DropdownChoice[] {
  if (option.dynamicChoices === "pandoc-templates") {
    return templates.map((t) => ({ value: t.name, label: templateLabel(t) }));
  }
  return (option.choices ?? []).map((c) => ({ value: c, label: c }));
}
