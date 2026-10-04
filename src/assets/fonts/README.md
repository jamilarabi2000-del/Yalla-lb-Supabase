# Self-hosted fonts

The six families the store uses, served from this site (see `src/fonts.css`).
They are the fontsource builds of the Google Fonts families, all under the
**SIL Open Font License 1.1** (the licence text of each is in `licenses/`).
Each family keeps its original name, which is what Style Text, the theme picker
and the CSS font stacks refer to.

Only the scripts the store needs are included: Latin, Latin Extended and Arabic
(not Cyrillic, Greek or Vietnamese). A character outside those falls back to the
next font in the stack.

| File | Family | Script | Size | Source package |
| --- | --- | --- | --- | --- |
| `plus-jakarta-sans-latin-ext-wght-normal.woff2` | Plus Jakarta Sans | latin-ext | 21.2 kB | @fontsource-variable/plus-jakarta-sans@5.3.0 |
| `plus-jakarta-sans-latin-wght-normal.woff2` | Plus Jakarta Sans | latin | 26.7 kB | @fontsource-variable/plus-jakarta-sans@5.3.0 |
| `playfair-display-latin-ext-wght-normal.woff2` | Playfair Display | latin-ext | 20.6 kB | @fontsource-variable/playfair-display@5.3.0 |
| `playfair-display-latin-wght-normal.woff2` | Playfair Display | latin | 37.5 kB | @fontsource-variable/playfair-display@5.3.0 |
| `playfair-display-latin-ext-wght-italic.woff2` | Playfair Display | latin-ext | 22.8 kB | @fontsource-variable/playfair-display@5.3.0 |
| `playfair-display-latin-wght-italic.woff2` | Playfair Display | latin | 37.9 kB | @fontsource-variable/playfair-display@5.3.0 |
| `inter-latin-ext-wght-normal.woff2` | Inter | latin-ext | 83.1 kB | @fontsource-variable/inter@5.3.0 |
| `inter-latin-wght-normal.woff2` | Inter | latin | 47.1 kB | @fontsource-variable/inter@5.3.0 |
| `tajawal-arabic-400-normal.woff2` | Tajawal | arabic | 8.7 kB | @fontsource/tajawal@5.3.0 |
| `tajawal-latin-400-normal.woff2` | Tajawal | latin | 10.0 kB | @fontsource/tajawal@5.3.0 |
| `tajawal-arabic-500-normal.woff2` | Tajawal | arabic | 8.7 kB | @fontsource/tajawal@5.3.0 |
| `tajawal-latin-500-normal.woff2` | Tajawal | latin | 9.7 kB | @fontsource/tajawal@5.3.0 |
| `tajawal-arabic-700-normal.woff2` | Tajawal | arabic | 8.8 kB | @fontsource/tajawal@5.3.0 |
| `tajawal-latin-700-normal.woff2` | Tajawal | latin | 9.8 kB | @fontsource/tajawal@5.3.0 |
| `cairo-arabic-wght-normal.woff2` | Cairo | arabic | 30.2 kB | @fontsource-variable/cairo@5.3.0 |
| `cairo-latin-ext-wght-normal.woff2` | Cairo | latin-ext | 16.3 kB | @fontsource-variable/cairo@5.3.0 |
| `cairo-latin-wght-normal.woff2` | Cairo | latin | 33.0 kB | @fontsource-variable/cairo@5.3.0 |
| `amiri-arabic-400-normal.woff2` | Amiri | arabic | 106.0 kB | @fontsource/amiri@5.3.0 |
| `amiri-latin-ext-400-normal.woff2` | Amiri | latin-ext | 10.2 kB | @fontsource/amiri@5.3.0 |
| `amiri-latin-400-normal.woff2` | Amiri | latin | 19.1 kB | @fontsource/amiri@5.3.0 |
| `amiri-arabic-700-normal.woff2` | Amiri | arabic | 97.6 kB | @fontsource/amiri@5.3.0 |
| `amiri-latin-ext-700-normal.woff2` | Amiri | latin-ext | 10.6 kB | @fontsource/amiri@5.3.0 |
| `amiri-latin-700-normal.woff2` | Amiri | latin | 19.8 kB | @fontsource/amiri@5.3.0 |

Total: 696 kB across 23 files. A visitor downloads only the files for the
characters on the page, in the weights used (the variable fonts carry every weight in one file).

## Updating

Download the package (`npm pack @fontsource-variable/<family>` or `@fontsource/<family>`),
copy the `.woff2` files for the scripts above into this folder, and update the
matching rule in `src/fonts.css`. Keep the family name unchanged.
