// prod.ts
import { build } from "bun";
import { readdir, stat, unlink, rmdir, mkdir, writeFile } from "fs/promises";
import { join, relative, dirname, extname } from "path";
import lightningcss from 'bun-lightningcss';
import { transform } from 'lightningcss';

async function main() {
  await buildProject();
}

main().catch(console.error);

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
  const srcDir = "./dist";
  const outDir = "./prod";

  try {
    await mkdir(outDir, { recursive: true });

    const allSrcFiles = await getAllFiles(srcDir);
    const entrypoints = allSrcFiles.filter(file => file.endsWith(".ts") || file.endsWith(".js"));

    await build({
      entrypoints,
      outdir: outDir,
      target: "browser",
      format: "esm",
      sourcemap: "none",
      minify: {
        whitespace: true,
        identifiers: true,
        syntax: true
      },
      root: srcDir,
      plugins: [lightningcss()],
  
    });

    // Process CSS files
    for (const file of allSrcFiles) {
      const relativePath = relative(srcDir, file);
      const destPath = join(outDir, relativePath);
      
      await mkdir(dirname(destPath), { recursive: true });

      if (file.endsWith(".css")) {
        const css = await Bun.file(file).text();
        const { code } = transform({
          filename: file,
          code: Buffer.from(css),
          minify: true,
          sourceMap: false,
          cssModules: {
            pattern: 'cic--[local]',
          },
        });
        await Bun.write(destPath, code);
      } else if (!file.endsWith(".ts") && !file.endsWith(".js")) {
        await Bun.write(destPath, Bun.file(file));
      }
    }


    await cleanupDist(srcDir, outDir);

    console.log("Production completed, buns have risen.");
  } catch (error) {
    // console.error("Build failed:", error);
    catchErrors();
  }

}
async function catchErrors() {
      //add
      const result = await Bun.build({
        entrypoints: ["./src/ts/app.ts"],
        outdir: "./dist",
      });
      
      if (!result.success) {
        throw new AggregateError(result.logs, "Build failed");
      }
}


  async function cleanupDist(srcDir: string, outDir: string) {
    const allSrcFiles = await getAllFiles(srcDir);
    const allDistFiles = await getAllFiles(outDir);
  
    for (const distFile of allDistFiles) {
      const relativePath = relative(outDir, distFile);
      const srcPath = join(srcDir, relativePath);
      
      if (!allSrcFiles.includes(srcPath) && 
          !allSrcFiles.includes(srcPath.replace(/\.js$/, '.ts'))) {
        await unlink(distFile);
      }
    }
  
    // Remove empty directories
    await removeEmptyDirs(outDir);
  }
  
  async function removeEmptyDirs(dir: string) {
    const files = await readdir(dir);
    
    for (const file of files) {
      const fullPath = join(dir, file);
      if ((await stat(fullPath)).isDirectory()) {
        await removeEmptyDirs(fullPath);
      }
    }
  
    const updatedFiles = await readdir(dir);
    if (updatedFiles.length === 0) {
      await rmdir(dir);
    }
  }
