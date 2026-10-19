# Trust-List Architecture & Intermediate Certificate Resolution Handover

**Author:** Jonah Schmidley
**Audience:** Steven Hall (CTO) & Databench Team
**Project:** P917 — C2PA Content Provenance Integration into a Web Browser    
**Date:** 6 October 2026  

---

### Summary: The Trust-List Gap in the Browser Extension

During Phase 2 empirical testing across commercial C2PA-signed media (Adobe Photoshop, Lightroom, Firefly, OpenAI Sora, DALL-E 3), our verification engine accurately and successfully verified cryptographic signatures

However, commercial production test assets (e.g. the supplied Adobe test assets) currently resolve in the extension to:

> **`Signed — provider not in trust list`** (`verified_untrusted`, grey question mark badge)  
> rather than **`Verified (Trusted)`** (`verified_trusted`, green shield badge).

This document explains the cryptographic root cause of this boundary and why it was preserved under client privacy constraints.

## Cryptographic Root Cause Analysis

### Root Signing
In standard X.509 Public Key Infrastructure (PKI), **Root Certificate Authorities never directly sign end-entity assets**. 

Inspection of Adobe's signing certificate (e.g. from `test-assets/trusted/car.jpg`) reveals a hierarchical subordinate chain:

**Root CA:** Offline Root Anchor (e.g. Adobe Root CA / DigiCert C2PA Root).
**Intermediate CA:** `CN=Adobe Product Intermediate CA` (AKI: `19:5D:A7:EE:FB:F8:CD:C0:F3:92:A5:AC:3E:E0:54:D8:16:EC:3F:14`).

 **Issuing CA (Vault):** `CN=Adobe Product Issuing CA vault-a-or2.adobe.net cai` (SKI: `2E:FA:EF:AD:8F:26:EF:F0:28:CC:84:F7:63:11:B8:6F:1A:C3:5B:08`).
 
**Claim Signature:** Signed by the dynamic issuing vault key.

## Why the Extension Does Not Resolve the Chain

1. **The Complex Privacy Issue**
   Standard web PKI relies on the `Authority Information Access` (AIA) extension (`http://pki-cdn.adobe.net/ca/adobe_internal_intermediate_product`) to download missing intermediate certificates on demand. In a browser extension, executing an outbound HTTP fetch to Adobe’s CDN on every image scanned would **leak the user's browsing activity to third parties** and provide additional privacy concerns to Databench. This is the verification engine working exactly as it is designed. 

2. **Where is this root certificate list coming from?**
   The root certificate list is based on the c2pa-web version when the extension is built. It is updated when a new version of c2pa-web and a npm version bump is released. 

3. **`c2pa-web` WASM Sandbox:**  
   The pre-1.0 `@contentauth/c2pa-web` WASM library operates inside an isolated Web Worker / Chrome Offscreen Document. It bundles only a minimal, static trust store and does not perform internal network chain discovery.

4. **The Flaw of Static SKI Lists:**  
   In Phase 1, our team experimented with a static list of 15 hardcoded Subject Key Identifiers (SKIs). This failed because commercial providers frequently rotate intermediate signing vaults (e.g. `vault-a-or2`, `vault-b-va6`), rendering static lists obsolete within weeks and was not a sustainable way to verify signatures.

## Summary of Verification States Handed Over

| State Code           | User Status Label                  | Current Extension Behaviour      |
| -------------------- | ---------------------------------- | -------------------------------- |
| `verified_trusted`   | Verified, trusted                  | Passed Truepic/embedded root     |
| `verified_tsa`       | Verified via TSA                   | Proven via RFC 3161 timestamp    |
| `verified_untrusted` | Signed, provider not in trust list | Valid signature, unanchored CA   |
| `signing_expired`    | Expired (No TSA)                   | Certificate lapsed, no timestamp |
| `content_tampered`   | Content tampered                   | Flagged (pixel/hash mismatch)    |
| `broken_signature`   | Broken signature                   | Flagged (corrupt signature)      |
| `no_credentials`     | No Content Credentials             | Plain un-signed media            |

#### Integration Option 1: Dynamic URLs in SDK Settings (no extension updates needed)

`@contentauth/c2pa-web` natively accepts URLs in `trust.trustAnchors` or `trust.userAnchors`. The SDK fetches and concatenates them automatically.

In extension/src/offscreen/offscreen.js:

```
_sdkPromise = createC2pa({
  settings: {
    trust: {
      // The SDK can fetch the live CAWG / C2PA root store from a hosted CDN/endpoint:
      trustAnchors: [
        'https://your-browser-cdn.com/c2pa/trust-anchors.pem',
        'https://cawg.collab.digicert.com/trust-list/cawg-trust-list.pem'
      ]
    },
    cawgTrust: {
      verifyTrustList: true
    }
  }
});
```

#### Integration Option 2: Native Browser Root Store Hook (requires direct compile)

Possible integration with the browser engine itself (inside MaxBrowser's native component rather than just a WebExtension).

- Expose an internal browser API or 
- Feed Chromium's native Certificate Root Store / local trust manager directly into the verification worker.

c2pa trust list additional reading: https://opensource.contentauthenticity.org/docs/conformance/trust-lists/
c2pa maintained trust list link: https://spec.c2pa.org/conformance-explorer/