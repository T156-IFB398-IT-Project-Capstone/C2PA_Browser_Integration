# c2patool Guide

Notes on the C2PA signing workflow used to produce test assets in `test-assets/`.
See `test-assets/README.md` for the full asset inventory.

## Installation

Follow the official c2patool install instructions:
<https://opensource.contentauthenticity.org/docs/c2patool/>

## Inspecting manifests (Adobe web tool)

Drag any image onto Adobe's online C2PA inspector to view its raw manifest:
<https://contentauthenticity.adobe.com/inspect>

## Producing tampered test cases

To create a `tampered/` sample from an existing signed image:

```bash
# Sign a source image
c2patool sign input.jpg --manifest manifest.json -o signed.jpg

# Flip a few bytes in the pixel data to break the hash
# (use dd or a hex editor — do NOT modify the manifest region)
```

The resulting file should produce `validation_state: "Invalid"` in c2pa-web,
mapping to `VERIFY_STATUS.INVALID_OR_CHANGED` in the extension.
