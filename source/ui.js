'use strict';
const semver = require('semver');
const inquirer = require('inquirer');
const chalk = require('chalk');
const githubUrlFromGit = require('github-url-from-git');
const isScoped = require('is-scoped');
const util = require('./util');
const git = require('./git-util');
const {prereleaseTags, checkIgnoreStrategy} = require('./npm/util');
const version = require('./version');
const prettyVersionDiff = require('./pretty-version-diff');

const printCommitLog = async repoUrl => {
	repoUrl = repoUrl || ''
	const latest = await git.latestTagOrFirstCommit();
	const commits = await git.commitLogFromRevision(latest);

	if (!commits) {
		return {
			hasCommits: false,
			compareLink: () => {},
			releaseNotes: () => {}
		};
	}

	const history = commits.map(commit => {
		const commitMessage = util.linkifyIssues(repoUrl, commit.message);
		const commitId = util.linkifyCommit(repoUrl, commit.id);
		return `- ${commitMessage}  ${commitId}`;
	}).join('\n');

	const releaseNotes = (arr = commits, indent = '') => {
		return arr.map(commit =>{
			let msg = `${indent}- ${commit.message}  [${commit.id}](${repoUrl}/commit/${commit.id})`
			if(Array.isArray(commit.mr) && commit.mr.length) {
				msg += '\n' + releaseNotes(commit.mr, '  ')
			}
			return msg
		}).join('\n');
	}

	const compareLink = nextTag => `${repoUrl || ''}/compare/${latest}...${nextTag}`;

	const commitRange = util.linkifyCommitRange(repoUrl, `${latest}...${await git.currentBranch()}`);

	console.log(`${chalk.bold('Commits:')}\n${history}\n\n${chalk.bold('Commit Range:')}\n${commitRange}\n`);

	return {
		hasCommits: true,
		releaseNotes,
		compareLink
	};
};

module.exports = async (options, pkg) => {
	const pkgBuild = pkg.build | 0
	const oldVersion = pkg.version + '+' + pkgBuild;
	const extraBaseUrls = ['gitlab.com', 'gitlab.alibaba-inc.com'];
	const repoUrl = pkg.repository && githubUrlFromGit(pkg.repository.url, {extraBaseUrls});
	let isBuild = options.version && semver.parse(options.version).version === pkg.version && options.version !== pkg.version
	// checkIgnoreStrategy(pkg);

	console.log(`\nPublish a new version of ${chalk.bold.magenta(pkg.name)} ${chalk.dim(`(current: ${oldVersion})`)}\n`);

	const prompts = [
		{
			type: 'list',
			name: 'version',
			message: 'Select semver increment or specify new version',
			pageSize: version.SEMVER_INCREMENTS.length + 2,
			choices: version.SEMVER_INCREMENTS
				.map(inc => ({
					name: `${inc} 	${prettyVersionDiff(oldVersion, inc)}`,
					value: inc
				}))
				.concat([
					new inquirer.Separator(),
					{
						name: 'Other (specify)',
						value: null
					}
				]),
			filter: input => {
				isBuild = input === 'build'
				return version.isValidInput(input) ? version(oldVersion).getNewVersionFrom(input) : input
			}
		},
		{
			type: 'input',
			name: 'version',
			message: 'Version',
			when: answers => !answers.version,
			filter: input => version.isValidInput(input) ? version(pkg.version).getNewVersionFrom(input) : input,
			validate: input => {
				if (!version.isValidInput(input)) {
					return 'Please specify a valid semver, for example, `1.2.3`. See http://semver.org';
				}

				if (version(oldVersion).isLowerThanOrEqualTo(input)) {
					return `Version must be greater than ${oldVersion}`;
				}

				return true;
			}
		},
		{
			type: 'list',
			name: 'tag',
			message: 'How should this pre-release version be tagged in npm?',
			when: answers => !pkg.private && version.isPrereleaseOrIncrement(answers.version) && !options.tag,
			choices: async () => {
				const existingPrereleaseTags = await prereleaseTags(pkg.name);

				return [
					...existingPrereleaseTags,
					new inquirer.Separator(),
					{
						name: 'Other (specify)',
						value: null
					}
				];
			}
		},
		{
			type: 'input',
			name: 'tag',
			message: 'Tag',
			when: answers => !pkg.private && version.isPrereleaseOrIncrement(answers.version) && !options.tag && !answers.tag,
			validate: input => {
				if (input.length === 0) {
					return 'Please specify a tag, for example, `next`.';
				}

				if (input.toLowerCase() === 'latest') {
					return 'It\'s not possible to publish pre-releases under the `latest` tag. Please specify something else, for example, `next`.';
				}

				return true;
			}
		},
		{
			type: 'confirm',
			name: 'publishScoped',
			when: isScoped(pkg.name) && !options.exists && options.publish && !pkg.private,
			message: `This scoped repo ${chalk.bold.magenta(pkg.name)} hasn't been published. Do you want to publish it publicly?`,
			default: false
		}
	];

	const {hasCommits, releaseNotes, compareLink} = await printCommitLog(repoUrl);

	if (options.version) {
		return {
			...options,
			confirm: true,
			repoUrl,
			hasCommits,
			releaseNotes,
			compareLink,
			isBuild
		};
	}

	if (!hasCommits) {
		const answers = await inquirer.prompt([{
			type: 'confirm',
			name: 'confirm',
			message: 'No commits found since previous release, continue?',
			default: true
		}]);

		if (!answers.confirm) {
			return {
				...options,
				...answers
			};
		}
	}

	const answers = await inquirer.prompt(prompts);
	// console.log(99999, answers, build)

	return {
		...options,
		...answers,
		confirm: true,
		repoUrl,
		hasCommits,
		releaseNotes,
		compareLink,
		isBuild
	};
};
