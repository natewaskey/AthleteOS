# Anthropic TypeScript SDK (vendored browser bundle)

`anthropic-sdk.mjs` is `@anthropic-ai/sdk@0.129.0` bundled for the browser with esbuild:

    echo "export { default as Anthropic } from '@anthropic-ai/sdk';" > entry.mjs
    npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --outfile=anthropic-sdk.mjs

Used only by the optional "Generate with Claude" program builder (src/ai.js). MIT licensed, see LICENSE.
