import { execFileSync } from "child_process";
import { resolve } from "path";

export function compileCircuit(projectDir: string, projectRoot: string): void {
  const dir = resolve(projectRoot, projectDir);
  console.log(`Compiling circuit: ${projectDir}...`);
  execFileSync("nargo", ["compile"], {
    cwd: dir,
    stdio: "inherit",
  });
  console.log("Compilation complete.");
}
