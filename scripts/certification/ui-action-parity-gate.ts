import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

interface Finding { file: string; line: number; kind: string; detail: string; }

const root = path.resolve(process.cwd(), "apps/web/src");
const files: string[] = [];
function walk(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|jsx)$/.test(entry.name)) files.push(full);
  }
}
walk(root);

let buttons = 0;
let actionable = 0;
let disabled = 0;
const unbound: Finding[] = [];
const suspicious: Finding[] = [];

function hasProp(attrs: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*=`).test(attrs);
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node: ts.Node, ancestors: ts.Node[]): void {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (opening.tagName.getText(sf) === "button") {
        buttons += 1;
        const attrs = opening.attributes.properties.map((p) => p.getText(sf)).join(" ");
        if (/\bdisabled(?:\s*=|\s|$)/.test(attrs)) disabled += 1;

        const insideSubmitForm = ancestors.some((ancestor) => {
          if (!ts.isJsxElement(ancestor) || ancestor.openingElement.tagName.getText(sf) !== "form") return false;
          return ancestor.openingElement.attributes.properties.some((p) => p.getText(sf).startsWith("onSubmit="));
        });

        const line = sf.getLineAndCharacterOfPosition(opening.getStart(sf)).line + 1;
        const fileRef = path.relative(process.cwd(), file).replace(/\\/g, "/");
        const displayOnlyDisabled = /\bdisabled(?:\s*=|\s|$)/.test(attrs) && /data-governance\s*=\s*["']display["']/.test(attrs);
        const propForwardingWrapper = fileRef === "apps/web/src/components/UI/Button.tsx" && /\{\.\.\.props\}/.test(attrs);
        const actionBound =
          hasProp(attrs, "onClick") ||
          hasProp(attrs, "onClickCapture") ||
          hasProp(attrs, "onMouseDown") ||
          hasProp(attrs, "formAction") ||
          /\btype\s*=\s*["']submit["']/.test(attrs) ||
          insideSubmitForm ||
          displayOnlyDisabled ||
          propForwardingWrapper;

        if (!actionBound) {
          unbound.push({ file: fileRef, line, kind: "UNBOUND", detail: opening.getText(sf).slice(0, 240) });
        } else {
          actionable += 1;
          const handler = opening.attributes.properties.find((p) => /\bonClick(?:Capture)?\s*=/.test(p.getText(sf)));
          if (handler) {
            const text = handler.getText(sf).replace(/\s+/g, " ");
            if (/=>\s*\{?\s*\}?\s*$/.test(text) || /=>\s*(undefined|null)\s*$/.test(text)) {
              suspicious.push({ file: fileRef, line, kind: "NOOP_HANDLER", detail: text.slice(0, 240) });
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
  }

  visit(sf, []);
}

const result = {
  generatedAt: new Date().toISOString(),
  sourceRoot: root,
  sourceFiles: files.length,
  buttons,
  actionable,
  unboundCount: unbound.length,
  disabledControls: disabled,
  suspiciousHandlerCount: suspicious.length,
  unbound,
  suspicious,
  status: unbound.length === 0 && suspicious.length === 0 ? "PASS" : "FAIL",
};

const outDir = path.resolve(process.cwd(), "artifacts/ui-orphan-audit");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "ui-action-parity-gate.json"), JSON.stringify(result, null, 2));

console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exit(1);
