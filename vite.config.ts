import { defineConfig, type Plugin } from "vite";

/**
 * Inlines the bundled JavaScript into index.html so the build is a single file
 * that runs straight from disk (file://), with no web server. Browsers refuse to
 * load separate module scripts from file://, but inline ones run fine.
 */
function inlineScripts(): Plugin {
  return {
    name: "inline-scripts",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === "asset" && f.fileName === "index.html");
      if (!html || html.type !== "asset") return;
      let source = String(html.source);
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type !== "chunk") continue;
        const tag = new RegExp(`<script[^>]*src="[^"]*${chunk.fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`);
        if (!tag.test(source)) continue;
        // Escape "</script" so the code can't end the inline tag early.
        const code = chunk.code.replace(/<\/script/gi, "<\\/script");
        source = source.replace(tag, () => `<script type="module">\n${code}</script>`);
        delete bundle[name];
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  // Relative paths, so the build also works from a subfolder or any static host.
  base: "./",
  build: {
    modulePreload: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
  },
  plugins: [inlineScripts()],
});
