#!/usr/bin/env npx tsx
import fs from "node:fs";
import path from "node:path";

const MAX_LINES = 500;
const EXTENSIONS = [".ts", ".tsx"];
const EXCLUDE_DIRS = ["node_modules", "dist", ".git", ".turbo", "coverage"];
const EXCLUDE_PATTERNS = [".d.ts"];

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const isExcluded = EXCLUDE_PATTERNS.some((p) => entry.name.endsWith(p));

        if (EXTENSIONS.includes(ext) && !isExcluded) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n").length;
}

function main() {
  const rootDir = process.cwd();
  const files = getAllFiles(rootDir);
  const violations: Array<{ file: string; lines: number }> = [];

  for (const file of files) {
    const lines = countLines(file);
    if (lines > MAX_LINES) {
      violations.push({ file: path.relative(rootDir, file), lines });
    }
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} file(s) exceed ${MAX_LINES} line limit:\n`);
    for (const { file, lines } of violations.sort((a, b) => b.lines - a.lines)) {
      console.error(`  ${file}: ${lines} lines`);
    }
    process.exit(1);
  }

  console.log(`✅ All ${files.length} files are within ${MAX_LINES} line limit`);
}

main();
