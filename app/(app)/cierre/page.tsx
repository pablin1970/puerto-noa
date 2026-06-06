21:10:04.696 Running build in Washington, D.C., USA (East) – iad1
21:10:04.698 Build machine configuration: 2 cores, 8 GB
21:10:04.922 Cloning github.com/pablin1970/puerto-noa (Branch: main, Commit: 729d9a3)
21:10:04.924 Previous build caches not available.
21:10:05.300 Cloning completed: 378.000ms
21:10:05.802 Running "vercel build"
21:10:05.961 Vercel CLI 54.9.0
21:10:06.802 Installing dependencies...
21:10:34.067 npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
21:10:34.840 npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
21:10:35.684 npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
21:10:35.748 npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
21:10:35.772 npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
21:10:35.809 npm warn deprecated @supabase/auth-helpers-shared@0.7.0: This package is now deprecated - please use the @supabase/ssr package instead.
21:10:35.963 npm warn deprecated @supabase/auth-helpers-nextjs@0.10.0: This package is now deprecated - please use the @supabase/ssr package instead.
21:10:36.516 npm warn deprecated glob@10.3.10: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
21:10:37.632 npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
21:10:41.126 npm warn deprecated next@14.2.5: This version has a security vulnerability. Please upgrade to a patched version. See https://nextjs.org/blog/security-update-2025-12-11 for more details.
21:10:41.370 
21:10:41.371 added 399 packages in 34s
21:10:41.371 
21:10:41.371 151 packages are looking for funding
21:10:41.372   run `npm fund` for details
21:10:41.440 Running "npm run build"
21:10:41.540 
21:10:41.540 > puerto-noa@0.1.0 build
21:10:41.541 > next build
21:10:41.541 
21:10:42.105 Attention: Next.js now collects completely anonymous telemetry regarding usage.
21:10:42.105 This information is used to shape Next.js' roadmap and prioritize features.
21:10:42.106 You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
21:10:42.106 https://nextjs.org/telemetry
21:10:42.106 
21:10:42.154   ▲ Next.js 14.2.5
21:10:42.155 
21:10:42.171    Creating an optimized production build ...
21:10:53.837  ✓ Compiled successfully
21:10:53.839    Linting and checking validity of types ...
21:10:57.869 Failed to compile.
21:10:57.870 
21:10:57.871 ./app/(app)/cierre/page.tsx:63:47
21:10:57.871 Type error: Argument of type '{ pasos: boolean[]; updated_at: string; }' is not assignable to parameter of type 'never'.
21:10:57.872 
21:10:57.872   61 |     const newPasos = [...pasos]
21:10:57.872   62 |     newPasos[i] = !newPasos[i]
21:10:57.872 > 63 |     await supabase.from('operaciones').update({ pasos: newPasos, updated_at: new Date().toISOString() }).eq('id', op.id)
21:10:57.873      |                                               ^
21:10:57.873   64 |     loadOps()
21:10:57.873   65 |   }
21:10:57.874   66 |
21:10:57.922 Error: Command "npm run build" exited with 1
