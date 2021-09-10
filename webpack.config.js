'use strict';

const path = require('path');
const webpack = require('webpack')

const config = {
    target: 'node',
    mode: 'development',
    entry: {
        cli: './source/cli.js',
        'cli-add': './source/cli-add.js'
    },
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: "commonjs2",
        // devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: false,
    module: {
        rules: [
            { test: /\.js$/, loader: "shebang2-loader" },
        ]
    },
    plugins: [
        new webpack.BannerPlugin({ banner: '#!/usr/bin/env node', raw: true }),
    ]
}

module.exports = config;
