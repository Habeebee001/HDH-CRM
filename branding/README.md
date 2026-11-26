# HDH CRM: brand & design guide

HDH CRM is built on [Atomic CRM](https://github.com/marmelab/atomic-crm) (MIT).
This folder holds the brand source files, the tooling that generates the logo
assets, and design-review screenshots.

## Design direction: "Ink & Champagne"

Elegant, monochrome and calm, inspired by the hand-drawn HDH signature
monogram. Ink and warm ivory carry the interface; champagne gold is a sparing
accent used for active states, focus rings, highlights and charts.

| Token | Light mode | Dark mode | Used for |
| --- | --- | --- | --- |
| Ink (`--primary` / `--foreground`) | `#111114` | `#EEEAE2` (ivory) | Text, primary buttons |
| Background | `#F7F5F0` warm ivory | `#0E0E10` | Page background |
| Card | `#FFFFFF` | `#17171A` | Cards, popovers |
| Brand gold (`--brand`) | `#A27D3A` (deep, for contrast) | `#D4B272` | Labels, active nav, icons |
| Gold (logo/charts) | `#C6A15B` | `#C6A15B` | Chart "won", splash bar |
| Header (`--header`) | `#111114` | `#09090B` | Always-dark app bar |
| Oxblood | `#A4453F` | `#A4453F` | Chart "lost" |

All tokens live in `src/index.css` (`:root` = light, `.dark` = dark).
The app bar, auth brand panel and mobile bars use the `dark` class to scope the
dark palette, so everything inside them adapts automatically.

### Typography

- **Playfair Display** (`font-display` class): wordmark, page and section
  titles, greetings. Keep it at weight 400–500.
- **Inter**: everything else (UI, tables, forms).
- `.eyebrow` class: small uppercase gold labels (dates, "Welcome back"…).

## Logo assets

Source: `branding/source/hdh-logo.png` (black monogram on transparent).

`python3 branding/vectorize_logo.py` regenerates everything:

| File | Use |
| --- | --- |
| `src/components/atomic-crm/root/logos/hdh_logo_{ink,ivory,gold}.svg` | Fine cut, for large displays (login hero) |
| `src/components/atomic-crm/root/logos/hdh_mark_{ink,ivory,gold}.svg` | Bold cut, for small sizes (header, mobile) |
| `public/logos/hdh_logo.svg` | Splash screen |
| `public/favicon.ico`, `public/appIcon/*.png` | Browser tab, PWA / home-screen icons |

Requirements: `pip install pillow numpy potracer`.

## Where the branding is wired

- `src/components/atomic-crm/root/defaultConfiguration.ts`: title (`HDH CRM`),
  logos, currency (`NGN`)
- `src/components/atomic-crm/layout/Header.tsx`: desktop app bar
- `src/components/atomic-crm/login/BrandPanel.tsx`: auth pages brand panel
- `src/components/atomic-crm/dashboard/DashboardHeader.tsx`: greeting header
- `index.html`, `public/manifest.json`: page title, splash, PWA metadata

## Screenshots

`python3 branding/screenshots.py dashboard contacts deals login dark` (with the
demo running: `npm run dev:demo`) writes review screenshots to `/tmp/shots`.
Curated ones are in `branding/previews/`.
