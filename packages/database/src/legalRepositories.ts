import { randomUUID } from "crypto";
import type {
  TenantContext,
  LegalDocument,
  LegalDocumentVersion,
  LegalDocumentType,
  LegalLanguage,
  LegalAcceptanceRecord,
  SubmitAcceptanceRequest,
  DataSubjectRequest,
  SubmitDsrRequest,
  DataExportJob,
  LegalHold,
  RetentionPolicy,
  RetentionExecution,
  SecurityPrivacyIncident,
  Subprocessor,
  OssLicenseNotice,
  TenantLegalDocument,
  LegalGovernanceOverview,
} from "@kwakopos2/contracts";
import { LegalGovernanceEngine } from "@kwakopos2/domain";
import { InMemoryStore } from "./inMemoryStore.js";

// ============================================================
// CANONICAL INITIAL SEED DATA FOR ALL 22 LEGAL POLICIES
// (English & Kiswahili with SHA-256 Hashes)
// ============================================================

export interface CanonicalDocumentDefinition {
  slug: string;
  documentType: LegalDocumentType;
  titleEn: string;
  titleSw: string;
  descriptionEn: string;
  descriptionSw: string;
  contentEn: string;
  contentSw: string;
  isMandatory: boolean;
}

export const CANONICAL_LEGAL_DOCUMENTS: CanonicalDocumentDefinition[] = [
  {
    slug: "privacy-policy",
    documentType: "PRIVACY_POLICY",
    titleEn: "KwakoPos Universal Platform Privacy Policy",
    titleSw: "Sera ya Faragha ya Mfumo wa KwakoPos",
    descriptionEn: "Comprehensive transparency on personal data collection, synchronization, storage, and subject rights under Tanzania PDPA 2022 and GDPR.",
    descriptionSw: "Ufafanuzi kamili kuhusu ukusanyaji wa taarifa binafsi, usawazishaji, hifadhi na haki za mtumiaji kwa mujibu wa Sheria ya Ulinzi wa Taarifa Binafsi 2022.",
    contentEn: `## 1. Introduction & Scope
KwakoPos ("the Platform"), operated by Kwakoko Technologies Ltd, provides offline-first enterprise point-of-sale, enterprise resource planning, and industry operating solutions across the United Republic of Tanzania, the East African Community, and globally. This Privacy Policy governs how personal, commercial, and telemetry data is collected, processed, replicated, and protected.

## 2. Categories of Data Collected
- **Platform Identity Data**: Name, official phone number, business email, encrypted credential hashes, role assignments.
- **Tenant & Commercial Data**: Business registration details, TRA TIN/VRN, store location, sales, inventory ledgers, and transactions.
- **Technical & Device Data**: Local device fingerprint, browser user agent, IP address during sync, IndexedDB persistence state.
- **Support & Audit Data**: Operational action history, SHA-256 hashed ledger mutations, and support ticket inquiries.

## 3. Data Storage & Offline-First Synchronization
KwakoPos utilizes client-side storage (IndexedDB and Service Workers) to enable continuous offline operations. Data committed offline is stored locally in tenant-scoped partitioned namespaces and cryptographically synchronized to PostgreSQL cloud servers upon network availability.

## 4. Legal Basis for Processing
Processing is grounded in: (a) Performance of a commercial contract (b) Compliance with legal obligations under Tanzania Tax Administration Act and Personal Data Protection Act No. 5 of 2022 (c) Legitimate operational security interests.

## 5. Your Data Protection Rights
Under Tanzania PDPA 2022 and international data protection standards, data subjects hold rights of Access, Rectification, Erasure (subject to mandatory tax retention minimums), Data Portability, and Consent Withdrawal.`,
    contentSw: `## 1. Utangulizi na Upeo
KwakoPos ("Mfumo"), unaoendeshwa na Kwakoko Technologies Ltd, unatoa huduma za kisasa za usimamizi wa mauzo na biashara zinazofanya kazi hata bila intaneti kote Tanzania na Afrika Mashariki. Sera hii ya Faragha inaeleza jinsi taarifa binafsi na za kibiashara zinavyokusanywa, kulindwa na kusawazishwa.

## 2. Aina za Taarifa Zinazokusanywa
- **Taarifa za Utambulisho**: Majina, nambari ya simu, barua pepe ya biashara, na vitambulisho vya mfumo.
- **Taarifa za Biashara**: Nambari ya TIN/VRN ya TRA, mauzo, mizania ya hisa na stakabadhi za wateja.
- **Taarifa za Kifaa**: Aina ya kifaa, kumbukumbu ya IndexedDB ya nje ya mtandao, na anwani ya IP wakati wa usawazishaji.

## 3. Hifadhi na Usawazishaji Bila Mtandao
Mfumo unahifadhi taarifa kwenye kifaa chako kwa usalama ili kukuwezesha kufanya kazi bila intaneti. Mara mtandao unapopatikana, taarifa hizo husawazishwa kwa njia salama na seva zetu kuu.

## 4. Haki Zako za Kisheria
Kwa mujibu wa Sheria ya Ulinzi wa Taarifa Binafsi ya Tanzania ya Mwaka 2022, unazo haki za kuona taarifa zako, kuzisahihisha, kuzihamisha, au kuomba zifutwe (kwa kuzingatia masharti ya kisheria ya kuhifadhi kumbukumbu za kodi).`,
    isMandatory: true,
  },
  {
    slug: "data-protection-policy",
    documentType: "DATA_PROTECTION_POLICY",
    titleEn: "KwakoPos Enterprise Data Protection & Security Policy",
    titleSw: "Sera ya Ulinzi wa Taarifa na Usalama wa Mfumo",
    descriptionEn: "Technical and organizational measures (TOMs) governing encryption, tenant isolation, and data lifecycle management.",
    descriptionSw: "Miongozo ya kiufundi na kiusalama inayohakikisha usimbaji fiche na utengano wa taarifa za kila mfanyabiashara.",
    contentEn: `## 1. Data Protection Architecture
KwakoPos implements Privacy-by-Design and Security-by-Default across all engineering components:
- **Tenant Isolation**: Rigid row-level and contextual tenant partitioning (tenant_id mandatory verification on every API request and database query).
- **Encryption**: TLS 1.3 enforced in transit with strict cipher suites; AES-256 encryption at rest for sensitive configurations and database disks.
- **Least Privilege Access**: Granular Role-Based Access Control (RBAC) preventing unauthorized access across stores, branches, or tenants.
- **Audit Logging**: Immutable, SHA-256 hash-chained audit trails recording all security, configuration, and data modification events.`,
    contentSw: `## 1. Muundo wa Ulinzi wa Taarifa
KwakoPos inazingatia misingi mikali ya usalama:
- **Utengano wa Wafanyabiashara**: Kila biashara imetengwa kikamilifu kuzuia muingiliano wa taarifa.
- **Usimbaji Fiche (Encryption)**: Taarifa zote zinasimbwa kwa njia ya TLS 1.3 zikiwa safarini na AES-256 zikiwa zimehifadhiwa.
- **Udhibiti wa Ufikiaji**: Mfumo wa majukumu (RBAC) unahakikisha kila mfanyakazi anaona kile anachoruhusiwa tu.`,
    isMandatory: true,
  },
  {
    slug: "terms-of-service",
    documentType: "TERMS_OF_SERVICE",
    titleEn: "KwakoPos Master Terms of Service",
    titleSw: "Masharti Makuu ya Huduma ya KwakoPos",
    descriptionEn: "Legal contract governing platform subscriptions, uptime, multi-tenant obligations, and operational boundaries.",
    descriptionSw: "Mkataba wa kisheria unaosimamia matumizi ya mfumo, usajili, upatikanaji wa huduma na wajibu wa pande zote.",
    contentEn: `## 1. Commercial Agreement
By creating a tenant account or accessing KwakoPos, you agree to these Terms of Service between your business entity and Kwakoko Technologies Ltd.

## 2. Permitted Commercial Use
KwakoPos grants a non-exclusive, revocable, non-transferable subscription license to operate point-of-sale, accounting, workforce, inventory, and industry vertical modules within authorized capacity limits.

## 3. Financial & Tax Responsibilities
The tenant remains solely responsible for the legal accuracy of their prices, fiscal receipt declarations to the Tanzania Revenue Authority (TRA), and local statutory compliance. KwakoPos acts as an independent software provider.`,
    contentSw: `## 1. Mkataba wa Kibiashara
Kwa kujiandikisha au kutumia mfumo wa KwakoPos, unakubaliana na masharti haya kati ya biashara yako na Kwakoko Technologies Ltd.

## 2. Matumizi Yanayoruhusiwa
Unaruhusiwa kutumia mfumo huu kusimamia mauzo, hesabu, wafanyakazi, na shughuli zote za biashara yako kulingana na kifurushi ulicholipia.

## 3. Wajibu wa Kodi na Fedha
Mfanyabiashara anawajibika kikamilifu na usahihi wa mauzo yake na kodi za mamlaka husika (kama vile TRA). KwakoPos ni mtoa huduma wa kiteknolojia pekee.`,
    isMandatory: true,
  },
  {
    slug: "terms-of-use",
    documentType: "TERMS_OF_USE",
    titleEn: "KwakoPos Acceptable Terms of Use for Operators",
    titleSw: "Masharti ya Matumizi kwa Watumiaji na Waendeshaji",
    descriptionEn: "Rules of conduct for individual cashiers, branch managers, technicians, and system operators.",
    descriptionSw: "Kanuni na miongozo ya nidhamu kwa wahudumu wa duka, mameneja na waendeshaji wote wa mfumo.",
    contentEn: `## 1. User Accountability
Every operator must log in with their assigned individual credentials. Credential sharing, proxy attendance recording, or unauthorized role escalation is strictly prohibited.

## 2. Integrity of Transactions
Cashiers and operators must not fabricate, manipulate, or delete recorded transactions. System offline outboxes must not be deliberately cleared to evade financial auditing.`,
    contentSw: `## 1. Wajibu wa Mtumiaji
Kila mhudumu lazima aingie kwenye mfumo kwa jina na nenosiri lake binafsi. Ni marufuku kuazimana akaunti au kufanya udanganyifu wa mahudhurio.

## 2. Uadilifu wa Mauzo
Ni marufuku kufuta, kughushi au kubadilisha taarifa za mauzo au fedha zilizorekodiwa kwenye mfumo.`,
    isMandatory: true,
  },
  {
    slug: "eula",
    documentType: "EULA",
    titleEn: "End User License Agreement (EULA)",
    titleSw: "Mkataba wa Leseni ya Mtumiaji wa Mwisho (EULA)",
    descriptionEn: "Software license terms governing PWA installation, desktop runtime, and client-side device usage.",
    descriptionSw: "Masharti ya leseni ya programu inayowekwa kwenye kompyuta, simu na vifaa vya mauzo.",
    contentEn: `## 1. Grant of License
Kwakoko Technologies Ltd grants you a non-exclusive license to install and run the KwakoPos Progressive Web App (PWA) on designated commercial point-of-sale terminals, tablets, and authorized workstations.

## 2. Restrictions
You shall not: (a) Reverse engineer, decompile, or disassemble any component of the application (b) Circumvent license key validation (c) Modify client security boundaries.`,
    contentSw: `## 1. Utoaji wa Leseni
Kwakoko Technologies Ltd inakupa idhini ya kutumia programu hii kwenye vifaa vyako vya kibiashara kama vile kompyuta, vishikwambi na mashine za POS.

## 2. Makatazo
Huruhusiwi kubomoa, kuiga au kufanyia mabadiliko haramu mfumo huu bila idhini ya kimaandishi.`,
    isMandatory: true,
  },
  {
    slug: "software-license",
    documentType: "SOFTWARE_LICENSE",
    titleEn: "KwakoPos Commercial Software License",
    titleSw: "Leseni ya Kibiashara ya Programu ya KwakoPos",
    descriptionEn: "Commercial software intellectual property ownership and enterprise multi-branch deployment rules.",
    descriptionSw: "Umiliki wa kisheria wa programu ya KwakoPos na utaratibu wa ufungaji kwenye matawi ya biashara.",
    contentEn: `## 1. Intellectual Property
All source code, UI designs, domain models, mathematical scoring engines, and brand assets of KwakoPos remain the exclusive intellectual property of Kwakoko Technologies Ltd.

## 2. Subscription Validity
This license remains valid strictly during active paid subscription tiers. Upon subscription termination, client write access ceases while read-only data access is maintained for regulatory compliance.`,
    contentSw: `## 1. Hakimiliki na Umiliki
Hati miliki zote za programu hii, miundo na mifumo yake ni mali halali ya Kwakoko Technologies Ltd.

## 2. Uhai wa Leseni
Leseni hii inafanya kazi kulingana na usajili wa kila mwezi au mwaka. Usajili unapoisha, uwezo wa kuweka taarifa mpya husitishwa hadi utakapohuisha.`,
    isMandatory: true,
  },
  {
    slug: "acceptable-use-policy",
    documentType: "ACCEPTABLE_USE_POLICY",
    titleEn: "Acceptable Use Policy (AUP)",
    titleSw: "Sera ya Matumizi Yanayokubalika (AUP)",
    descriptionEn: "Prohibited conduct, anti-fraud regulations, abuse prevention, and rate-limiting rules.",
    descriptionSw: "Mambo yaliyopigwa marufuku, kuzuia ulaghai, matumizi mabaya ya mtandao na ulinzi wa mfumo.",
    contentEn: `## 1. Prohibited Activities
You may not use KwakoPos to:
- Process unlawful, fraudulent, or counterfeit goods.
- Conduct denial-of-service, automated scraping, or unauthorized vulnerability scans.
- Transmit malicious sync payloads or poison local IndexedDB caches.
- Attempt cross-tenant privilege escalation or breach platform boundaries.`,
    contentSw: `## 1. Shughuli Zilizopigwa Marufuku
Huruhusiwi kutumia mfumo huu:
- Kuuza bidhaa haramu au kufanya udanganyifu wa kifedha.
- Kujaribu kuingilia taarifa za biashara nyingine au kutuma virusi vya kimtandao.
- Kujaribu kuvunja mifumo ya ulinzi wa programu.`,
    isMandatory: true,
  },
  {
    slug: "cookie-policy",
    documentType: "COOKIE_POLICY",
    titleEn: "Local Storage, Cookie & Offline Persistence Policy",
    titleSw: "Sera ya Vidakuzi (Cookies) na Hifadhi ya Kifaa",
    descriptionEn: "Clear disclosure on IndexedDB, CacheStorage, localStorage, and Service Worker usage.",
    descriptionSw: "Ufafanuzi kuhusu matumizi ya vidakuzi, kumbukumbu ya simu/kompyuta na teknolojia ya kufanya kazi bila intaneti.",
    contentEn: `## 1. What We Store Locally
KwakoPos is designed as an offline-first Progressive Web App. To provide continuous operation during power or network outages, we store:
- **IndexedDB**: Local offline transaction outbox, product catalog cache, customer directory.
- **Service Worker Cache**: Application shell assets (HTML, CSS, JS, icons) for fast zero-latency loading.
- **LocalStorage**: Visual theme preferences, active branch selection, and temporary sync cursors.
- **SessionStorage**: Cryptographically protected short-lived session context (scrubbed on tab close).

We do NOT use third-party tracking or advertising cookies.`,
    contentSw: `## 1. Kinachohifadhiwa Kwenye Kifaa Chako
Kwa kuwa mfumo huu unafanya kazi hata bila mtandao, unahifadhi:
- **IndexedDB**: Orodha ya bidhaa na mauzo ya muda ukiwa nje ya mtandao.
- **Vidakuzi Muhimu (Cookies)**: Kuhifadhi hali yako ya kuingia na mapendeleo ya mwonekano.
Hatutumii vidakuzi vya matangazo au ufuatiliaji wa watu wengine.`,
    isMandatory: false,
  },
  {
    slug: "data-retention-policy",
    documentType: "DATA_RETENTION_POLICY",
    titleEn: "Data Retention & Disposal Schedule",
    titleSw: "Ratiba ya Uhifadhi na Ufutaji Salama wa Taarifa",
    descriptionEn: "Mandatory statutory retention periods, archival policies, and legal hold procedures.",
    descriptionSw: "Vipindi vya kisheria vya kutunza kumbukumbu za fedha na utaratibu wa kufuta taarifa za zamani.",
    contentEn: `## 1. Statutory Retention Schedule
- **Financial Ledgers & Tax Receipts**: Retained for 7 years in compliance with Tanzania Tax Administration Act.
- **General Audit Trails**: Retained for 3 years.
- **Temporary Sync Deltas**: Purged 30 days following verified server commit.
- **Transient Session Logs**: Purged after 90 days.

## 2. Legal Holds
Where a formal regulatory inspection or legal proceeding is active, an authorized Super Admin may place an immutable Legal Hold, preventing automated archival or deletion until released.`,
    contentSw: `## 1. Muda wa Kutunza Kumbukumbu
- **Hesabu za Mauzo na Risiti za Kodi**: Zinatunzwa kwa miaka 7 kwa mujibu wa sheria za kodi za Tanzania.
- **Kumbukumbu za Ulinzi (Audit Logs)**: Zinatunzwa kwa miaka 3.
- **Kumbukumbu za Muda za Usawazishaji**: Zinafutwa baada ya siku 30 mara baada ya kusawazishwa kikamilifu.`,
    isMandatory: true,
  },
  {
    slug: "dpa",
    documentType: "DPA",
    titleEn: "Data Processing Addendum (DPA)",
    titleSw: "Mkataba wa Nyongeza wa Uchakataji wa Taarifa (DPA)",
    descriptionEn: "Formal processor-to-controller agreement defining tenant data ownership and platform processing responsibilities.",
    descriptionSw: "Makubaliano ya kisheria yanayotenganisha haki za mwenye biashara kama mmiliki wa taarifa na mtoa huduma kama mchakataji.",
    contentEn: `## 1. Roles & Ownership
The Tenant acts as the **Data Controller** regarding all customer and transaction data. Kwakoko Technologies Ltd acts as the **Data Processor**. The processor processes tenant personal data solely on documented instructions from the controller.`,
    contentSw: `## 1. Majukumu na Umiliki
Mfanyabiashara (Tenant) ndiye mmiliki mkuu na msimamizi wa taarifa za wateja na biashara yake. Kwakoko Technologies Ltd inachakata taarifa hizo kwa niaba yake na kwa maelekezo yake pekee.`,
    isMandatory: true,
  },
  {
    slug: "subprocessors",
    documentType: "SUBPROCESSORS",
    titleEn: "Subprocessor & Third-Party Service Disclosure",
    titleSw: "Orodha ya Wachakataji Wasaidizi wa Taarifa",
    descriptionEn: "Public registry of authorized cloud infrastructure, payment gateways, and communications providers.",
    descriptionSw: "Orodha wazi ya watoa huduma za seva, malipo na mawasiliano wanaotumika kwenye mfumo.",
    contentEn: `## 1. Authorized Subprocessors
KwakoPos contracts with vetted cloud and telecommunications infrastructure providers:
- **Google Cloud Platform (GCP)**: Cloud hosting, database replication, and storage (EU/US/Johannesburg regions).
- **Tanzania National Mobile Money Providers (M-Pesa, TigoPesa, AirtelMoney, HaloPesa)**: Real-time collection webhooks.
- **TRA VFD/EFDMS Gateway**: Mandatory fiscal receipt registration.`,
    contentSw: `## 1. Wachakataji Wasaidizi Walioidhinishwa
KwakoPos inafanya kazi na mifumo ya kuaminika:
- **Google Cloud Platform (GCP)**: Uhifadhi salama wa seva na mifumo ya data.
- **Mitandao ya Simu (M-Pesa, TigoPesa, n.k.)**: Kuchakata miamala ya malipo ya kidijitali.
- **Mamlaka ya Mapato Tanzania (TRA)**: Kusajili stakabadhi rasmi za mashine za kielektroniki.`,
    isMandatory: false,
  },
  {
    slug: "security-policy",
    documentType: "SECURITY_POLICY",
    titleEn: "Platform Information Security Policy",
    titleSw: "Sera ya Usalama wa Taarifa za Mfumo",
    descriptionEn: "Comprehensive security architecture, cryptographic controls, and threat monitoring specifications.",
    descriptionSw: "Muundo kamili wa ulinzi, usimbaji fiche na ufuatiliaji wa vitisho vya kimtandao.",
    contentEn: `## 1. Security Architecture
KwakoPos adheres to the principle of Defense-in-Depth. Technical safeguards include argon2 password hashing, strict CSP headers, automated vulnerability scanning, and SHA-256 tamper-evident database logs.`,
    contentSw: `## 1. Usalama wa Ndani wa Mfumo
Ulinzi wa mfumo unajumuisha usimbaji fiche wa manenosiri kwa kiwango cha kisasa (Argon2), ukaguzi wa mara kwa mara wa usalama, na kuzuia mashambulizi ya kimtandao.`,
    isMandatory: false,
  },
  {
    slug: "vulnerability-disclosure",
    documentType: "VULNERABILITY_DISCLOSURE",
    titleEn: "Responsible Vulnerability Disclosure Policy",
    titleSw: "Sera ya Kuripoti Hitilafu za Kiinjinia na Usalama",
    descriptionEn: "Safe harbor rules for security researchers and reporting protocol for system vulnerabilities.",
    descriptionSw: "Utaratibu salama na wa kisheria kwa wataalamu wa usalama kuripoti hitilafu wanazoziona.",
    contentEn: `## 1. Safe Harbor Commitment
KwakoPos encourages ethical security research. If you conduct vulnerability testing within this policy's scope without harming production data, Kwakoko Technologies will not initiate legal action against you. Contact: security@kwakopos.com.`,
    contentSw: `## 1. Kuripoti kwa Nia Njema
Tunawakaribisha wataalamu wa TEHAMA kuripoti mapungufu ya kiusalama kwa njia ya heshima na usiri kupitia: security@kwakopos.com.`,
    isMandatory: false,
  },
  {
    slug: "refund-cancellation-policy",
    documentType: "REFUND_CANCELLATION",
    titleEn: "Platform Refund, Cancellation & Suspension Policy",
    titleSw: "Sera ya Kurudishiwa Pesa na Kusitisha Huduma",
    descriptionEn: "Clear terms on subscription cancellations, cooling-off periods, and billing adjustments.",
    descriptionSw: "Masharti kuhusu kusitisha usajili, fidia na kurejeshewa malipo pale inapostahili.",
    contentEn: `## 1. Subscription Cancellations
Tenants may cancel their KwakoPos SaaS subscription at any time via the billing portal. Cancellation takes effect at the end of the current paid billing cycle.

## 2. Refund Eligibility
Refunds are evaluated for platform unviability or service outages exceeding contractual SLA thresholds. Prorated refunds are issued via original payment methods.`,
    contentSw: `## 1. Kusitisha Usajili
Unaweza kusitisha usajili wa biashara yako wakati wowote kupitia mfumo. Huduma itaendelea hadi mwisho wa mwezi uliolipia.

## 2. Kurejeshewa Fedha
Madai ya kurudishiwa fedha yataangaliwa pale ambapo mfumo ulishindwa kufanya kazi kwa mujibu wa makubaliano ya kiwango cha huduma (SLA).`,
    isMandatory: false,
  },
  {
    slug: "billing-terms",
    documentType: "BILLING_TERMS",
    titleEn: "Subscription Billing & Payment Terms",
    titleSw: "Masharti ya Malipo na Ankara za Usajili",
    descriptionEn: "Pricing models, automatic renewals, local VAT treatment, and grace periods.",
    descriptionSw: "Bei za vifurushi, malipo ya mara kwa mara, kodi ya ongezeko la thamani (VAT) na muda wa nyongeza.",
    contentEn: `## 1. Billing Frequency & Currencies
Subscriptions are billed monthly or annually in Tanzanian Shillings (TZS) or US Dollars (USD). All invoiced prices clearly delineate statutory VAT where applicable. A 7-day grace period is provided following payment failure before write access is suspended.`,
    contentSw: `## 1. Utaratibu wa Malipo
Malipo hufanyika kila mwezi au mwaka kwa Shilingi za Kitanzania (TZS) au Dola (USD). Mfumo unatoa muda wa nyongeza wa siku 7 pale malipo yanapochelewa kabla ya kusitisha huduma.`,
    isMandatory: true,
  },
  {
    slug: "service-level-policy",
    documentType: "SLA",
    titleEn: "Service Level Agreement (SLA) & Availability Policy",
    titleSw: "Makubaliano ya Kiwango cha Huduma na Upatikanaji (SLA)",
    descriptionEn: "99.9% uptime commitment, maintenance windows, and offline reliability guarantees.",
    descriptionSw: "Uhakika wa kupatikana kwa mfumo kwa asilimia 99.9 na utaratibu wa matengenezo.",
    contentEn: `## 1. Uptime Target
KwakoPos targets 99.9% cloud API and synchronization availability. Because client POS workstations run as offline-first Progressive Web Apps, local sales and printing are never interrupted during upstream outages.`,
    contentSw: `## 1. Kiwango cha Upatikanaji
Mfumo unalenga kupatikana hewani kwa asilimia 99.9. Hata hivyo, kutokana na uwezo wa kufanya kazi bila mtandao, duka lako halitasimama kufanya mauzo hata intaneti ikikatika.`,
    isMandatory: false,
  },
  {
    slug: "intellectual-property-policy",
    documentType: "IP_POLICY",
    titleEn: "Intellectual Property & Licensing Rights Policy",
    titleSw: "Sera ya Hati Miliki na Uvumbuzi wa Kiteknolojia",
    descriptionEn: "Ownership boundaries for proprietary algorithms, database schemas, and customer data.",
    descriptionSw: "Mgawanyo wa umiliki wa mifumo ya kompyuta, kanuni za mahesabu na taarifa za mfanyabiashara.",
    contentEn: `## 1. Proprietary Assets
The KwakoPos name, logo, proprietary accounting-sync algorithms, UI design systems, and compiled binaries are owned exclusively by Kwakoko Technologies Ltd. Tenant business trademarks remain the property of respective tenants.`,
    contentSw: `## 1. Mali za Uvumbuzi
Jina, nembo na mifumo yote ya ndani ya KwakoPos ni mali ya Kwakoko Technologies Ltd. Mfanyabiashara anabaki na umiliki kamili wa chapa na jina la biashara yake.`,
    isMandatory: false,
  },
  {
    slug: "copyright-trademark-notice",
    documentType: "TRADEMARK_NOTICE",
    titleEn: "Copyright & Trademark Legal Notice",
    titleSw: "Ilani ya Hakimiliki na Alama za Biashara",
    descriptionEn: "Formal copyright declarations and brand usage guidelines.",
    descriptionSw: "Ilani rasmi ya hakimiliki na miongozo ya matumizi ya nembo ya KwakoPos.",
    contentEn: `## 1. Copyright Declaration
© 2026 Kwakoko Technologies Ltd. All rights reserved. No portion of this software may be duplicated or redistributed without explicit authorization.`,
    contentSw: `## 1. Tangazo la Hakimiliki
© 2026 Kwakoko Technologies Ltd. Haki zote zimehifadhiwa. Hairuhusiwi kudurufu sehemu yoyote ya programu hii bila idhini.`,
    isMandatory: false,
  },
  {
    slug: "ai-data-policy",
    documentType: "AI_POLICY",
    titleEn: "AI Operating Layer & Data Privacy Policy",
    titleSw: "Sera ya Faragha ya Matumizi ya Akili Mnemba (AI)",
    descriptionEn: "Privacy guardrails, data isolation, and training opt-out commitments for AI assistant features.",
    descriptionSw: "Ulinzi wa taarifa binafsi na uzingatiaji wa maadili wakati wa kutumia huduma za Akili Mnemba (AI).",
    contentEn: `## 1. AI Safety & Privacy Guardrails
KwakoPos features an integrated AI Operating Layer. We strictly uphold that:
- **No Model Training on Tenant Data**: Your sales figures, customer names, and commercial records are NEVER used to train foundational AI models.
- **Tenant Context Isolation**: Prompts execute inside ephemeral, tenant-scoped contexts that terminate immediately upon query completion.
- **Automated PII Redaction**: Credit card numbers, security tokens, and passwords are automatically scrubbed before prompt submission.`,
    contentSw: `## 1. Usalama wa Akili Mnemba (AI)
Mfumo wetu unaotumia Akili Mnemba unazingatia:
- **Hakuna Mafunzo kwa Data Yako**: Mauzo au taarifa zako za siri hazitumiwi kufundisha mitambo ya AI ya wazi.
- **Kuzuia Siri**: Nambari za kadi za benki na manenosiri hufichwa moja kwa moja kabla ya kuuliza swali kwa AI.`,
    isMandatory: true,
  },
  {
    slug: "api-terms-of-use",
    documentType: "API_TERMS",
    titleEn: "Developer & Partner API Terms of Use",
    titleSw: "Masharti ya Matumizi ya Mifumo ya API kwa Waendelezaji",
    descriptionEn: "Integration standards, rate limits, authentication tokens, and tenant scoping for developers.",
    descriptionSw: "Miongozo ya kuunganisha mifumo ya nje kupitia API, viwango vya kasi na ulinzi wa funguo za siri.",
    contentEn: `## 1. API Authorization
All API access must authenticate via signed Bearer tokens scoped strictly to authorized tenant permissions. Automated abuse, scraping, or token sharing will result in immediate API key revocation.`,
    contentSw: `## 1. Uidhinishaji wa API
Mifumo yote inayounganishwa lazima itumie funguo salama zilizoidhinishwa. Ni marufuku kufanya maombi mengi yasiyo ya kawaida yanayoweza kulemea mfumo.`,
    isMandatory: false,
  },
  {
    slug: "beta-terms",
    documentType: "BETA_TERMS",
    titleEn: "Beta & Experimental Features Policy",
    titleSw: "Masharti ya Huduma za Majaribio (Beta)",
    descriptionEn: "Terms governing opt-in preview modules and pre-release functionalities.",
    descriptionSw: "Masharti yanayohusu sehemu za mfumo zilizopo kwenye hatua ya majaribio kabla ya kuzinduliwa rasmi.",
    contentEn: `## 1. Experimental Features
Modules designated as BETA or EXPERIMENTAL are provided for preview and feedback purposes. While multi-tenant data isolation is guaranteed, features may be modified prior to general release.`,
    contentSw: `## 1. Huduma za Majaribio
Sehemu zilizowekwa alama ya BETA ziko kwenye majaribio ya kupokea maoni ya watumiaji na zinaweza kuboreshwa wakati wowote.`,
    isMandatory: false,
  },
  {
    slug: "disaster-recovery-statement",
    documentType: "DISASTER_RECOVERY",
    titleEn: "Business Continuity & Disaster Recovery Statement",
    titleSw: "Tamko la Mwendelezo wa Biashara na Uokoaji wa Data",
    descriptionEn: "High-availability architecture, multi-region replication, and RPO/RTO targets.",
    descriptionSw: "Ufafanuzi wa hatua za dharura za kurejesha taarifa endapo kitatokea janga au hitilafu kubwa ya kiufundi.",
    contentEn: `## 1. Redundancy & Backups
KwakoPos utilizes automated daily encrypted database snapshots, point-in-time recovery (PITR) with a Recovery Point Objective (RPO) under 15 minutes, and local device outbox queuing to ensure complete business continuity.`,
    contentSw: `## 1. Nakala za Dharura (Backups)
Taarifa zote zinahifadhiwa nakala kiotomatiki kila siku kwa njia salama ili kuhakikisha biashara yako inaendelea hata hitilafu ikitokea.`,
    isMandatory: false,
  },
];

// ============================================================
// DEFAULT SUBPROCESSORS SEED
// ============================================================

export const CANONICAL_SUBPROCESSORS: Array<Omit<Subprocessor, "id">> = [
  {
    provider: "Google Cloud Platform",
    serviceName: "Google Cloud Run & Cloud SQL",
    purpose: "Application compute, API execution, and multi-tenant database hosting",
    dataCategories: ["All tenant data", "Application logs", "Encrypted backups"],
    dataRegion: "Global / Johannesburg, South Africa (africa-south1)",
    dpaStatus: "EXECUTED",
    privacyPolicyUrl: "https://cloud.google.com/privacy",
    securityCertifications: ["SOC 2 Type II", "ISO 27001", "PCI-DSS Level 1"],
    isActive: true,
    notes: "Primary cloud infrastructure provider.",
  },
  {
    provider: "Tanzania Revenue Authority",
    serviceName: "TRA VFD / EFDMS API",
    purpose: "Mandatory fiscal transaction signing and fiscal receipt generation",
    dataCategories: ["Taxable sales data", "Buyer TIN", "Fiscal invoice signatures"],
    dataRegion: "Tanzania",
    dpaStatus: "STANDARD_TERMS",
    privacyPolicyUrl: "https://www.tra.go.tz",
    securityCertifications: ["Government Statutory Gateway"],
    isActive: true,
    notes: "Direct statutory fiscalization endpoint.",
  },
  {
    provider: "Vodacom Tanzania",
    serviceName: "M-Pesa Open API Gateway",
    purpose: "Mobile money collection, real-time B2B/C2B settlement, and push payments",
    dataCategories: ["Customer phone number", "Transaction reference", "Amount"],
    dataRegion: "Tanzania",
    dpaStatus: "EXECUTED",
    privacyPolicyUrl: "https://www.vodacom.co.tz/privacy-policy",
    securityCertifications: ["PCI-DSS", "ISO 27001"],
    isActive: true,
    notes: "Licensed Mobile Money Operator (MMO).",
  },
  {
    provider: "Twilio / SendGrid",
    serviceName: "Transactional Email & SMS Service",
    purpose: "Password resets, multi-factor authentication (MFA), and receipt dispatch",
    dataCategories: ["Recipient email", "Recipient phone number", "Message content"],
    dataRegion: "United States / EU",
    dpaStatus: "EXECUTED",
    privacyPolicyUrl: "https://www.twilio.com/legal/privacy",
    securityCertifications: ["SOC 2 Type II", "ISO 27001"],
    isActive: true,
    notes: "Encrypted dispatch of notification payloads.",
  },
  {
    provider: "Cloudflare",
    serviceName: "Cloudflare Edge CDN, DNS & DDoS Protection",
    purpose: "Edge caching, content distribution, Web Application Firewall (WAF), and DDoS mitigation",
    dataCategories: ["Network IP address", "Encrypted TLS transit headers"],
    dataRegion: "Global Anycast (including Dar es Salaam Edge Point of Presence)",
    dpaStatus: "EXECUTED",
    privacyPolicyUrl: "https://www.cloudflare.com/privacypolicy/",
    securityCertifications: ["SOC 2 Type II", "ISO 27001", "PCI-DSS Level 1"],
    isActive: true,
    notes: "Direct Edge PoP in Dar es Salaam, Tanzania.",
  },
];

// ============================================================
// DEFAULT OSS NOTICES SEED
// ============================================================

export const CANONICAL_OSS_NOTICES: OssLicenseNotice[] = [
  {
    packageName: "fastify",
    version: "4.28.1",
    license: "MIT",
    copyright: "Copyright (c) Fastify contributors",
    repositoryUrl: "https://github.com/fastify/fastify",
    noticeRequirement: "The above copyright notice and this permission notice shall be included in all copies.",
    isCompatible: true,
  },
  {
    packageName: "react",
    version: "18.3.1",
    license: "MIT",
    copyright: "Copyright (c) Meta Platforms, Inc. and affiliates",
    repositoryUrl: "https://github.com/facebook/react",
    noticeRequirement: "The above copyright notice and this permission notice shall be included in all copies.",
    isCompatible: true,
  },
  {
    packageName: "zod",
    version: "3.23.8",
    license: "MIT",
    copyright: "Copyright (c) 2020 Colin McDonnell",
    repositoryUrl: "https://github.com/colinhacks/zod",
    noticeRequirement: "Permission is hereby granted, free of charge, to any person obtaining a copy.",
    isCompatible: true,
  },
  {
    packageName: "lucide-react",
    version: "0.469.0",
    license: "ISC",
    copyright: "Copyright (c) Lucide Contributors",
    repositoryUrl: "https://github.com/lucide-icons/lucide",
    noticeRequirement: "Permission to use, copy, modify, and/or distribute this software for any purpose is granted.",
    isCompatible: true,
  },
];

// ============================================================
// SCOPED LEGAL GOVERNANCE REPOSITORY
// ============================================================

export class ScopedLegalGovernanceRepository {
  private store: InMemoryStore;
  constructor(store?: InMemoryStore) {
    this.store = store || (global as any).globalInMemoryStore || new InMemoryStore();
    this.ensureInitialized();
  }

  /**
   * Initializes canonical seed documents if empty.
   */
  public ensureInitialized(): void {
    if (this.store.legalDocuments.size > 0) return;

    const now = new Date().toISOString();

    for (const def of CANONICAL_LEGAL_DOCUMENTS) {
      const docId = randomUUID();
      const versionEnId = randomUUID();
      const versionSwId = randomUUID();

      const hashEn = LegalGovernanceEngine.computeDocumentHash(docId, "1.0.0", "en", def.contentEn);
      const hashSw = LegalGovernanceEngine.computeDocumentHash(docId, "1.0.0", "sw", def.contentSw);

      const versionEn: LegalDocumentVersion = {
        id: versionEnId,
        documentId: docId,
        version: "1.0.0",
        status: "PUBLISHED",
        language: "en",
        title: def.titleEn,
        content: def.contentEn,
        summaryOfChanges: "Canonical initial publication.",
        jurisdiction: "Tanzania (Data Protection Act 2022) / East Africa & Global",
        effectiveAt: now,
        publishedAt: now,
        supersedesVersion: null,
        isMandatoryAcceptance: def.isMandatory,
        cryptographicIntegrityHash: hashEn,
        createdBy: "SUPER_ADMIN_LEGAL_AUTHORITY",
        approvedBy: "GENERAL_COUNSEL_APPROVER",
        createdAt: now,
        updatedAt: now,
      };

      const versionSw: LegalDocumentVersion = {
        id: versionSwId,
        documentId: docId,
        version: "1.0.0",
        status: "PUBLISHED",
        language: "sw",
        title: def.titleSw,
        content: def.contentSw,
        summaryOfChanges: "Toleo rasmi la awali la Kiswahili.",
        jurisdiction: "Tanzania (Data Protection Act 2022) / Afrika Mashariki",
        effectiveAt: now,
        publishedAt: now,
        supersedesVersion: null,
        isMandatoryAcceptance: def.isMandatory,
        cryptographicIntegrityHash: hashSw,
        createdBy: "SUPER_ADMIN_LEGAL_AUTHORITY",
        approvedBy: "GENERAL_COUNSEL_APPROVER",
        createdAt: now,
        updatedAt: now,
      };

      const doc: LegalDocument = {
        id: docId,
        slug: def.slug,
        documentType: def.documentType,
        canonicalTitle: def.titleEn,
        description: def.descriptionEn,
        currentVersion: "1.0.0",
        isMandatory: def.isMandatory,
        applicableAudiences: ["TENANT_OWNER", "USER", "SUPER_ADMIN", "PUBLIC"],
        createdAt: now,
        updatedAt: now,
        activeVersion: versionEn,
      };

      this.store.legalDocuments.set(doc.id, doc);
      this.store.legalDocumentVersions.set(`${doc.id}:1.0.0:en`, versionEn);
      this.store.legalDocumentVersions.set(`${doc.id}:1.0.0:sw`, versionSw);
    }

    // Seed Subprocessors
    for (const sub of CANONICAL_SUBPROCESSORS) {
      const id = randomUUID();
      this.store.subprocessors.set(id, { ...sub, id });
    }

    // Seed OSS Notices
    for (const oss of CANONICAL_OSS_NOTICES) {
      this.store.ossLicenseNotices.set(oss.packageName, oss);
    }
  }

  // Document Operations
  public listDocuments(): LegalDocument[] {
    return Array.from(this.store.legalDocuments.values());
  }

  public getDocumentBySlug(slug: string, language: LegalLanguage = "en"): { document: LegalDocument; activeVersion: LegalDocumentVersion } | null {
    const doc = Array.from(this.store.legalDocuments.values()).find((d) => d.slug === slug);
    if (!doc) return null;

    let version = this.store.legalDocumentVersions.get(`${doc.id}:${doc.currentVersion}:${language}`);
    if (!version && language !== "en") {
      version = this.store.legalDocumentVersions.get(`${doc.id}:${doc.currentVersion}:en`);
    }
    if (!version) return null;

    return { document: doc, activeVersion: version };
  }

  public getDocumentById(id: string): LegalDocument | null {
    return this.store.legalDocuments.get(id) || null;
  }

  public getVersion(documentId: string, version: string, language: LegalLanguage = "en"): LegalDocumentVersion | null {
    return this.store.legalDocumentVersions.get(`${documentId}:${version}:${language}`) || null;
  }

  public publishNewVersion(params: {
    documentId: string;
    version: string;
    language: LegalLanguage;
    title: string;
    content: string;
    summaryOfChanges: string;
    approvedBy: string;
    isMandatoryAcceptance?: boolean;
  }): LegalDocumentVersion {
    let doc = this.store.legalDocuments.get(params.documentId);
    if (!doc) {
      doc = Array.from(this.store.legalDocuments.values()).find(
        (d) => d.slug === params.documentId || d.canonicalSlug === params.documentId
      );
    }
    if (!doc) throw new Error(`Document ${params.documentId} not found`);
    const docId = doc.id;

    const now = new Date().toISOString();
    const hash = LegalGovernanceEngine.computeDocumentHash(docId, params.version, params.language, params.content);

    // Supersede previous active version if published
    const oldVersionKey = `${docId}:${doc.currentVersion}:${params.language}`;
    const oldVersion = this.store.legalDocumentVersions.get(oldVersionKey);
    if (oldVersion && oldVersion.status === "PUBLISHED") {
      oldVersion.status = "SUPERSEDED";
      oldVersion.updatedAt = now;
      this.store.legalDocumentVersions.set(oldVersionKey, oldVersion);
    }

    const newVersion: LegalDocumentVersion = {
      id: randomUUID(),
      documentId: docId,
      version: params.version,
      status: "PUBLISHED",
      language: params.language,
      title: params.title,
      content: params.content,
      summaryOfChanges: params.summaryOfChanges,
      jurisdiction: "Tanzania (Data Protection Act 2022) / East Africa & Global",
      effectiveAt: now,
      publishedAt: now,
      supersedesVersion: doc.currentVersion !== params.version ? doc.currentVersion : null,
      isMandatoryAcceptance: params.isMandatoryAcceptance ?? true,
      cryptographicIntegrityHash: hash,
      createdBy: params.approvedBy,
      approvedBy: params.approvedBy,
      createdAt: now,
      updatedAt: now,
    };

    this.store.legalDocumentVersions.set(`${docId}:${params.version}:${params.language}`, newVersion);
    doc.currentVersion = params.version;
    doc.updatedAt = now;
    doc.activeVersion = newVersion;
    this.store.legalDocuments.set(doc.id, doc);

    return newVersion;
  }

  // Acceptance Operations
  public recordAcceptance(
    userId: string,
    tenantId: string,
    req: SubmitAcceptanceRequest,
    meta?: { ipAddress?: string | null; userAgent?: string | null }
  ): LegalAcceptanceRecord {
    const doc = this.store.legalDocuments.get(req.documentId);
    if (!doc) throw new Error(`Document ${req.documentId} not found`);

    const version = this.getVersion(req.documentId, req.documentVersion, req.language);
    if (!version) throw new Error(`Document version ${req.documentVersion} for language ${req.language} not found`);

    const now = new Date().toISOString();
    const evidenceHash = LegalGovernanceEngine.computeAcceptanceEvidenceHash({
      userId,
      tenantId,
      documentId: req.documentId,
      documentVersion: req.documentVersion,
      language: req.language,
      acceptedAt: now,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      sessionDeviceRef: req.sessionDeviceRef,
      documentHash: version.cryptographicIntegrityHash,
    });

    const record: LegalAcceptanceRecord = {
      id: randomUUID(),
      userId,
      tenantId,
      documentId: req.documentId,
      documentType: doc.documentType,
      documentVersion: req.documentVersion,
      language: req.language,
      acceptedAt: now,
      acceptanceMethod: req.acceptanceMethod,
      ipAddress: meta?.ipAddress || null,
      userAgent: meta?.userAgent || null,
      sessionDeviceRef: req.sessionDeviceRef || null,
      locale: req.language === "sw" ? "sw-TZ" : "en-TZ",
      consentStatus: "ACCEPTED",
      consentSource: "KWAKOPOS_WEB_PORTAL",
      evidenceHash,
      withdrawnAt: null,
      withdrawalReason: null,
    };

    this.store.legalAcceptances.set(record.id, record);
    return record;
  }

  public getAcceptancesForUser(userId: string, tenantId: string): LegalAcceptanceRecord[] {
    return Array.from(this.store.legalAcceptances.values()).filter(
      (a) => a.userId === userId && a.tenantId === tenantId
    );
  }

  public withdrawConsent(userId: string, tenantId: string, documentId: string, reason: string): LegalAcceptanceRecord {
    const acceptances = this.getAcceptancesForUser(userId, tenantId)
      .filter((a) => a.documentId === documentId && a.consentStatus === "ACCEPTED")
      .sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());

    if (acceptances.length === 0) throw new Error("No active consent record found to withdraw.");

    const active = acceptances[0];
    active.consentStatus = "WITHDRAWN";
    active.withdrawnAt = new Date().toISOString();
    active.withdrawalReason = reason;
    this.store.legalAcceptances.set(active.id, active);
    return active;
  }

  // Data Subject Rights (DSR)
  public createDsrRequest(ctx: TenantContext, req: SubmitDsrRequest, requesterEmail: string): DataSubjectRequest {
    const now = new Date();
    const due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days statutory SLA

    const dsr: DataSubjectRequest = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      requesterUserId: ctx.userId,
      requesterEmail,
      requestType: req.requestType,
      status: "SUBMITTED",
      details: req.details,
      submittedAt: now.toISOString(),
      verificationState: "VERIFIED",
      assignedTo: null,
      dueAt: due.toISOString(),
      completedAt: null,
      resolution: null,
      exportDownloadUrl: null,
      exportExpiresAt: null,
      auditTrail: [
        {
          timestamp: now.toISOString(),
          action: "SUBMITTED",
          actor: ctx.userId,
          notes: `Data subject submitted ${req.requestType} request.`,
        },
      ],
    };

    this.store.dataSubjectRequests.set(dsr.id, dsr);
    return dsr;
  }

  public getDsrRequests(tenantId: string): DataSubjectRequest[] {
    return Array.from(this.store.dataSubjectRequests.values()).filter((r) => r.tenantId === tenantId);
  }

  public updateDsrStatus(
    requestId: string,
    tenantId: string,
    status: DataSubjectRequest["status"],
    actor: string,
    resolution?: string
  ): DataSubjectRequest {
    const dsr = this.store.dataSubjectRequests.get(requestId);
    if (!dsr || dsr.tenantId !== tenantId) throw new Error("DSR request not found");

    const now = new Date().toISOString();
    dsr.status = status;
    if (status === "COMPLETED" || status === "REJECTED") {
      dsr.completedAt = now;
      dsr.resolution = resolution || `Request marked as ${status}`;
    }
    dsr.auditTrail.push({
      timestamp: now,
      action: status,
      actor,
      notes: resolution || `Status updated to ${status}`,
    });

    this.store.dataSubjectRequests.set(dsr.id, dsr);
    return dsr;
  }

  // Data Export Operations
  public createDataExportJob(ctx: TenantContext, scope: DataExportJob["scope"]): DataExportJob {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration
    const token = randomUUID().replace(/-/g, "");

    const job: DataExportJob = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      requesterUserId: ctx.userId,
      scope,
      targetId: ctx.userId,
      format: "JSON",
      status: "READY",
      checksumSha256: null,
      fileSizeBytes: 0,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      downloadToken: token,
    };

    this.store.dataExportJobs.set(job.id, job);
    return job;
  }

  public getExportJob(jobId: string, tenantId: string): DataExportJob | null {
    const job = this.store.dataExportJobs.get(jobId);
    if (!job || job.tenantId !== tenantId) return null;
    return job;
  }

  // Subprocessors & OSS
  public listSubprocessors(): Subprocessor[] {
    return Array.from(this.store.subprocessors.values());
  }

  public listOssNotices(): OssLicenseNotice[] {
    return Array.from(this.store.ossLicenseNotices.values());
  }

  // Legal Holds
  public createLegalHold(tenantId: string, params: { reason: string; authority: string; targetEntityType: string; targetEntityId: string; placedBy: string }): LegalHold {
    const hold: LegalHold = {
      id: randomUUID(),
      tenantId,
      reason: params.reason,
      authority: params.authority,
      targetEntityType: params.targetEntityType,
      targetEntityId: params.targetEntityId,
      status: "ACTIVE",
      placedBy: params.placedBy,
      placedAt: new Date().toISOString(),
      releasedAt: null,
      releaseNotes: null,
    };
    this.store.legalHolds.set(hold.id, hold);
    return hold;
  }

  public releaseLegalHold(holdId: string, releaseNotes: string): LegalHold {
    const hold = this.store.legalHolds.get(holdId);
    if (!hold) throw new Error("Legal Hold not found");
    hold.status = "RELEASED";
    hold.releasedAt = new Date().toISOString();
    hold.releaseNotes = releaseNotes;
    this.store.legalHolds.set(hold.id, hold);
    return hold;
  }

  public getActiveLegalHolds(tenantId?: string): LegalHold[] {
    return Array.from(this.store.legalHolds.values()).filter(
      (h) => h.status === "ACTIVE" && (!tenantId || h.tenantId === tenantId)
    );
  }

  // Security & Privacy Incidents
  public recordIncident(incident: Omit<SecurityPrivacyIncident, "id" | "incidentNumber" | "detectedAt" | "auditLog"> & { actor: string }): SecurityPrivacyIncident {
    const now = new Date().toISOString();
    const id = randomUUID();
    const count = this.store.securityPrivacyIncidents.size + 1;
    const incidentNumber = `INC-SEC-${new Date().getFullYear()}-${String(count).padStart(3, "0")}`;

    const rec: SecurityPrivacyIncident = {
      ...incident,
      id,
      incidentNumber,
      detectedAt: now,
      auditLog: [
        {
          timestamp: now,
          actor: incident.actor,
          fromStatus: "NONE",
          toStatus: incident.status || "DETECTED",
          notes: "Incident reported.",
        },
      ],
    };

    this.store.securityPrivacyIncidents.set(rec.id, rec);
    return rec;
  }

  public listIncidents(): SecurityPrivacyIncident[] {
    return Array.from(this.store.securityPrivacyIncidents.values());
  }

  // Tenant Custom Legal Documents
  public getTenantLegalDocuments(tenantId: string): TenantLegalDocument[] {
    return Array.from(this.store.tenantLegalDocuments.values()).filter((d) => d.tenantId === tenantId);
  }

  public upsertTenantLegalDocument(tenantId: string, doc: Omit<TenantLegalDocument, "id" | "tenantId" | "updatedAt">): TenantLegalDocument {
    const existing = Array.from(this.store.tenantLegalDocuments.values()).find(
      (d) => d.tenantId === tenantId && d.documentType === doc.documentType
    );

    const now = new Date().toISOString();
    if (existing) {
      existing.title = doc.title;
      existing.content = doc.content;
      existing.version = doc.version;
      existing.updatedAt = now;
      existing.updatedBy = doc.updatedBy;
      this.store.tenantLegalDocuments.set(existing.id, existing);
      return existing;
    }

    const created: TenantLegalDocument = {
      id: randomUUID(),
      tenantId,
      ...doc,
      updatedAt: now,
    };
    this.store.tenantLegalDocuments.set(created.id, created);
    return created;
  }

  // Governance Overview for Super Admin
  public getGovernanceOverview(): LegalGovernanceOverview {
    const docs = Array.from(this.store.legalDocuments.values());
    const acceptances = Array.from(this.store.legalAcceptances.values());
    const incidents = Array.from(this.store.securityPrivacyIncidents.values()).filter((i) => i.status !== "CLOSED");
    const dsrPending = Array.from(this.store.dataSubjectRequests.values()).filter(
      (r) => r.status !== "COMPLETED" && r.status !== "REJECTED"
    );
    const holds = this.getActiveLegalHolds();

    let verifiedCount = 0;
    let tamperedCount = 0;

    for (const v of this.store.legalDocumentVersions.values()) {
      if (LegalGovernanceEngine.verifyDocumentIntegrity(v)) {
        verifiedCount++;
      } else {
        tamperedCount++;
      }
    }

    return {
      totalDocuments: docs.length,
      publishedDocuments: docs.length,
      draftDocuments: 0,
      totalAcceptances: acceptances.length,
      acceptanceComplianceRate: 100,
      activeIncidents: incidents.length,
      pendingDsrRequests: dsrPending.length,
      activeLegalHolds: holds.length,
      subprocessorsCount: this.store.subprocessors.size,
      lastRetentionRunAt: null,
      cryptographicHealth: {
        allHashesValid: tamperedCount === 0,
        verifiedDocumentsCount: verifiedCount,
        tamperedDocumentsCount: tamperedCount,
      },
    };
  }
}

export const globalLegalGovernanceRepository = new ScopedLegalGovernanceRepository(
  // @ts-ignore
  global.globalInMemoryStore || new InMemoryStore()
);
