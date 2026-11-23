import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const bundle = await rolldown({
  input: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
  platform: "browser",
  // The loader only uses APP_NAME at runtime, so exclude unused shared schemas.
  treeshake: { moduleSideEffects: false },
});
const options = {
  format: "iife",
  minify: true,
  file: fileURLToPath(new URL("../web/public/dist/widget.js", import.meta.url)),
};

try {
  const { output: [widget] } = await bundle.generate(options);
  const size = Buffer.byteLength(widget.code);
  if (size >= 5000) throw new Error(`widget.js is ${size} bytes. It must be under 5000 bytes.`);
  await bundle.write(options);
  console.log(`widget.js: ${size} bytes`);
} finally {
  await bundle.close();
}
