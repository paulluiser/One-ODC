export type FilterOption = { value: string; label: string };
export type FilterField = {
  key: string;
  label: string;
  type?: "select" | "date" | "month";
  options?: FilterOption[];
  defaultValue?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  hint?: string;
};
export type FilterConfig = {
  label: string;
  search?: { key: string; placeholder: string; label?: string };
  sort?: {
    key: string;
    label?: string;
    options: FilterOption[];
    defaultValue: string;
  };
  fields: FilterField[];
  presets?: { label: string; values: Record<string, string> }[];
  paginationKeys?: string[];
};
export const filterOptions = (values: readonly string[]): FilterOption[] =>
  values.map((value) => ({ value, label: value }));
export type ToolbarQuery = Record<string, string | string[] | undefined>;
export function toolbarChoice(
  query: ToolbarQuery,
  key: string,
  choices: readonly string[],
  fallback = "",
) {
  const value = toolbarText(query, key);
  return choices.includes(value) ? value : fallback;
}
export function validateToolbarValues(
  config: FilterConfig,
  values: Record<string, string>,
) {
  const errors: Record<string, string> = {};
  for (const field of config.fields) {
    if (field.disabled) continue;
    const value = values[field.key] ?? field.defaultValue ?? "";
    if (field.type === "date" || field.type === "month") {
      const pattern =
        field.type === "month"
          ? /^\d{4}-(0[1-9]|1[0-2])$/
          : /^\d{4}-\d{2}-\d{2}$/;
      if (!value && field.defaultValue)
        errors[field.key] = `Choose ${field.label.toLowerCase()}.`;
      if (
        value &&
        (!pattern.test(value) ||
          (field.type === "date" &&
            (Number.isNaN(Date.parse(value)) ||
              new Date(value).toISOString().slice(0, 10) !== value)))
      )
        errors[field.key] = "Choose a valid calendar date.";
      if (
        value &&
        ((field.min && value < field.min) || (field.max && value > field.max))
      )
        errors[field.key] = "Choose a date within the allowed range.";
    } else if (
      field.options &&
      !field.options.some((option) => option.value === value)
    )
      errors[field.key] = `Choose a valid ${field.label.toLowerCase()}.`;
  }
  if (values.from && values.to && values.from > values.to)
    errors.to = "End date must be on or after the start date.";
  return errors;
}
export const toolbarText = (query: ToolbarQuery, key: string) =>
  typeof query[key] === "string" ? query[key].trim().slice(0, 200) : "";
export function activeToolbarFilters(
  config: FilterConfig,
  values: Record<string, string>,
) {
  return config.fields
    .filter(
      (field) =>
        !field.disabled &&
        (values[field.key] ?? field.defaultValue ?? "") !==
          (field.defaultValue ?? "") &&
        !!values[field.key],
    )
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: values[field.key],
      display:
        field.options?.find((option) => option.value === values[field.key])
          ?.label ?? values[field.key],
    }));
}
export function toolbarUrl(
  path: string,
  current: string,
  config: FilterConfig,
  values: Record<string, string>,
) {
  const params = new URLSearchParams(current);
  for (const key of config.paginationKeys ?? ["page", "offset"])
    params.delete(key);
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return path + (params.size ? `?${params}` : "");
}
export function clearToolbarFilters(
  config: FilterConfig,
  values: Record<string, string>,
  key?: string,
) {
  return {
    ...values,
    ...Object.fromEntries(
      config.fields
        .filter((field) => !key || field.key === key)
        .map((field) => [field.key, field.defaultValue ?? ""]),
    ),
  };
}

// A second interaction may happen before the first server navigation resolves.
// Apply only its changes, so a sort/search cannot restore a just-cleared filter.
export function mergePendingToolbarValues(
  previous: Record<string, string>,
  pending: Record<string, string>,
  next: Record<string, string>,
) {
  return {
    ...pending,
    ...Object.fromEntries(
      Object.entries(next).filter(([key, value]) => value !== previous[key]),
    ),
  };
}
