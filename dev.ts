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
        target: "browser",
        format: "esm",
        sourcemap: "inline",
        minify: false,
        plugins: [globResolverPlugin()],
      });
  
      if (!result.success) {
        console.error("Uh, oh buns burning. Build failed:", result.logs);
        return;
      }
  
  // process css/scss and maintain dir structure of other stuff
  for (const file of allSrcFiles) {
    const relativePath = path.relative(srcDir, file);
    const destPath = path.join(outDir, relativePath);

    if (file.endsWith(".css") || file.endsWith(".scss")) {
      const cssContent = await Bun.file(file).text();
      const { code } = transform({
        filename: relativePath,
        code: Buffer.from(cssContent),
        minify: false,
        targets: browserslistToTargets(browserslist('>= 0.25%')),
      });
      await Bun.write(destPath.replace(/\.scss$/, '.css'), code);
    } 
     // handle HTML to reference JS instead of TS
    else if (file.endsWith(".html")) {
   
      let htmlContent = await Bun.file(file).text();
      htmlContent = htmlContent.replace(/\.ts/g, '.js')
      .replace('./ts/', './js/'); // added this concatted script to make sure that if we linked to ts it will replace with JS and read from the correct folder
      await Bun.write(destPath, htmlContent);
    } else if (!file.endsWith(".ts") && !file.endsWith(".d.ts")) {
      // this is there to make sure if it not ts (e.g., images, fonts) it will still handle the file writing without killing the build.
      //this may need additions for syncing the path and such but hopefully not
      await Bun.write(destPath, Bun.file(file));
    }
  }

  console.log("Build completed. Buns fresh off the oven.");
    } catch (error) {
      console.error("Build error:", error);
    } finally {
      isBuilding = false;
    }
  }
  

async function startServer() {
    const port = await findAvailablePort();
    
    const server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        
        // Serve static files from the dist directory
        let filePath = path.join("./dist", url.pathname);
      
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
  });
}

main().catch(console.error);


console.log("Buns are in the oven.");
console.log("");