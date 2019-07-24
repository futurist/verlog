# verlog

This is a fork of [np](https://github.com/sindresorhus/np)

Generate Version and Changelog for git repo

## Install

```sh
tnpm i -g @ali/verlog
```

## Usage

```sh
ver
```

If you choose `build`, update a build number and commit.

If you choose **other**, run `npm version` and generate a `CHANGELOG.md` file.

After that, `ver` will push all commits.


