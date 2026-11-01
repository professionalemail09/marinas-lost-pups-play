# Marcia's Litter Legends: art and asset provenance (v1.21.0)

v1.20.0 replaces every raster art asset that shipped in v1.19.0 with new, original artwork made for this game
in its pink / purple / gold theme. The v1.19.0 files are kept outside the app in `rollback/www_v1.19.0/` and are not shipped.

| File | What it is | Source |
|---|---|---|
| `marcia_face.webp` (256×256) | Marcia portrait | Original art, AI-generated for this project (Grok Bot image generation), then cropped and compressed |
| `logo.webp` (960×540) | Title logo: golden scoop, Marcia's tail, wordmark "Marcia's Litter Legends" (no shield) | Original emblem art, AI-generated for this project. The wordmark is set in Fredoka (OFL, see below) |
| `art/bg_title.webp`, `art/bg_home.webp`, `art/bg_shop.webp` (720×1280) | Scene backgrounds | Original art, AI-generated for this project |
| `art/bg_map.webp` (720×2000) | World-map background | Original art, AI-generated for this project (with a vertically mirrored extension) |
| `icons/icon-180/192/512.png`, Android launcher/round/foreground mipmaps, splash drawables | App icons and splash | Made from the new Marcia portrait above |
| All other in-game graphics (cats, gear, UI, effects) | Vector drawings in code | Drawn procedurally in the game's own source code |
| `fonts/fredoka.woff2` | Fredoka (subset to Latin, wght 400–700, wdth 100) | SIL Open Font License 1.1: see `OFL-Fredoka.txt` |
| `peerjs.min.js` | PeerJS (online duels) | MIT: see `LICENSE-PeerJS.txt` |
| `plugins/cordova-plugin-purchase/www/store.js` (Android app only) | In-app purchases, loaded only when the Sparkle Store opens on a device | MIT: see `LICENSE-cordova-plugin-purchase.txt` |
| Capacitor runtime (Android app only) | Native app shell | MIT: see `LICENSE-Capacitor.txt` |

## Google Play store-listing graphics (v1.22.0, not shipped inside the app)

Regenerated in v1.22.0 by `store/make_graphics22.py` from real v1.22.0 screens captured with `shot22.js` (`screenshots/v22/`). Screenshot 4 now shows Lavender Lake, one of the 12 new v1.22 zones. They contain no art from before v1.20.

| File | What it is | Source |
|---|---|---|
| `store/graphics/feature_graphic_1024x500.png` | Feature graphic | The v1.20 logo (above) plus a framed real gameplay screenshot, on a generated gradient with sparkles |
| `store/graphics/icon_512.png` | Play listing icon (512×512, 32-bit PNG) | The full-quality v1.20 icon, made from the new Marcia portrait |
| `store/graphics/screenshots/screenshot_01..06.png` (1080×1920) | Phone screenshots: Play, Make My Cat, Wardrobe, Neighborhood, Home, Edit Owner | Real v1.22.0 game screens captured with `shot22.js` (raw captures in `screenshots/v21/`). Caption text is set in Luckiest Guy (Apache License 2.0) and Fredoka (SIL OFL 1.1) on generated gradients |

Generation sources (unprocessed renders) and the build script (`art20/make_art20.py`) are kept in the project repository, outside `www/`.

## v1.22.0 notes
- `icons/icon-512.png`: the same artwork, re-encoded (3×3 mode filter, the same 32-colour palette) from 47,566 to 41,716 bytes.
- The 12 new zones, 50 species, 12 cases and 12 bosses are drawn procedurally in code. No new bitmap assets were added.

## v1.22.1 additions
| Asset | What it is | Source |
|---|---|---|
| Golden Litter Ascension effect (code-drawn, `src/v16.js`: `drawAura`, `goldCat`, `drawGolden`, `drawAscCine`) | Spiky golden glow aura, pink/purple/gold glitter sparkles, golden fur tint over Marcia, radial light rays and "GOLDEN LITTER ASCENSION!" banner | Original procedural canvas art written for this project (no image files, no third-party or franchise art). Name checked against all duel game names: no clash |
| Marcia's Legend Power screen (`mpower` scene) | Stat comparison panel | Original UI code; text in Fredoka (OFL) |

## v1.23.0 additions
| Asset | What it is | Source |
|---|---|---|
| Animation detail pass (code-drawn, `src/anim23.js`, `src/look7.js`) | Cat breathing, blinks, ear twitches, tail lag, squash/stretch, fur tufts, mood faces; Marcia bell twinkle and aura streaks/star ring; avatar walk bounce and sway; litter grains, dust puffs, sparkle trail, lump wobble and gold shine; grass sway, butterflies, petals, cloud shadows, water glints; button bounce and reward sparkles | Original procedural canvas code written for this project. No new image, audio or font files |

## v1.24.0 — Graphics detail pass
All new detail (zone ground textures, AO/lighting, water foam, cobbled paths, 18 per-zone props, fence/flower/building detail, cat fur/eye/whisker/pad detail, player fabric shading, litter/box/scoop shine, boss/duel/Showdown/title stages, framed glitter UI panels) is original, procedurally drawn in code (src/detail24.js). No third-party assets.
