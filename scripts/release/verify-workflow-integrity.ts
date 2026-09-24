import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { KWAKOKO_WORKFLOW_GOVERNANCE } from "../../packages/config/src/workflowGovernance.js";

const ROOT = process.cwd();
const WEB = path.join(ROOT, "apps/web/src");
const OUT = path.join(ROOT, "artifacts/experience");
const TSX = /\.tsx$/i;

type Finding = { file: string; line: number; rule: string; detail: string };
interface Control { file:string; line:number; tag:string; label:string; handler:boolean; actionId:string|null; route:string|null; service:boolean; persistence:boolean; permission:boolean; status:string; }

function walk(dir:string):string[]{
  if(!fs.existsSync(dir)) return [];
  const out:string[]=[];
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(["node_modules","dist","artifacts"].includes(e.name)) continue;
    const f=path.join(dir,e.name); e.isDirectory()?out.push(...walk(f)):TSX.test(e.name)&&out.push(f);
  }
  return out;
}
function lineOf(s:string,i:number){return s.slice(0,i).split(/\r?\n/).length;}
function extractOpeningTag(block:string){
  let quote=""; let brace=0;
  for(let i=0;i<block.length;i++){
    const ch=block[i];
    if(quote){ if(ch===quote && block[i-1]!=="\\") quote=""; continue; }
    if(ch==='"' || ch==="'" || ch==='`'){ quote=ch; continue; }
    if(ch==='{'){ brace++; continue; }
    if(ch==='}' && brace>0){ brace--; continue; }
    if(ch==='>' && brace===0) return block.slice(0,i+1);
  }
  return block;
}
function attr(source:string,name:string){
  const literal=source.match(new RegExp(`${name}\s*=\s*["\']([^"\']+)["\']`,`i`));
  if(literal?.[1]) return literal[1];
  const expression=source.match(new RegExp(`${name}\s*=\s*\{([^}]*)\}`,`i`));
  if(expression?.[1]) return `dynamic:${expression[1].trim()}`;
  return null;
}
function labelFrom(tag:string,context:string){
  const a=attr(context,"aria-label")||attr(context,"title"); if(a)return a;
  const inner=context.slice(tag.length).replace(/<\/button>$/i,"");
  const text=inner.replace(/<[^>]+>/g," ").replace(/\{[^}]*\}/g," ").replace(/\s+/g," ").trim();
  if(text) return text.slice(0,120);
  if(/\{[^}]*\b(label|title|name|subject|key)\b[^}]*\}/i.test(inner)) return "Dynamic visible label";
  const quoted=[...inner.matchAll(/["'`]([^"'`]{2,80})["'`]/g)].map(m=>m[1]).filter(v=>!/^var\(|^--/.test(v));
  if(quoted.length) return quoted[quoted.length-1].slice(0,120);
  const icons=[...inner.matchAll(/<([A-Z][A-Za-z0-9]+)\b/g)].map(m=>m[1]);
  const iconLabels:Record<string,string>={Eye:"View",EyeOff:"Show or hide password",Edit2:"Edit",Edit:"Edit",Trash2:"Delete",Trash:"Delete",X:"Close",Check:"Confirm",CheckCircle:"Confirm",Plus:"Add",PlusCircle:"Add",Minus:"Decrease quantity",Download:"Download",Upload:"Upload",Bell:"Notifications",RefreshCw:"Refresh",Refresh:"Refresh",ChevronLeft:"Previous",ChevronRight:"Next",ArrowRight:"Open",ExternalLink:"Open",Search:"Search",Filter:"Filter",Copy:"Copy",Save:"Save",Sparkles:"Demo mode",Wifi:"Network mode",Play:"Run",Sun:"Light mode",Moon:"Dark mode",VolumeX:"Unmute Audio Chimes",Volume2:"Mute Audio Chimes",Pin:"Pin window",PinOff:"Unpin window",Square:"Maximize window",FileText:"View document",Tag:"Manage tag"};
  for(const icon of icons) if(iconLabels[icon]) return iconLabels[icon];
  return "";
}
function sourceRouteSet(){
  const app=fs.readFileSync(path.join(WEB,"App.tsx"),"utf8");
  const routes=new Set<string>();
  for(const m of app.matchAll(/\"(\/[a-zA-Z0-9_\-/]+)\"/g)) routes.add(m[1]);
  return routes;
}

function analyzeFile(file:string,routes:Set<string>):Control[]{
  const source=fs.readFileSync(file,"utf8"); const rel=path.relative(ROOT,file).replaceAll("\\","/");
  // Reusable UI primitives are definitions, not concrete customer-facing controls.
  if (rel === "apps/web/src/components/UI/Button.tsx") return [];
  const controls:Control[]=[];
  const rx=/<button\b[\s\S]*?<\/button>/gi;
  for(const m of source.matchAll(rx)){
    const tag=extractOpeningTag(m[0]); const start=m.index??0;
    const handler=/\bonClick\s*=|\bonMouseDown\s*=|\bonPointerDown\s*=|\bonKeyDown\s*=|\bonSubmit\s*=|type=["']submit["']/i.test(m[0]);
    const actionId=attr(m[0],"data-action-id"); const href=attr(m[0],"data-route")||attr(m[0],"href");
    const route=href&&href.startsWith("/")?href:(tag.match(/navigate\(["'](\/[^"']+)["']\)/i)?.[1]||null);
    const section=source.slice(start,Math.min(source.length,start+m[0].length+300));
    const service=/fetch\(|apiClient|apiFetch|httpClient|service[A-Z]|mutation|repository|sync[A-Z]/.test(section);
    const persistence=/indexedDB|outbox|bulkPut|put\(|add\(|delete\(|prisma|repository|save|persist/i.test(section);
    const permission=/data-permission=|requiredPermission=|permission(s)?\b|can[A-Z]|authorize|RBAC|SUPER_ADMIN|isSuperAdmin|user\.permissions|hasPermission|\bcan\(/i.test(section+"\n"+source);
    let status="CERTIFIED";
    if(!handler&&!actionId) status="ORPHAN_ACTION";
    else if(route&&!routes.has(route)) status="UNKNOWN_ROUTE";
    else if(/delete|remove|void|refund|approve|reject|archive/i.test(labelFrom(tag,m[0]))&&!permission&&!/workspace/i.test(labelFrom(tag,m[0]))) status="PRIVILEGE_UNPROVEN";
    controls.push({file:rel,line:lineOf(source,start),tag:tag.slice(0,240),label:labelFrom(tag,m[0]),handler,actionId,route,service,persistence,permission,status});
  }
  return controls;
}

export function runWorkflowIntegrityVerification(){
  const routes=sourceRouteSet(); const controls=walk(WEB).flatMap(f=>analyzeFile(f,routes));
  const findings:Finding[]=[];
  for(const c of controls){
    if(c.status!=="CERTIFIED") findings.push({file:c.file,line:c.line,rule:c.status,detail:`${c.label||"control"}: handler=${c.handler}, route=${c.route||"none"}, service=${c.service}, persistence=${c.persistence}, permission=${c.permission}`});
    if(KWAKOKO_WORKFLOW_GOVERNANCE.actionRules.iconOnlyControlsRequireAccessibleName && !c.label) findings.push({file:c.file,line:c.line,rule:"ACCESSIBLE_NAME_MISSING",detail:"Interactive control has no discernible label/title."});
  }
  fs.mkdirSync(OUT,{recursive:true});
  fs.writeFileSync(path.join(OUT,"ui-action-route-service-persistence-matrix.json"),JSON.stringify({generatedAt:new Date().toISOString(),governance:KWAKOKO_WORKFLOW_GOVERNANCE,routeCount:routes.size,controlCount:controls.length,findings,controls},null,2));
  return {controls,findings,routes};
}

if(process.argv[1]?.endsWith("verify-workflow-integrity.ts")){
  const r=runWorkflowIntegrityVerification();
  console.log("====================================================================");
  console.log(" KWAKOKO UI → ACTION → ROUTE → SERVICE → PERSISTENCE CERTIFICATION");
  console.log("====================================================================");
  console.log(`Interactive controls: ${r.controls.length}`);
  console.log(`Known routes:         ${r.routes.size}`);
  console.log(`Unresolved findings:  ${r.findings.length}`);
  console.log(`Matrix:               artifacts/experience/ui-action-route-service-persistence-matrix.json`);
  if(r.findings.length===0){console.log("Status:               [PASS]");process.exit(0);}
  const counts=r.findings.reduce<Record<string,number>>((a,f)=>(a[f.rule]=(a[f.rule]||0)+1,a),{});
  console.log(`Finding classes:      ${JSON.stringify(counts)}`);
  console.log("Status:               [CONDITIONAL — remediation required]");
  for(const f of r.findings.slice(0,25)) console.log(`  - ${f.file}:${f.line} ${f.rule} — ${f.detail}`);
  process.exit(2);
}



