/**
 * Joins conditional class names into one attribute value.
 *
 * Conditional UI states pass `false`, `null` or `undefined` for classes that do
 * not apply, so a class list never carries two values that set the same
 * property — the stylesheet order would otherwise decide, not the intent.
 */

export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  const classes: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      classes.push(value);
    }
  }
  return classes.join(" ");
}
