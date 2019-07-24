'use strict';
require('any-observable/register/rxjs-all'); // eslint-disable-line import/no-unassigned-import
const fs = require('fs');
const path = require('path');
const execa = require('execa');
// const del = require('del');
const Listr = require('listr');
const split = require('split');
const {merge, throwError} = require('rxjs');
const {catchError, filter, finalize} = require('rxjs/operators');
const streamToObservable = require('@samverschueren/stream-to-observable');
const readPkgUp = require('read-pkg-up');
const hasYarn = require('has-yarn');
const pkgDir = require('pkg-dir');
const writePkg = require('write-pkg');
const hostedGitInfo = require('hosted-git-info');
const onetime = require('onetime');
const exitHook = require('async-exit-hook');
// const prerequisiteTasks = require('./prerequisite-tasks');
const gitTasks = require('./git-tasks');
// const publish = require('./npm/publish');
// const enable2fa = require('./npm/enable-2fa');
// const npm = require('./npm/util');
// const releaseTaskHelper = require('./release-task-helper');
const generateChangeLog = require('./changelog-helper');
const util = require('./util');
const git = require('./git-util');

const exec = (cmd, args) => {
	// Use `Observable` support if merged https://github.com/sindresorhus/execa/pull/26
	const cp = execa(cmd, args);

	return merge(
		streamToObservable(cp.stdout.pipe(split())),
		streamToObservable(cp.stderr.pipe(split())),
		cp
	).pipe(filter(Boolean));
};

module.exports = async (input = 'patch', options) => {
	options = {
		cleanup: false,
		tests: true,
		publish: false,
		changeLog: true,
		...options
	};

	if (!hasYarn() && options.yarn) {
		throw new Error('Could not use Yarn without yarn.lock file');
	}

	// TODO: Remove sometime far in the future
	if (options.skipCleanup) {
		options.cleanup = false;
	}

	const pkg = util.readPkg();
	const runTests = options.tests && !options.yolo;
	const runCleanup = options.cleanup && !options.yolo;
	const runPublish = options.publish && !pkg.private;
	const changeLog = options.changeLog;
	const pkgManager = options.yarn === true ? 'yarn' : 'npm';
	const pkgManagerName = options.yarn === true ? 'Yarn' : 'npm';
	const rootDir = pkgDir.sync();
	const hasLockFile = fs.existsSync(path.resolve(rootDir, options.yarn ? 'yarn.lock' : 'package-lock.json')) || fs.existsSync(path.resolve(rootDir, 'npm-shrinkwrap.json'));
	const isOnGitHub = options.repoUrl && (hostedGitInfo.fromUrl(options.repoUrl) || {}).type === 'github';

	let isPublished = false;

	const rollback = onetime(async () => {
		console.log('\nPublish failed. Rolling back to the previous state…');

		const tagVersionPrefix = await util.getTagVersionPrefix(options);

		const latestTag = await git.latestTag();
		const versionInLatestTag = latestTag.slice(tagVersionPrefix.length);

		try {
			if (versionInLatestTag === util.readPkg().version &&
				versionInLatestTag !== pkg.version) { // Verify that the package's version has been bumped before deleting the last tag and commit.
				await git.deleteTag(latestTag);
				await git.removeLastCommit();
			}

			console.log('Successfully rolled back the project to its previous state.');
		} catch (error) {
			console.log(`Couldn't roll back because of the following error:\n${error}`);
		}
	});

	exitHook(callback => {
		if (!isPublished && runPublish) {
			(async () => {
				await rollback();
				callback && callback();
			})();
		} else {
			callback && callback();
		}
	});

	const tasks = new Listr([
		// {
		// 	title: 'Prerequisite check',
		// 	enabled: () => runPublish,
		// 	task: () => prerequisiteTasks(input, pkg, options)
		// },
		{
			title: 'Git',
			task: () => gitTasks(options)
		}
	], {
		showSubtasks: false
	});

	if (false && runTests) {
		tasks.add([
			{
				title: 'Running tests using npm',
				enabled: () => options.yarn === false,
				task: () => exec('npm', ['test'])
			},
			{
				title: 'Running tests using Yarn',
				enabled: () => options.yarn === true,
				task: () => exec('yarn', ['test']).pipe(
					catchError(error => {
						if (error.message.includes('Command "test" not found')) {
							return [];
						}

						return throwError(error);
					})
				)
			}
		]);
	}

	if(options.isBuild) {
		tasks.add({
			title: 'Update build number',
			task: async ()=>{
				pkg.build = (pkg.build | 0) + 1
				await writePkg(rootDir, pkg, {normalize: false})
				await exec('git', ['add', '-u'])
				await exec('git', ['commit', '-m', `build: ${options.version}`])
			}
		})
	} else {
		tasks.add({
			title: 'Generate Changelog',
			enabled: () => changeLog && options.hasCommits,
			task: async ()=>{
				await generateChangeLog(options, pkg, {rootDir})
				await exec('git', ['add', '.'])
			}
		})

		tasks.add([
			{
				title: 'Bumping version using Yarn',
				enabled: () => options.yarn === true,
				task: () => exec('yarn', ['version', '--new-version', input])
			},
			{
				title: 'Bumping version using npm',
				enabled: () => options.yarn === false,
				task: () => exec('npm', ['version', '-f', input])
			}
		]);

		false && tasks.add({
			title: 'Pushing tags',
			skip: async () => {
				if (!(await git.hasUpstream())) {
					return 'Upstream branch not found; not pushing.';
				}

				if (!isPublished && runPublish) {
					return 'Couldn\'t publish package to npm; not pushing.';
				}
			},
			task: () => git.push()
		});
	}

	await tasks.run();

	const {package: newPkg} = await readPkgUp();
	return newPkg;
};
