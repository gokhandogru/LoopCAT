# LoopCAT Brand Guidelines

LoopCAT's brand idea is **Translation, in flow.** The product should feel precise, fluid, and human while remaining visibly local-first and translator-controlled.

## Positioning And Naming

- Category descriptor: **The local-first translation workspace**.
- Product name: always **LoopCAT**, with that capitalization.
- Platform names: **LoopCAT Web** and **LoopCAT Desktop**.
- Product-language default: **Local AI**. Reserve “AI Command Centre” for technical or advanced settings where the distinction is useful.
- Symbol name: **Loopbird**.

## Logo System

The Loopbird is a right-facing hummingbird drawn as a continuous teal-and-clay silhouette. It represents speed with precision and the feedback loop between translator judgment and optional machine assistance.

- Use [`icons/loopcat-icon.svg`](../icons/loopcat-icon.svg) as the full-colour master. It is the source for the PWA and desktop PNG, ICO, and ICNS files.
- Use [`icons/loopcat-loopbird-mono.svg`](../icons/loopcat-loopbird-mono.svg) for one-colour or very small applications.
- Keep the artwork borderless and transparent. Do not add a tile, outline, border, shadow, rotation, or decorative effects.
- Prefer the full-colour mark at 24 px and above; prefer the mono mark from 16–23 px.
- Maintain the right-facing orientation and preserve the SVG view box and proportions.
- Regenerate platform assets with `pnpm branding:icons` after changing the master SVG.

## Core Palette

| Token | Hex | Use |
| --- | --- | --- |
| Deep Pine | `#0B3F3A` | Primary text, strong actions, mono mark |
| Interface Teal | `#0B756D` | Controls and primary product UI |
| Bright Teal | `#0B8F83` | Active states and full-colour mark |
| Seafoam | `#B7E4D8` | Soft highlights and selected states |
| Warm Ivory | `#FBF7EF` | Main canvas |
| Clay | `#E66A47` | Small warm accent; use sparingly |
| Secondary text | `#58716D` | Supporting copy |
| Divider | `#C9D9D3` | Lines and low-emphasis borders |
| Success | `#16745F` | Success feedback |
| Warning | `#A45A18` | Warning feedback |
| Error | `#B6434E` | Error and destructive feedback |

Use Inter where available, with the system sans-serif stack as fallback. Avoid gradients, neon treatments, rainbow “AI” styling, and decorative reuse of the bird's curves.

## Product Principles

1. **Human in command:** make state, provenance, undo, approval, and data-sharing choices visible.
2. **Local by default:** explain what stays on the device and label any external connection before data leaves it.
3. **Power without friction:** keep advanced CAT and AI capability progressive rather than visually dominant.
4. **Visible feedback:** show clear progress, save state, completion, and error recovery.

Motion should be restrained, purposeful, and normally complete in one pass. Respect `prefers-reduced-motion` and never make motion the only carrier of meaning.

Before a major commercial launch, complete a professional trademark and visual-conflict review for the name and Loopbird symbol.
