# Ambleloft icons

- `ambleloft-master.png`: standalone transparent tile prepared using the built-in image_gen tool.
- `ambleloft.icns`: macOS icon, including Retina sizes.
- `ambleloft.ico`: Windows icon with 16–256 px PNG frames.
- `../../public/brand/`: 16–1024 px PNG exports, favicon and Apple touch icon.

Run `npm run icons:generate` on macOS to regenerate the exports using sips. PNG alpha is retained; ICNS and ICO embed the resized PNGs. These assets are wired into the sidebar, development Dock icon, browser favicon and Electron packaging configuration. Rebuild the installer to update an installed app's icon.

## Image preparation prompts (built-in image_gen)

Initial extraction:

Asset preparation edit of APPROVED logo. Extract ONLY the rounded-square turquoise/green app icon from the provided design sheet into a standalone square PNG app icon with genuinely TRANSPARENT outside corners. Remove the Ambleloft wordmark and the surrounding white presentation background entirely. Preserve the exact approved cartoon black cat design, proportions, half-lidded asymmetric eyes, tail, white orbital ring, colors and teal-green background inside the tile. No redesign or new elements. Center the tile on the square canvas, tile fills 96% canvas width and height with a narrow even transparent safety margin. No white border, no text, no external drop shadow. High resolution clean edges, production app icon. Transparent pixels outside the rounded rectangle, opaque teal gradient inside it.

Final cleanup:

Precise cleanup edit only. Preserve this icon design exactly: black abstract cartoon cat with sleepy half-circle eyes, hooked tail, pale orbital ring, teal-green rounded square tile. Clean the alpha boundary: remove ALL stray teal pixels, speckles, white remnants, rough fringes outside the tile. Tile must have a pristine mathematically smooth continuous rounded-square silhouette with antialiased edges and truly transparent exterior. Center tile with even 6% transparent margins on all four sides. No text, no shadows, no glow. Do not change the cat, ring, color palette, pose or proportions. Production-quality PNG app icon with clean transparency.
