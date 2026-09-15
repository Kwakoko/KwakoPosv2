import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("apps/web/src");
const evidencePath = path.resolve("artifacts/ui-orphan-audit/action-service-parity-gate.json");
const files: string[] = [];

function walk(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
}
walk(root);

const mutationVerb = /\b(record|dispose|dispense|payment|save settings|record issue|record fueling)\b/i;
const serviceEvidence = /(?:apiFetch\s*\(|fetch\s*\(|db\.(?:enqueueOutbox|save[A-Z]|delete[A-Z]|persist)|recordLawFirmPayment\s*\(|saveLawFirmSettings\s*\(|dispensePharmacyMedicine\s*\(|persistPharmacyBatchAction\s*\(|persistFleetFueling\s*\(|\b\w*Service\.)/i;

interface Finding {
  file: string;
  line: number;
  label: string;
  actionId: string;
  handler: string;
  status: "PASS" | "FAIL";
  reason?: string;
}

const findings: Finding[] = [];
let buttons = 0;
let stateChanging = 0;
function getTagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  return ts.isJsxElement(node) ? node.openingElement.tagName.getText() : node.tagName.getText();
}

function getProps(node: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxAttributeLike[] {
  return ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
}

function attr(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string): ts.JsxAttribute | undefined {
  return getProps(node).find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.text === name);
}

function textOf(node: ts.Node): string {
  return node.getText().replace(/\s+/g, " ").trim();
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  function visit(node: ts.Node): void {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (getTagName(node) === "button") {
        buttons += 1;
        const action = attr(node, "data-action-id");
        const handler = attr(node, "onClick") || attr(node, "onClickCapture") || attr(node, "onMouseDown");
        if (action?.initializer && ts.isStringLiteral(action.initializer)) {
          const label = textOf(node);
          if (mutationVerb.test(label)) {
            stateChanging += 1;
            const handlerText = handler?.initializer?.getText() || "";
            const passed = serviceEvidence.test(handlerText);
            const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            findings.push({
              file: path.relative(process.cwd(), file),
              line: pos.line + 1,
              label,
              actionId: action.initializer.text,
              handler: handlerText,
              status: passed ? "PASS" : "FAIL",
              ...(passed ? {} : { reason: "True state-changing UI action has no service/domain/persistence invocation." }),
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
}
const failures = findings.filter((x) => x.status === "FAIL");
const result = {
  generatedAt: new Date().toISOString(),
  sourceRoot: root,
  sourceFiles: files.length,
  buttons,
  stateChanging,
  checked: findings.length,
  passed: findings.length - failures.length,
  failed: failures.length,
  status: failures.length === 0 ? "PASS" : "FAIL",
  findings,
};

fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
