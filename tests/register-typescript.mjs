// Native Node TypeScript tests use the same extensionless imports as Vite.
import { register } from 'node:module';

register(
  `data:text/javascript,${encodeURIComponent(`
    export async function resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('.') && !/\\.[a-z]+$/i.test(specifier)) {
        try { return await nextResolve(specifier + '.ts', context); }
        catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
      }
      return nextResolve(specifier, context);
    }
  `)}`,
  import.meta.url,
);
