import { nanoid } from "nanoid";
import type { IdGen } from "./id-gen.js";

/** Real {@link IdGen}: `<prefix>_<nanoid>`. */
export class NanoidGen implements IdGen {
  next(prefix: string): string {
    return `${prefix}_${nanoid()}`;
  }
}
