/** Deep equality for plain JSON values (objects, arrays, primitives); strings of equal content are equal whatever their identity. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false
  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}
