#!/usr/bin/env node
'use strict';
// eslint-disable-next-line import/no-unassigned-import
require('symbol-observable'); // Important: This needs to be first to prevent weird Observable incompatibilities
require('any-observable/register/rxjs-all'); // eslint-disable-line import/no-unassigned-import
const logSymbols = require('log-symbols');
const meow = require('meow');
// const updateNotifier = require('update-notifier');
// const hasYarn = require('has-yarn');
const config = require('./config');
// const {isPackageNameAvailable} = require('./npm/util');
const version = require('./version');
const util = require('./util');
const ui = require('./ui');
const np = require('.');
const cp = require('child_process');

const cli = meow(`
	Usage
	  $ vl <version>
	  $ verlog <version>

	  Version can be:
	    ${version.SEMVER_INCREMENTS.join(' | ')} | 1.2.3

	Options
	  -a, --add           Invoke veradd
	  --any-branch        Allow publishing from any branch
	  --no-cleanup        Skips cleanup of node_modules
	  --no-tests          Skips tests
	  --yolo              Skips cleanup and testing
	  --no-publish        Skips publishing
	  --tag               Publish under a given dist-tag
	  --no-yarn           Don't use Yarn
	  --contents          Subdirectory to publish
	  --no-release-draft  Skips opening a GitHub release draft
	  --no-change-log     Skips generate change log

	Examples
	  $ vl
	  $ vl patch
	  $ vl 1.0.2
	  $ vl 1.0.2-beta.3 --tag=beta
	  $ vl 1.0.2-beta.3 --tag=beta --contents=dist
`, {
	booleanDefault: undefined,
	flags: {
		add: {
			type: 'boolean',
			default: false,
			alias: 'a'
		},
		anyBranch: {
			type: 'boolean',
			default: true
		},
		cleanup: {
			type: 'boolean'
		},
		tests: {
			type: 'boolean'
		},
		yolo: {
			type: 'boolean'
		},
		publish: {
			type: 'boolean'
		},
		releaseDraft: {
			type: 'boolean',
			default: true
		},
		changeLog: {
			type: 'boolean',
			default: true
		},
		tag: {
			type: 'string'
		},
		yarn: {
			type: 'boolean'
		},
		contents: {
			type: 'string'
		}
	}
});

// updateNotifier({pkg: cli.pkg}).notify();

(async () => {

	const defaultFlags = {
		cleanup: false,
		tests: true,
		publish: false,
		changeLog: true,
		yarn: false,
		// yarn: hasYarn()
	};

	const localConfig = await config();

	const flags = {
		...defaultFlags,
		...localConfig,
		...cli.flags
	};

	if (flags.add) {
		const child = cp.spawn(process.execPath, [ __dirname + '/cli-add.js' ], {
			stdio: 'inherit',
			detached: true
		});
		child.unref();
		process.exit();
	}

	const isAvailable = true // flags.publish ? await isPackageNameAvailable(pkg) : false;

	const version = cli.input.length > 0 ? cli.input[0] : false;

	const pkg = util.readPkg();

	const options = await ui({...flags, exists: !isAvailable, version}, pkg);

	if (!options.confirm) {
		process.exit(0);
	}

	console.log(); // Prints a newline for readability
	const newPkg = await np(options.version, options);
})().catch(error => {
	console.error(`\n${logSymbols.error} ${error.message}`);
	process.exit(1);
});
