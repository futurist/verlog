'use strict';
const fs = require('fs');
const path = require('path');
const newGithubReleaseUrl = require('./new-github-release-url');
const {getTagVersionPrefix} = require('./util');
const version = require('./version');

module.exports = async (options, pkg, {rootDir, filename = 'CHANGELOG.md'}) => {
	const newVersion = version(pkg.version).getNewVersionFrom(options.version);
	const tag = await getTagVersionPrefix(options) + newVersion;

	const logPath = path.join(rootDir, filename)

	let oldChangeLog = ''
	try{
		oldChangeLog = fs.readFileSync(logPath, 'utf8')
	} catch(e){
		// error read changelog
	}

	const changeLog = `<a name="${tag}"></a>
## [${tag}](${options.compareLink(tag)}) (${new Date().toLocaleString()})

${options.releaseNotes()}


` + oldChangeLog;

	fs.writeFileSync(logPath, changeLog, 'utf8')
};
