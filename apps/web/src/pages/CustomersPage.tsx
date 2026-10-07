import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Users, User, Phone, Mail, Search, Edit2, Trash2, UserPlus, Eye, History, Contact as ContactIcon, RefreshCw, Download, Upload, X, AlertCircle } from "lucide-react";
import { useModule, useSync, useTenant, useBranch } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/applicationApiService.js";
import { useToast } from "../context/ToastContext.js";
import { commitLocalMutation } from "../persistence/commitLocalMutation.js";
import { DATA_CHANGED_EVENT } from "../services/dataChangeEvent.js";

type CustomerRecord = {
  id: string; tenantId: string; branchId: string; customerCode: string; name: string;
  phone: string; email: string; address: string; creditLimit: number; currentBalance: number;
  openingBalance: number; status: string; createdAt?: string; updatedAt?: string;
};

type ContactRecord = {
  id: string; customerId: string; tenantId: string; branchId: string; firstName: string; lastName: string;
  title: string; role: string; department: string; phone: string; email: string; isPrimary: boolean;
  decisionInfluence: string; notes: string; status: "ACTIVE" | "INACTIVE"; createdAt?: string; updatedAt?: string;
};

const money = (n: unknown) => `Tsh ${Math.round(Number(n || 0)).toLocaleString()}`;
const uuid = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!bytes) throw new Error("UUID_GENERATION_UNAVAILABLE");
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};

const fromCustomer = (c: any, tenantId: string, branchId: string): CustomerRecord => ({
  id: String(c.id), tenantId: String(c.tenantId || tenantId), branchId: String(c.branchId || branchId),
  customerCode: String(c.customerCode || `CUST-${String(c.id).slice(0,8).toUpperCase()}`),
  name: String(c.name || ""), phone: String(c.phone || ""), email: String(c.email || ""),
  address: String(c.address || ""), creditLimit: Number(c.creditLimit || 0),
  currentBalance: Number(c.currentBalance ?? c.outstandingBalance ?? 0), openingBalance: Number(c.openingBalance || 0),
  status: String(c.status || "ACTIVE"), createdAt: c.createdAt ? String(c.createdAt) : undefined,
  updatedAt: c.updatedAt ? String(c.updatedAt) : undefined,
});

function csvLine(text: string): string[] {
  const out: string[] = []; let buf = ""; let q = false;
  for (let i=0;i<text.length;i++) { const ch=text[i]; if (ch === '"' && text[i+1] === '"') { buf += '"'; i++; continue; } if (ch === '"') { q=!q; continue; } if (ch === "," && !q) { out.push(buf); buf=""; } else buf += ch; } out.push(buf); return out;
}
function parseCsv(text: string): Record<string,string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
  const heads = csvLine(lines[0]).map((x)=>x.trim());
  return lines.slice(1).map((line)=>Object.fromEntries(heads.map((h,i)=>[h,String(csvLine(line)[i] || "").trim()])));
}

export const CustomersPage: React.FC = () => {
  const { activeModule } = useModule();
  const { db, isOnline, pendingOutboxCount, syncOutbox } = useSync();
  const { currentTenantId } = useTenant();
  const { currentBranchId } = useBranch();
  const toast = useToast();
  const noun = activeModule === "Pharmacy" ? "Patient" : activeModule === "SACCO" ? "Member" : activeModule === "Law" ? "Client" : "Customer";

  const [customers,setCustomers] = useState<CustomerRecord[]>([]);
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState(true);
  const [selected,setSelected] = useState<CustomerRecord|null>(null);
  const [history,setHistory] = useState<any|null>(null);
  const [contacts,setContacts] = useState<ContactRecord[]>([]);
  const [contactSearch,setContactSearch] = useState("");
  const [contactResults,setContactResults] = useState<ContactRecord[]>([]);
  const [formOpen,setFormOpen] = useState(false);
  const [formMode,setFormMode] = useState<"CREATE"|"EDIT">("CREATE");
  const [form,setForm] = useState({name:"",phone:"",email:"",address:"",creditLimit:0});
  const [paymentOpen,setPaymentOpen] = useState(false);
  const [paymentAmount,setPaymentAmount] = useState(0);
  const [paymentMethod,setPaymentMethod] = useState("BANK");
  const [contactOpen,setContactOpen] = useState(false);
  const [editingContact,setEditingContact] = useState<ContactRecord|null>(null);
  const [contactForm,setContactForm] = useState({
    firstName:"",lastName:"",title:"",role:"",department:"",phone:"",email:"",isPrimary:false,
    decisionInfluence:"INFLUENCER",notes:""
  });

  const loadCustomers = useCallback(async () => {
    setBusy(true);
    try {
      let rows: CustomerRecord[] = [];
      try {
        const r = await apiFetch<any>("/api/v1/customers");
        if (r?.success && Array.isArray(r.data)) rows = r.data.map((c:any)=>fromCustomer(c,currentTenantId||"",currentBranchId||""));
      } catch {}
      if (!rows.length) {
        await db.ready;
        rows = Array.from(db.customers.values()).filter((c:any)=>c?.tenantId===currentTenantId && c?.branchId===currentBranchId).map((c:any)=>fromCustomer(c,currentTenantId||"",currentBranchId||""));
      }
      setCustomers(rows);
    } finally { setBusy(false); }
  }, [currentBranchId,currentTenantId,db]);

  useEffect(()=>{ void loadCustomers(); const h=()=>void loadCustomers(); window.addEventListener(DATA_CHANGED_EVENT,h); return()=>window.removeEventListener(DATA_CHANGED_EVENT,h); },[loadCustomers]);

  const visible = useMemo(() => {
    const q=search.trim().toLowerCase(); if(!q) return customers;
    return customers.filter(c=>[c.customerCode,c.name,c.phone,c.email].some(v=>v.toLowerCase().includes(q)));
  },[customers,search]);

  const openProfile = useCallback(async (customer: CustomerRecord) => {
    setSelected(customer);
    await db.ready;
    const localContacts = Array.from(db.contacts.values()).filter((x:any)=>x?.tenantId===currentTenantId && x?.branchId===currentBranchId && x?.customerId===customer.id && x?.status!=="INACTIVE") as ContactRecord[];
    setContacts(localContacts);
    const localSales = Array.from(db.sales.values()).filter((x:any)=>x?.tenantId===currentTenantId && x?.branchId===currentBranchId && x?.customerId===customer.id);
    const localPayments = Array.from(db.payments.values()).filter((x:any)=>x?.tenantId===currentTenantId && x?.branchId===currentBranchId && x?.customerId===customer.id);
    setHistory({customer,sales:localSales,payments:localPayments,returns:[],audits:[]});
    if (isOnline) {
      try {
        const [h,c] = await Promise.all([apiFetch<any>(`/api/v1/customers/${customer.id}/history`),apiFetch<any>(`/api/v1/customers/${customer.id}/contacts`)]);
        if (h?.success) setHistory(h.data);
        if (c?.success && Array.isArray(c.data)) { setContacts(c.data); for (const row of c.data) db.contacts.set(String(row.id),row); await db.flushPersistence(); }
      } catch {}
    }
  },[currentBranchId,currentTenantId,db,isOnline]);

  useEffect(()=>{
    const timer=setTimeout(async()=>{
      const q=contactSearch.trim(); if(q.length<2){setContactResults([]);return;}
      try {
        if(isOnline){ const r=await apiFetch<any>(`/api/v1/contacts/search?q=${encodeURIComponent(q)}`); if(r?.success && Array.isArray(r.data)) { setContactResults(r.data as ContactRecord[]); return; } }
        const low=q.toLowerCase();
        setContactResults(Array.from(db.contacts.values()).filter((x:any)=>x?.tenantId===currentTenantId && x?.branchId===currentBranchId && [x.firstName,x.lastName,x.email,x.phone,x.title].some((v)=>String(v||"").toLowerCase().includes(low))).slice(0,100) as ContactRecord[]);
      } catch { setContactResults([]); }
    },250);
    return ()=>clearTimeout(timer);
  },[contactSearch,currentBranchId,currentTenantId,db,isOnline]);

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault(); if(!form.name.trim() || !form.phone.trim()) return;
    const id=formMode==="CREATE"?uuid():selected?.id||uuid();
    const code=formMode==="CREATE"?`CUST-${id.slice(0,8).toUpperCase()}`:(selected?.customerCode||`CUST-${id.slice(0,8).toUpperCase()}`);
    const record: CustomerRecord={id,tenantId:currentTenantId!,branchId:currentBranchId!,customerCode:code,name:form.name.trim(),phone:form.phone.trim(),email:form.email.trim(),address:form.address.trim(),creditLimit:Math.max(0,Number(form.creditLimit||0)),currentBalance:selected?.currentBalance||0,openingBalance:selected?.openingBalance||0,status:selected?.status||"ACTIVE",updatedAt:new Date().toISOString()};
    await commitLocalMutation({db,tenantContext:{tenantId:currentTenantId!,branchId:currentBranchId!},entityType:"Customer",entityId:id,operationType:formMode==="CREATE"?"CREATE":"UPDATE",payload:{id,customerCode:code,name:record.name,phone:record.phone,email:record.email,address:record.address,creditLimit:record.creditLimit,status:record.status,openingBalance:0},idempotencyKey:id+"-"+formMode+"-"+Date.now(),writes:[{store:"customers",key:id,value:record}]});
    setCustomers(prev=>formMode==="CREATE"?[record,...prev]:prev.map(c=>c.id===id?record:c));
    toast.success(formMode==="CREATE"?`${noun} queued`:`${noun} updated`,"Saved durably and queued for authoritative synchronization.");
    setFormOpen(false); setSelected(null);
    if(isOnline) void syncOutbox({force:true,quiet:true});
  };

  const archiveCustomer = async (c:CustomerRecord) => {
    if(c.currentBalance>0.005){toast.warning("Cannot archive","Outstanding balance must be settled first.");return;}
    await commitLocalMutation({db,tenantContext:{tenantId:currentTenantId!,branchId:currentBranchId!},entityType:"Customer",entityId:c.id,operationType:"DELETE",payload:{id:c.id},idempotencyKey:c.id+"-delete-"+Date.now(),writes:[{store:"customers",key:c.id,delete:true}]});
    setCustomers(prev=>prev.filter(x=>x.id!==c.id)); toast.success("Customer archived","Archive request is queued for server confirmation.");
    if(isOnline) void syncOutbox({force:true,quiet:true});
  };

  const postPayment = async (e:React.FormEvent) => {
    e.preventDefault(); if(!selected || paymentAmount<=0 || !isOnline || paymentPosting) return;
    setPaymentPosting(true);
    try {
      const idempotencyKey = uuid();
      let cashSessionId: string | undefined;
      if (paymentMethod === "CASH") {
        const session = await apiFetch<any>("/api/v1/cash-sessions/active");
        cashSessionId = session?.data?.id ? String(session.data.id) : undefined;
        if (!cashSessionId) throw new Error("CASH_SESSION_REQUIRED");
      }
      const r=await apiFetch<any>(`/api/v1/customers/${selected.id}/payment`,{method:"POST",body:JSON.stringify({amount:paymentAmount,paymentMethod,idempotencyKey,cashSessionId})});
    if(!r?.success) throw new Error(r?.error?.message||"Payment failed");
      toast.success("Payment posted","The authoritative customer balance has been updated.");
      setPaymentOpen(false); setPaymentAmount(0); await loadCustomers(); if(selected) await openProfile(selected);
    } finally { setPaymentPosting(false); }
  };

  const saveContact = async (e:React.FormEvent) => {
    e.preventDefault(); if(!selected || !contactForm.firstName.trim()) return;
    const id=editingContact?.id||uuid(); const now=new Date().toISOString();
    const row:ContactRecord={id,customerId:selected.id,tenantId:currentTenantId!,branchId:currentBranchId!,...contactForm,firstName:contactForm.firstName.trim(),lastName:contactForm.lastName.trim(),title:contactForm.title.trim(),role:contactForm.role.trim(),department:contactForm.department.trim(),phone:contactForm.phone.trim(),email:contactForm.email.trim(),notes:contactForm.notes.trim(),status:"ACTIVE",updatedAt:now,createdAt:editingContact?.createdAt||now};
    await commitLocalMutation({db,tenantContext:{tenantId:currentTenantId!,branchId:currentBranchId!},entityType:"CustomerContact",entityId:id,operationType:editingContact?"UPDATE":"CREATE",payload:row,idempotencyKey:id+"-"+Date.now(),writes:[{store:"contacts",key:id,value:row}]});
    setContacts(prev=>editingContact?prev.map(x=>x.id===id?row:x):[row,...prev]); setContactOpen(false); setEditingContact(null);
    toast.success("Contact queued","Contact mutation is durable and will synchronize.");
    if(isOnline) void syncOutbox({force:true,quiet:true});
  };

  const archiveContact = async (c:ContactRecord) => {
    if(!selected) return;
    await commitLocalMutation({db,tenantContext:{tenantId:currentTenantId!,branchId:currentBranchId!},entityType:"CustomerContact",entityId:c.id,operationType:"DELETE",payload:{id:c.id,customerId:selected.id},idempotencyKey:c.id+"-delete-"+Date.now(),writes:[{store:"contacts",key:c.id,delete:true}]});
    setContacts(prev=>prev.filter(x=>x.id!==c.id)); if(isOnline) void syncOutbox({force:true,quiet:true});
  };

  const exportCsv=()=>{
    const esc=(v:unknown)=>{const s=String(v??"");return /[,"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const h=["customerCode","name","phone","email","address","creditLimit","currentBalance","status"];
    const csv=[h.join(","),...customers.map(c=>[c.customerCode,c.name,c.phone,c.email,c.address,c.creditLimit,c.currentBalance,c.status].map(esc).join(","))].join("\n")+"\n";
    const a=document.createElement("a"); const u=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.href=u;a.download="customers.csv";a.click();URL.revokeObjectURL(u);
  };

  const importCsv=async(file:File)=>{
    const rows=parseCsv(await file.text()); if(!rows.length) throw new Error("CSV_EMPTY"); if(rows.length>500) throw new Error("CSV_LIMIT_EXCEEDED");
    for(const row of rows){
      if(!row.name||!row.phone) continue;
      const id=uuid(); const record={id,tenantId:currentTenantId!,branchId:currentBranchId!,customerCode:row.customerCode||`CUST-${id.slice(0,8).toUpperCase()}`,name:row.name,phone:row.phone,email:row.email||"",address:row.address||"",creditLimit:Math.max(0,Number(row.creditLimit||0)),currentBalance:0,openingBalance:0,status:"ACTIVE"};
      await commitLocalMutation({db,tenantContext:{tenantId:currentTenantId!,branchId:currentBranchId!},entityType:"Customer",entityId:id,operationType:"CREATE",payload:{id,customerCode:record.customerCode,name:record.name,phone:record.phone,email:record.email,address:record.address,creditLimit:record.creditLimit,openingBalance:0},idempotencyKey:id,writes:[{store:"customers",key:id,value:record}]});
    }
    await loadCustomers(); toast.success("Import queued",`${rows.length} validated rows were durably queued.`); if(isOnline) void syncOutbox({force:true,quiet:true});
  };

  return <div className="v2-animate-page-enter v2-space-y-4">
    <div className="v2-flex v2-items-center v2-justify-between v2-gap-3" style={{flexWrap:"wrap"}}>
      <div><h1 className="v2-text-xl v2-font-black">{noun} Directory &amp; Credit Ledger</h1><p className="v2-text-xs v2-text-muted">Customers, profiles, credit limits, balances, transactions, contacts, search, import/export and audit.</p></div>
      <div className="v2-flex v2-gap-2" style={{flexWrap:"wrap"}}>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={()=>void loadCustomers()} disabled={busy}><RefreshCw size={13}/>Refresh</button>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={exportCsv}><Download size={13}/>Export CSV</button>
        <label className="v2-btn v2-btn-secondary v2-btn-sm" style={{cursor:"pointer"}}><Upload size={13}/>Import CSV<input hidden type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)void importCsv(f).catch(err=>toast.error("Import failed",err instanceof Error?err.message:String(err)));e.currentTarget.value="";}}/></label>
        <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={()=>{setSelected(null);setFormMode("CREATE");setForm({name:"",phone:"",email:"",address:"",creditLimit:0});setFormOpen(true)}}><UserPlus size={13}/>Add {noun}</button>
      </div>
    </div>

    <div className="v2-flex v2-items-center v2-gap-3"><div style={{position:"relative",flex:1,maxWidth:560}}><Search size={14} style={{position:"absolute",left:".8rem",top:".7rem",color:"var(--muted)"}}/><input className="v2-input v2-input-sm" style={{paddingLeft:"2.4rem"}} value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search by code, name, email or phone...`}/></div><span className="v2-text-xs v2-text-muted">Queued: <strong>{pendingOutboxCount}</strong></span></div>

    <div className="v2-grid v2-grid-3 v2-gap-4">
      {visible.map(c=><div key={c.id} className="v2-card" style={{padding:"1.1rem"}}>
        <div className="v2-flex v2-items-start v2-justify-between"><div className="v2-flex v2-items-center v2-gap-2"><div style={{width:36,height:36,borderRadius:"var(--radius-md)",background:"var(--surface-3)",display:"grid",placeItems:"center"}}><User size={18}/></div><div><div className="v2-font-bold v2-text-sm">{c.name}</div><div className="v2-mono v2-text-xs v2-text-muted">{c.customerCode}</div></div></div><span className={`badge ${c.currentBalance>0?"v2-badge-danger":"v2-badge-success"}`}>{c.currentBalance>0?"Balance Due":"Zero Balance"}</span></div>
        <div className="v2-space-y-1 v2-text-xs v2-text-muted v2-my-3"><div><Phone size={12} style={{verticalAlign:"middle",marginRight:5}}/>{c.phone}</div>{c.email&&<div><Mail size={12} style={{verticalAlign:"middle",marginRight:5}}/>{c.email}</div>}</div>
        <div className="v2-grid v2-grid-2 v2-gap-2 v2-pt-2" style={{borderTop:"1px solid var(--surface-border)"}}><div><div className="v2-text-xs v2-text-muted">CREDIT LIMIT</div><div className="v2-mono v2-text-xs">{money(c.creditLimit)}</div></div><div><div className="v2-text-xs v2-text-muted">CURRENT BALANCE</div><div className="v2-mono v2-text-xs v2-font-black">{money(c.currentBalance)}</div></div></div>
        <div className="v2-flex v2-gap-2 v2-mt-3"><button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={()=>void openProfile(c)}><Eye size={13}/>Profile</button>{c.currentBalance>0&&<button className="v2-btn v2-btn-primary v2-btn-sm" disabled={!isOnline} title={!isOnline?"Connect to post customer payment":"Post payment"} onClick={()=>{setSelected(c);setPaymentOpen(true)}}>Repay</button>}<button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={()=>{setSelected(c);setFormMode("EDIT");setForm({name:c.name,phone:c.phone,email:c.email,address:c.address,creditLimit:c.creditLimit});setFormOpen(true)}}><Edit2 size={13}/></button><button className="v2-btn v2-btn-ghost v2-btn-sm" style={{color:"var(--danger)"}} onClick={()=>void archiveCustomer(c)}><Trash2 size={13}/></button></div>
      </div>)}
      {!visible.length&&<div className="v2-empty" style={{gridColumn:"1/-1",padding:"3rem",textAlign:"center"}}><Users size={40} style={{opacity:.45}}/><p className="v2-empty-title">No {noun.toLowerCase()} profiles found</p><p className="v2-empty-desc">Production tenants begin with zero customer master data.</p></div>}
    </div>

    <div className="v2-card"><div className="v2-font-black v2-mb-2">Contact Search</div><div className="v2-text-xs v2-text-muted v2-mb-3">Searches authoritative tenant + branch contact records, with offline local fallback.</div><div style={{position:"relative"}}><Search size={14} style={{position:"absolute",left:".8rem",top:".7rem"}}/><input className="v2-input v2-input-sm" style={{paddingLeft:"2.4rem"}} value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder="Name, email, phone, role, customer..."/></div>{contactSearch.trim().length>=2&&<div className="v2-space-y-1 v2-mt-3">{contactResults.map(r=><button key={r.id} className="v2-btn v2-btn-ghost v2-w-full" style={{justifyContent:"flex-start"}} onClick={()=>{const c=customers.find(x=>x.id===r.customerId);if(c)void openProfile(c)}}><ContactIcon size={13}/>{r.firstName} {r.lastName}<span className="v2-text-muted">· {r.email||r.phone||"Contact"}</span></button>)}</div>}</div>

    {formOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",zIndex:1000}}><div className="v2-card" style={{width:470,maxWidth:"95vw",padding:"1.5rem"}}><div className="v2-flex v2-items-center v2-justify-between"><h2 className="v2-text-lg v2-font-black">{formMode==="CREATE"?"Register":"Edit"} {noun}</h2><button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={()=>setFormOpen(false)}><X size={14}/></button></div><form className="v2-space-y-3 v2-mt-4" onSubmit={e=>void saveCustomer(e)}><input className="v2-input" placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input className="v2-input" placeholder="Phone number" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required/><input className="v2-input" type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className="v2-input" placeholder="Address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><div><label className="v2-text-xs v2-text-muted">Credit limit (Tsh)</label><input className="v2-input" type="number" min="0" value={form.creditLimit} onChange={e=>setForm({...form,creditLimit:Number(e.target.value||0)})}/></div><div className="v2-flex v2-justify-end v2-gap-2"><button type="button" className="v2-btn v2-btn-ghost" onClick={()=>setFormOpen(false)}>Cancel</button><button className="v2-btn v2-btn-primary" type="submit">Save</button></div></form></div></div>}

    {selected&&history&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.74)",display:"grid",placeItems:"center",zIndex:1050}}><div className="v2-card" style={{width:920,maxWidth:"96vw",maxHeight:"92vh",overflow:"auto",padding:"1.5rem"}}><div className="v2-flex v2-items-start v2-justify-between"><div><h2 className="v2-text-lg v2-font-black">{selected.name}</h2><div className="v2-text-xs v2-text-muted">{selected.customerCode} · Balance {money(selected.currentBalance)} · Limit {money(selected.creditLimit)}</div></div><button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={()=>{setSelected(null);setHistory(null)}}><X size={14}/></button></div>
      <div className="v2-grid v2-grid-3 v2-gap-3 v2-my-4"><div className="v2-card"><div className="v2-text-xs v2-text-muted">SALES</div><div className="v2-text-lg v2-font-black">{history.sales?.length||0}</div></div><div className="v2-card"><div className="v2-text-xs v2-text-muted">PAYMENTS</div><div className="v2-text-lg v2-font-black">{history.payments?.length||0}</div></div><div className="v2-card"><div className="v2-text-xs v2-text-muted">RETURNS</div><div className="v2-text-lg v2-font-black">{history.returns?.length||0}</div></div></div>
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-2"><h3 className="v2-font-black"><ContactIcon size={15} style={{verticalAlign:"middle",marginRight:5}}/>Contacts</h3><button className="v2-btn v2-btn-primary v2-btn-sm" onClick={()=>{setEditingContact(null);setContactForm({firstName:"",lastName:"",title:"",role:"",department:"",phone:"",email:"",isPrimary:false,decisionInfluence:"INFLUENCER",notes:""});setContactOpen(true)}}><UserPlus size={13}/>Add Contact</button></div>
      <div className="v2-space-y-2">{contacts.map(ct=><div key={ct.id} className="v2-card" style={{padding:".8rem"}}><div className="v2-flex v2-items-center v2-justify-between"><div><div className="v2-font-bold v2-text-sm">{ct.firstName} {ct.lastName} {ct.isPrimary&&<span className="badge v2-badge-success">Primary</span>}</div><div className="v2-text-xs v2-text-muted">{ct.title}{ct.role?` · ${ct.role}`:""}{ct.department?` · ${ct.department}`:""}</div><div className="v2-text-xs v2-text-muted">{ct.phone}{ct.email?` · ${ct.email}`:""}</div></div><div className="v2-flex v2-gap-1"><button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={()=>{setEditingContact(ct);setContactForm({firstName:ct.firstName,lastName:ct.lastName,title:ct.title,role:ct.role,department:ct.department,phone:ct.phone,email:ct.email,isPrimary:ct.isPrimary,decisionInfluence:ct.decisionInfluence,notes:ct.notes});setContactOpen(true)}}><Edit2 size={13}/></button><button className="v2-btn v2-btn-ghost v2-btn-sm" style={{color:"var(--danger)"}} onClick={()=>void archiveContact(ct)}><Trash2 size={13}/></button></div></div></div>)}</div>
      <h3 className="v2-font-black v2-mt-5 v2-mb-2"><History size={15} style={{verticalAlign:"middle",marginRight:5}}/>Transaction History &amp; Audit</h3>
      <div className="v2-space-y-1 v2-text-xs">{[...(history.sales||[]).map((x:any)=>({kind:"Sale",id:x.saleNumber||x.id,value:money(x.grandTotal),date:x.soldAt})),...(history.payments||[]).map((x:any)=>({kind:"Payment",id:x.paymentNumber||x.id,value:money(x.amount),date:x.paidAt})),...(history.audits||[]).map((x:any)=>({kind:"Audit",id:x.id,value:x.action,date:x.createdAt}))].sort((a,b)=>Date.parse(String(b.date||""))-Date.parse(String(a.date||""))).slice(0,100).map(x=><div key={x.kind+"-"+x.id} className="v2-flex v2-items-center v2-justify-between" style={{padding:".55rem .7rem",background:"var(--surface-2)",borderRadius:"var(--radius-md)"}}><span className="v2-font-bold">{x.kind}</span><span className="v2-text-muted">{x.id}</span><span>{x.value}</span><span className="v2-text-muted">{x.date?new Date(x.date).toLocaleString():""}</span></div>)}</div>
      {!isOnline&&<div className="v2-text-xs v2-text-muted v2-mt-3">Offline: customer profile, contacts and cached transactions are read from the tenant/branch IndexedDB replica.</div>}
      </div></div>}

    {paymentOpen&&selected&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",zIndex:1100}}><div className="v2-card" style={{width:420,maxWidth:"94vw",padding:"1.5rem"}}><h2 className="v2-text-lg v2-font-black">Post Customer Payment</h2><div className="v2-text-xs v2-text-muted v2-mb-3">{selected.name} · balance {money(selected.currentBalance)}</div><form className="v2-space-y-3" onSubmit={e=>void postPayment(e)}><input className="v2-input" type="number" min="0.01" max={selected.currentBalance} value={paymentAmount||""} onChange={e=>setPaymentAmount(Number(e.target.value||0))} required/><select className="v2-input" value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="BANK">Bank</option><option value="MOBILE_MONEY">Mobile Money</option><option value="CARD">Card</option></select><div className="v2-text-xs v2-text-muted"><AlertCircle size={12} style={{verticalAlign:"middle",marginRight:4}}/>This posts directly to the authoritative customer balance.</div><div className="v2-flex v2-justify-end v2-gap-2"><button type="button" className="v2-btn v2-btn-ghost" onClick={()=>setPaymentOpen(false)}>Cancel</button><button type="submit" className="v2-btn v2-btn-primary" disabled={paymentPosting}>{paymentPosting ? "Posting…" : "Post Payment"}</button></div></form></div></div>}

    {contactOpen&&selected&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",zIndex:1150}}><div className="v2-card" style={{width:540,maxWidth:"94vw",padding:"1.5rem"}}><div className="v2-flex v2-items-center v2-justify-between"><h2 className="v2-text-lg v2-font-black">{editingContact?"Edit":"Add"} Contact</h2><button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={()=>setContactOpen(false)}><X size={14}/></button></div><form className="v2-space-y-3 v2-mt-4" onSubmit={e=>void saveContact(e)}><div className="v2-grid v2-grid-2 v2-gap-2"><input className="v2-input" placeholder="First name" value={contactForm.firstName} onChange={e=>setContactForm({...contactForm,firstName:e.target.value})} required/><input className="v2-input" placeholder="Last name" value={contactForm.lastName} onChange={e=>setContactForm({...contactForm,lastName:e.target.value})}/></div><div className="v2-grid v2-grid-2 v2-gap-2"><input className="v2-input" placeholder="Title" value={contactForm.title} onChange={e=>setContactForm({...contactForm,title:e.target.value})}/><input className="v2-input" placeholder="Role" value={contactForm.role} onChange={e=>setContactForm({...contactForm,role:e.target.value})}/></div><div className="v2-grid v2-grid-2 v2-gap-2"><input className="v2-input" placeholder="Department" value={contactForm.department} onChange={e=>setContactForm({...contactForm,department:e.target.value})}/><input className="v2-input" placeholder="Phone" value={contactForm.phone} onChange={e=>setContactForm({...contactForm,phone:e.target.value})}/></div><input className="v2-input" type="email" placeholder="Email" value={contactForm.email} onChange={e=>setContactForm({...contactForm,email:e.target.value})}/><div className="v2-grid v2-grid-2 v2-gap-2"><select className="v2-input" value={contactForm.decisionInfluence} onChange={e=>setContactForm({...contactForm,decisionInfluence:e.target.value})}><option value="DECISION_MAKER">Decision Maker</option><option value="INFLUENCER">Influencer</option><option value="USER">User</option><option value="CHAMPION">Champion</option><option value="BLOCKER">Blocker</option></select><label className="v2-flex v2-items-center v2-gap-2 v2-text-xs"><input type="checkbox" checked={contactForm.isPrimary} onChange={e=>setContactForm({...contactForm,isPrimary:e.target.checked})}/>Primary</label></div><textarea className="v2-input" rows={3} placeholder="Notes" value={contactForm.notes} onChange={e=>setContactForm({...contactForm,notes:e.target.value})}/><div className="v2-flex v2-justify-end v2-gap-2"><button type="button" className="v2-btn v2-btn-ghost" onClick={()=>setContactOpen(false)}>Cancel</button><button type="submit" className="v2-btn v2-btn-primary">Save Contact</button></div></form></div></div>}
  </div>;
};