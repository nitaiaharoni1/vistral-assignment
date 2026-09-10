import { Injectable } from "@nestjs/common";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { rename } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(process.env.PAPERPLAY_DIR || ".paperplay");
let writes = Promise.resolve();

@Injectable()
export class StorageService {
  // Reads a JSON file or returns the fallback.
  public async load<T>(name: string, fallback: T): Promise<T> {
    return readFile(resolve(directory, name), "utf8")
      .then(JSON.parse)
      .catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return fallback;
      });
  }

  // Writes JSON atomically, one file at a time.
  public persist(name: string, value: unknown): Promise<void> {
    const filename = resolve(directory, name);
    const json = JSON.stringify(value);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(filename + ".tmp", json, { mode: 0o600 });
        await rename(filename + ".tmp", filename);
      });
    return writes;
  }
}
