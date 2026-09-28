# Snapshot.rawData Specification

## Overview

This document specifies the exact JSON contract for `Snapshot.rawData` stored in the database.
It serves as the boundary interface between the ingestion pipeline (`scripts/pull-and-diff.js`, `scripts/serpapi-client.js`) and the diff engine (`scripts/diff-engine.js`, `backend/src/services/diffService.js`).

---

## Schema Definition

```typescript
type SnapshotRawData = {
  query: string;         // Search query passed to SerpApi
  pulledAt: string;      // ISO 8601 timestamp (e.g. "2026-09-28T06:00:00.000Z")
  search: SearchResult[]; // Top 10 organic search results
  news: NewsResult[];     // Top 10 news results
};

type SearchResult = {
  position: number;      // Result ranking index (1-based)
  title: string;         // Result headline/title
  link: string;          // Source destination URL
  snippet: string;       // Text snippet returned by SerpApi
  date: string | null;   // Date string if provided by Google, otherwise null
};

type NewsResult = {
  title: string;         // Article title
  link: string;          // Article URL
  source: string;        // Publisher / news outlet name
  date: string;          // Publication timestamp / relative date string
  snippet: string;       // News description / snippet
};
```

---

## Ingestion Rules

1. **Top 10 Bound:**
   - Both `search` and `news` arrays must contain a maximum of 10 items (`slice(0, 10)`).
   - Low-ranked results beyond position 10 are discarded to reduce noise and storage bloat.

2. **Field Sanitization:**
   - `search[].date`: Store as string if SerpApi returns a date string; if absent or undefined, set to `null`.
   - All `link` URLs must be valid strings.
   - Text fields (`title`, `snippet`) must have excess whitespace trimmed.

---

## Complete Example

```json
{
  "query": "PM-KISAN eligibility income limit update",
  "pulledAt": "2026-09-28T06:00:00.000Z",
  "search": [
    {
      "position": 1,
      "title": "PM Kisan Samman Nidhi: Revised Operational Guidelines 2026",
      "link": "https://pmkisan.gov.in/guidelines-2026.pdf",
      "snippet": "Updated operational guidelines detailing eligibility criteria, exclusion categories, and revised beneficiary income verification procedures.",
      "date": "2 days ago"
    },
    {
      "position": 2,
      "title": "PM-KISAN Scheme FAQs and Landholding Norms",
      "link": "https://agricoop.nic.in/pm-kisan-faq",
      "snippet": "Frequently asked questions covering income criteria, Aadhaar-linked bank accounts, and mandatory e-KYC deadlines for eligible landholding families.",
      "date": "1 week ago"
    },
    {
      "position": 3,
      "title": "Government Updates PM-KISAN Exclusion List for FY 2026-27",
      "link": "https://pib.gov.in/PressReleasePage.aspx?PRID=2099182",
      "snippet": "Ministry of Agriculture notifies updated exclusion criteria: institutional landholders, income tax payers from previous assessment year remain excluded.",
      "date": "Sep 24, 2026"
    },
    {
      "position": 4,
      "title": "How to check PM Kisan beneficiary status online",
      "link": "https://vikaspedia.in/agriculture/policies-and-schemes/pm-kisan-status",
      "snippet": "Step-by-step portal instructions for farmers to verify registration number, PFMS account status, and installment disbursement schedule.",
      "date": null
    },
    {
      "position": 5,
      "title": "PM Kisan 20th Installment Date & Verification Rules",
      "link": "https://kisanportal.nic.in/updates/installment-20",
      "snippet": "Mandatory requirements: land seeding verification, physical verification of 5% beneficiaries, and bank account seeding prior to release.",
      "date": "Sep 22, 2026"
    },
    {
      "position": 6,
      "title": "Department of Agriculture: DBT Portal Directives",
      "link": "https://dbtbharat.gov.in/scheme/scheme-details?schemeId=452",
      "snippet": "Public directives for welfare transfer processing under PM-KISAN, specifying validation against state revenue records and public finance portals.",
      "date": "Sep 15, 2026"
    },
    {
      "position": 7,
      "title": "PM Kisan Samman Nidhi: State-wise Grievance Redressal",
      "link": "https://pmkisan.gov.in/Grievance.aspx",
      "snippet": "Nodal officer contacts and district grievance cells for rectification of name mismatches and bank IFSC corrections.",
      "date": null
    },
    {
      "position": 8,
      "title": "State Agriculture Department Advisory on PM-KISAN e-KYC",
      "link": "https://krishi.bihar.gov.in/pmkisan-advisory",
      "snippet": "Advisory notice: CSC centers authorized to facilitate biometric e-KYC without additional fees. Deadline set to October 15, 2026.",
      "date": "Sep 18, 2026"
    },
    {
      "position": 9,
      "title": "National Informatics Centre: PM-KISAN API Integration Manual",
      "link": "https://nic.in/resources/pmkisan-api-spec-v3",
      "snippet": "Technical architecture and schema specification for state revenue land database synchronization with central PM-KISAN beneficiary database.",
      "date": "Aug 30, 2026"
    },
    {
      "position": 10,
      "title": "Press Information Bureau: Union Cabinet Approvals for Agriculture",
      "link": "https://pib.gov.in/PressReleasePage.aspx?PRID=2098410",
      "snippet": "Cabinet briefing on fund allocations for income support schemes, farmer credit limits, and crop insurance adjustments for the kharif cycle.",
      "date": "Sep 10, 2026"
    }
  ],
  "news": [
    {
      "title": "Centre revises PM-KISAN verification norms: What changes for applicants",
      "link": "https://thehindu.com/news/national/pm-kisan-verification-norms-update-2026/article69812401.ece",
      "source": "The Hindu",
      "date": "1 day ago",
      "snippet": "The Union Ministry of Agriculture announced stringent verification checks for new applicants, integrating real-time land registry records across twelve states."
    },
    {
      "title": "PM Kisan Next Installment: Mandatory e-KYC and land seeding advisory issued",
      "link": "https://economictimes.indiatimes.com/news/india/pm-kisan-next-installment-mandatory-ekyc-rules/articleshow/113829012.cms",
      "source": "The Economic Times",
      "date": "2 days ago",
      "snippet": "Over 20 lakh accounts flagged for missing land seeding. Farmers advised to complete bio-authentication before the upcoming installment rollout."
    },
    {
      "title": "Agriculture Ministry clarifies eligibility criteria for tenant farmers under PM-KISAN",
      "link": "https://indianexpress.com/article/india/pm-kisan-tenant-farmers-eligibility-clarification-2026/",
      "source": "The Indian Express",
      "date": "3 days ago",
      "snippet": "Official clarification states scheme remains restricted to landowning cultivator households; state-specific alternate schemes to cover tenant cultivators."
    },
    {
      "title": "State governments fast-track digital land record linking for PM-KISAN beneficiaries",
      "link": "https://business-standard.com/economy/news/pm-kisan-land-records-linking-fast-tracked-2026-1260925001.html",
      "source": "Business Standard",
      "date": "4 days ago",
      "snippet": "Digital India Land Records Modernisation Programme integration reduces turnaround time for farmer verification down to 48 hours."
    },
    {
      "title": "Income tax payee exclusion filters updated in PM-KISAN central database",
      "link": "https://livemint.com/news/india/pm-kisan-exclusion-filters-updated-incometax-payees-2026/",
      "source": "Livemint",
      "date": "5 days ago",
      "snippet": "Automated data exchange between CBDT and Agriculture Ministry removes ineligible beneficiaries from central payment rolls."
    },
    {
      "title": "District collectors directed to resolve pending PM-KISAN registration appeals",
      "link": "https://tribuneindia.com/news/nation/collectors-directed-resolve-pm-kisan-appeals-2026/",
      "source": "The Tribune",
      "date": "6 days ago",
      "snippet": "Special village camps to be conducted across rural districts to rectify bank account discrepancies and demographic mismatches."
    },
    {
      "title": "PM Kisan Samman Nidhi: How Aadhaar-based payment bridge ensures zero leakages",
      "link": "https://financialexpress.com/policy/economy/pm-kisan-aadhaar-payment-bridge-zero-leakage-2026/3618920/",
      "source": "Financial Express",
      "date": "1 week ago",
      "snippet": "DBT via Aadhaar Payment Bridge System (APBS) achieves 99.4% direct transfer success rate in latest audit."
    },
    {
      "title": "Agriculture Minister reviews welfare scheme implementation progress",
      "link": "https://timesofindia.indiatimes.com/india/agri-minister-reviews-pm-kisan-progress/articleshow/113701290.cms",
      "source": "The Times of India",
      "date": "1 week ago",
      "snippet": "High-level review meeting emphasizes saturation of eligible farmers in aspirational districts and prompt grievance disposal."
    },
    {
      "title": "Common Service Centres witness surge in farmers completing PM-KISAN authentication",
      "link": "https://hindustantimes.com/india-news/csc-surge-pm-kisan-authentication-2026/",
      "source": "Hindustan Times",
      "date": "1 week ago",
      "snippet": "Village level entrepreneurs report high turnout as rural beneficiaries rush to meet updated biometric e-KYC compliance."
    },
    {
      "title": "Parliamentary Committee tables report on direct benefit transfer coverage in agriculture",
      "link": "https://prsindia.org/reports/parliamentary-committee-dbt-pm-kisan-2026",
      "source": "PRS Legislative Research",
      "date": "2 weeks ago",
      "snippet": "Report commends inclusion rates while recommending simplified redressal for land records disputed in civil litigation."
    }
  ]
}
```
