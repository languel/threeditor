// Build with esbuild, Prettier 3.9.10, and Terser 5.51.2; see README.
import * as prettier from 'prettier/standalone';
import * as babel from 'prettier/plugins/babel';
import * as estree from 'prettier/plugins/estree';
import { minify } from 'terser';
export async function formatCode(text, range) { return prettier.format(text, { parser: 'babel', plugins: [babel, estree], tabWidth: 2, printWidth: 100, ...(range ? {rangeStart:range.from,rangeEnd:range.to} : {}) }); }
export async function minifyCode(text) { return (await minify(text, { module: /^\s*(import|export)\b/m.test(text), compress: false, mangle: false, parse: {bare_returns:true}, format:{comments: 'all'} })).code; }
