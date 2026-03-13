/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const path = require('path');
const rspack = require('@rspack/core');

/** @type {import('@rspack/core').Configuration} */
module.exports = {
	context: path.dirname(__dirname),
	mode: 'none',
	target: 'webworker',
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		mainFields: ['main', 'module'],
		extensions: ['.ts', '.js'],
		fallback: {
			assert: require.resolve('assert'),
			path: require.resolve('path-browserify'),
			util: require.resolve('util/'),
		},
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				loader: 'builtin:swc-loader',
				options: {
					jsc: {
						parser: {
							syntax: 'typescript',
						},
					},
				},
				type: 'javascript/auto',
			},
		],
	},
	plugins: [
		new rspack.ProvidePlugin({
			process: 'process/browser',
		}),
	],
	externals: {
		vscode: 'commonjs vscode',
	},
	performance: {
		hints: false,
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, '../out/web'),
		libraryTarget: 'commonjs',
	},
	devtool: 'nosources-source-map',
};
