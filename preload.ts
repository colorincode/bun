// preload.ts
import { build, Glob , plugin } from "bun";
import {BunImageTransformPlugin} from "bun-image-transform";

Bun.plugin(BunImageTransformPlugin());

BunImageTransformPlugin({
    outputDirectory: "./dist/assets/",
    useRelativePath: true,
    prefixRelativePath: "img/",
  });