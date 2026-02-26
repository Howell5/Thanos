/**
 * Session-scoped short ref aliases for shape IDs.
 *
 * list_shapes assigns refs like "s1", "s2", ... to each shape.
 * All other tools accept either a ref or a full tldraw shape ID.
 * The ref map is refreshed each time list_shapes is called.
 */

export class ShapeRefMap {
  /** ref → full tldraw ID (e.g. "s1" → "shape:b941a1f884f8") */
  private refToId = new Map<string, string>();
  /** full tldraw ID → ref (reverse lookup for output) */
  private idToRef = new Map<string, string>();
  private counter = 0;

  /**
   * Clear all existing refs and assign new ones from a list of shape IDs.
   * Called by list_shapes after filtering/sorting.
   */
  assign(shapeIds: string[]): void {
    this.refToId.clear();
    this.idToRef.clear();
    this.counter = 0;

    for (const id of shapeIds) {
      const ref = `s${++this.counter}`;
      this.refToId.set(ref, id);
      this.idToRef.set(id, ref);
    }
  }

  /**
   * Resolve a ref or raw shape ID to a full tldraw shape ID.
   * Accepts: "s1" (ref), "shape:abc123" (full ID), or "abc123" (bare ID → prepends "shape:").
   */
  resolve(input: string): string {
    // Check ref map first
    const fromRef = this.refToId.get(input);
    if (fromRef) return fromRef;

    // Already a full shape ID
    if (input.startsWith("shape:")) return input;

    // Bare ID without prefix — try as ref one more time, then assume it's a bare tldraw ID
    return `shape:${input}`;
  }

  /**
   * Resolve an array of refs/IDs, returning full tldraw IDs.
   */
  resolveAll(inputs: string[]): string[] {
    return inputs.map((input) => this.resolve(input));
  }

  /**
   * Get the short ref for a full shape ID, or null if not assigned.
   */
  getRef(shapeId: string): string | null {
    return this.idToRef.get(shapeId) ?? null;
  }

  get size(): number {
    return this.refToId.size;
  }
}
