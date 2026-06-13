import { nanoid } from "nanoid";
import type { IdGen } from "./id-gen.js";

/**
 * Real {@link IdGen}: `<prefix>_<nanoid>`. nanoid's default 21-char alphabet is
 * URL-safe and collision-resistant enough for our id space (see TECH.md data
 * model: `id = 'post_' + nanoid`).
 */
export class NanoidGen implements IdGen {
  next(prefix: string): string {
    return `${prefix}_${nanoid()}`;
  }
}
