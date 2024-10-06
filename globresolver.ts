import { plugin, type BunPlugin, Glob } from 'bun';
import path from 'path';

function isGlob(path: string): boolean {
  return /[*?{}[\]]/.test(path);
}

export function globResolverPlugin(): BunPlugin {
    return {
      name: 'glob-resolver',
      setup(build) {
        const globCache = new Map<string, any>();
  
        build.onResolve({ filter: /.*/ }, async (args) => {
          if (!isGlob(args.path)) return null;
  
          const cacheKey = args.path + args.importer;
          if (globCache.has(cacheKey)) {
            return globCache.get(cacheKey);
          }
  
          const dir = path.dirname(args.importer);
          const glob = new Glob(args.path);
          const files = await Array.fromAsync(glob.scan({ cwd: dir, absolute: true }));
        // const dir = path.dirname(args.importer);
        // const glob = new Glob(args.path, { cwd: dir });
        // const files = await Array.fromAsync(glob.scan({ absolute: true }));
        // for await (const file of glob) {
        //     files.push(file);
        //   }
          const result = {
            path: args.path,
            namespace: 'glob-imports',
            pluginData: { files },
          };
          globCache.set(cacheKey, result);
          return result;
        });
  
        build.onLoad({ filter: /.*/, namespace: 'glob-imports' }, (args: any) => {
          const files = args.pluginData.files as string[];
          const imports = files.map((file, index) =>
            `import * as mod${index} from ${JSON.stringify(path.relative(process.cwd(), file))};`
          ).join('\n');
          const exports = `export default {
            ${files.map((file, index) => `${JSON.stringify(path.basename(file))}: mod${index}`).join(',\n')}
          };`;
  
          return {
            contents: `${imports}\n${exports}`,
            loader: 'js',
          };
        });
      },
    };
  }
  