// dev.ts

import { watch } from "fs";
import { build, Glob , plugin } from "bun";
import { readdir, stat, unlink, rmdir, mkdir, rm } from "fs/promises";
import path, { join, relative, dirname } from "path";
import type { ServerWebSocket } from "bun";
import { createServer } from "net";
import browserslist from 'browserslist';
import { transform, browserslistToTargets, Features } from 'lightningcss';
let isBuilding = false;
import { globResolverPlugin } from './globresolver';
const clients = new Set<ServerWebSocket<unknown>>();
import * as sass from "sass";
import postcss from "postcss";
import postcssImport from "postcss-import";
import stylelint from 'stylelint';
import posthtml from 'posthtml';
import include from 'posthtml-include';
import {BunImageTransformPlugin} from "bun-image-transform";
import { symlink } from "fs/promises";
import sharp from "sharp";
Bun.plugin(BunImageTransformPlugin());
// plugin(BunImageTransformPlugin());
plugin(globResolverPlugin());

async function findAvailablePort(startPort: number = 1234): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", () => {
      findAvailablePort(startPort + 1).then(resolve, reject);
    });
    server.listen(startPort, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir);
  const allFiles: string[] = [];
  for (const file of files) {
    const filePath = join(dir, file);
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      allFiles.push(...(await getAllFiles(filePath)));
    } else {
      allFiles.push(filePath);
    }
  }
  return allFiles;
}

async function buildProject() {
    const srcDir = "./src";
    const outDir = "./dist";
    const allSrcFiles = await getAllFiles(srcDir);
  
    isBuilding = true;
    try {
      console.log("Building project, buns in the oven...");
      await mkdir(outDir, { recursive: true });
      
      // Handle TS/JS files
      const tsJsFiles = allSrcFiles.filter(file => file.endsWith(".ts") && !file.endsWith(".d.ts"));
      const result = await Bun.build({
        entrypoints: tsJsFiles,
        outdir: path.join(outDir, 'js'), //this is to rename our dist dir to js not ts
        target: "bun",
        format: "esm",
        sourcemap: "inline",
        splitting: true, // 
        minify: false,
        plugins: [globResolverPlugin(), BunImageTransformPlugin()],
      });
  
      if (!result.success) {
        console.error("Uh, oh buns burning. Build failed:", result.logs);
        return;
      }
      // Create the css output directory
    await mkdir(path.join(outDir, 'css'), { recursive: true });
    // process css/scss and maintain dir structure of other stuff
  for (const file of allSrcFiles) {
    const relativePath = path.relative(srcDir, file);
    let destPath = path.join(outDir, relativePath);

    if (file.endsWith(".scss") || file.endsWith(".css")) {
      let cssContent;
      if (file.endsWith(".scss")) {
        // Compile SCSS
        const result = sass.compile(file, {
          style: "expanded",
          loadPaths: [path.dirname(file)],
        });
        cssContent = result.css;
      } else {
        // Read CSS file
        cssContent = await Bun.file(file).text();
      }

      // Process with PostCSS for optimization and tree shaking
      const postCssResult = await postcss([
        postcssImport(),
      ]).process(cssContent, { from: file, to: destPath.replace(/\.(scss|css)$/, '.css') });

      // Transform with LightningCSS for browser compatibility
      const { code } = transform({
        filename: path.basename(file),
        code: Buffer.from(postCssResult.css),
        minify: true,
        targets: browserslistToTargets(browserslist('>= 0.25%')),
      });

      // Adjust the destination path to put the file in the css folder
      destPath = path.join(outDir, 'css', path.basename(file).replace(/\.(scss|css)$/, '.css'));
      await Bun.write(destPath, code);
    }
 // Handle HTML to reference JS instead of TS and CSS instead of SCSS
    else if (file.endsWith(".html")) {
   
      let htmlContent = await Bun.file(file).text();
        // Process HTML with posthtml
        const result = await posthtml([
          include({ 
            // root: path.join(srcDir, './partials') ,
            root: srcDir,
            onError: (error) => {
              console.error(`Error including partial: ${error.message}`);
            }
          })
        ]).process(htmlContent);
      htmlContent = result.html;
      htmlContent = htmlContent
      .replace(/\.scss/g, '.css')
      .replace(/\.\/scss\//g, './css/')
      htmlContent = htmlContent.replace(/\.ts/g, '.js')
      .replace('./ts/', './js/'); // added this concatted script to make sure that if we linked to ts it will replace with JS and read from the correct folder
      await Bun.write(destPath, htmlContent);
    } else if (!file.endsWith(".ts") && !file.endsWith(".d.ts")) {
      // this is there to make sure if it not ts (e.g., images, fonts) it will still handle the file writing without killing the build.
      //this may need additions for syncing the path and such but hopefully not
      await Bun.write(destPath, Bun.file(file));
      await mkdir(path.dirname(destPath), { recursive: true });
    }

    
  }

  console.log("Build completed. Buns fresh off the oven.");
    } catch (error) {
      console.error("Build error:", error);
    } finally {
      isBuilding = false;
    
    }
    await copyAssets();
  }

  async function copyAssets() {
    const assetDir = "./assets";
    const distAssetDir = "./dist/assets";
  
    // create the dist asset directory if it doesn't exist
    await mkdir(distAssetDir, { recursive: true });
  
    // Symlink the entire assets folder
    try {
      await symlink(path.resolve(assetDir), path.resolve(distAssetDir), 'dir');
      console.log("Assets symlinked successfully");
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.error("Error symlinking assets:", error);
      }
    }
  
    // Process images with query parameters
    const allAssetFiles = await getAllFiles(assetDir);
    for (const asset of allAssetFiles) {
      if (asset.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
        const relativePath = path.relative(assetDir, asset);
        const destPath = path.join(distAssetDir, relativePath);
  
        // Check if the image has query parameters
        const queryMatch = relativePath.match(/\?(.+)$/);
        if (queryMatch) {
          const queryParams = new URLSearchParams(queryMatch[1]);
          const width = parseInt(queryParams.get('width') || '0');
          const height = parseInt(queryParams.get('height') || '0');
          const format = queryParams.get('format');
  
          // Optimize and transform the image
          let sharpInstance = sharp(asset);
          if (width || height) {
            sharpInstance = sharpInstance.resize(width || null, height || null);
          }
          if (format) {
            sharpInstance = sharpInstance.toFormat(format as keyof sharp.FormatEnum);
          }
  
          await sharpInstance.toFile(destPath.replace(/\?.*$/, ''));
          console.log(`Optimized image: ${relativePath}`);
        }
      }
    }
  }
  // async function lintStyles(distDir: string) {
  //   // const cssFiles = path.join(distDir, 'css', '*.css');
  //   // const lazy = postcss([autoprefixer]).process(css);
  //   const config = await stylelint.resolveConfig('stylelintConfig');
  //   const cssDir = path.join(distDir, 'css');
  //   const cssFiles = ['*.css', '/**.css'];
  //   const result = await stylelint.lint({
  //     cwd: path.dirname(cssDir),
  //     files: cssFiles,
  //     config: config,
  //     // configBasedir: url.fileURLToPath(new URL("configs", import.meta.url)),
  //     fix: true, // Automatically fix issues if possible
  //   });
  //   try {
  //     const result = await stylelint.lint({
  //       cwd: path.dirname(cssDir),
  //       files: cssFiles,
  //       config: config,
        
  //       // configBasedir: url.fileURLToPath(new URL("configs", import.meta.url)),
  //       fix: true, // Automatically fix issues if possible
  //     });
  //     // do things with result.report, result.errored, and result.results
  //   } catch (err) {
  //     // do things with err e.g.
  //     console.error(err.stack);
  //   }
  //   return result;
  // }

async function startServer() {
    const port = await findAvailablePort();
    
    const server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        
        // Serve static files from the dist directory
        let filePath = path.join("./dist", url.pathname);
      
        // BunImageTransformPlugin({
        //   outputDirectory: "./build/public/img/",
        //   useRelativePath: true,
        //   prefixRelativePath: "img/",
        // });
        // Serve index.html by default
        if (url.pathname === '/' || url.pathname === '/index.html') {
            filePath = path.join("./dist", 'index.html');
        }
      
      const file = Bun.file(filePath);

        return file.exists().then(exists => {
          if (exists) {
            return new Response(file);
          } else {
            return new Response("Not Found", { status: 404 });
          }
        });
      },
      websocket: {
        message(ws, message) {
          // Handle WebSocket messages if needed
          console.log(`Received message: ${message}`);
          ws.send(`Echo: ${message}`);
        },
        open(ws) {
          clients.add(ws);
        },
        close(ws) {
          clients.delete(ws);
        },
      },
    });
  
    console.log(`Server running at http://localhost:${port}`);
    return server;
  }
  

async function main() {
  await buildProject();
  await startServer();

  watch("src", { recursive: true }, async () => {
    if (!isBuilding) {
      await buildProject();
    }
     else {
      clients.forEach(client => client.send("reload"));
    }
  });

  watch("dist", { recursive: true }, () => {
    clients.forEach(client => client.send("reload"));
  });

  
}


main().catch(console.error);


console.log("Buns are in the oven.");
console.log("");