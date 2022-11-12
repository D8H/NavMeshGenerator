import pkg from './package.json';
import typescript from '@rollup/plugin-typescript';
import dts from "rollup-plugin-dts";

export default [
	{
		input: 'src/index.ts',
		output: {
			name: 'NavMeshGenerator',
			format: 'umd',
			file: 'dist/NavMeshGenerator.js',
			sourcemap: true,
		},
		plugins: [typescript()],
	},
	{
		input: "src/index.ts",
		output: [{ file: "dist/NavMeshGenerator.d.ts", format: "umd" }],
		plugins: [dts()],
	}
];