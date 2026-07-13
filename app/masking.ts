export function maskName(value: string | null) {
  if (!value) return "미등록";
  if (value.length === 1) return "*";
  if (value.length === 2) return `${value[0]}*`;
  return `${value[0]}${"*".repeat(value.length - 2)}${value[value.length - 1]}`;
}

export function maskPlate(value: string | null) {
  if (!value) return "미등록";
  const compact = value.replace(/\s/g, "");
  if (compact.length <= 4) return `${compact.slice(0, 1)}**${compact.slice(-1)}`;
  return `${compact.slice(0, 3)}${"*".repeat(Math.max(2, compact.length - 5))}${compact.slice(-2)}`;
}
