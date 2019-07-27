# verlog

This is a fork of [np](https://github.com/sindresorhus/np), but heavily modified.


Generate Version and Changelog for git repo

## Install

```sh
tnpm i -g verlog
```

## Usage

Run `vl` or `ver` from your repo.

If you choose `build`, update a build number and commit.

If you choose **other**, run `npm version` and generate a `CHANGELOG.md` file.

After that, `ver` will push all commits.


