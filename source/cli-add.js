#!/usr/bin/env node
'use strict';
// eslint-disable-next-line import/no-unassigned-import
require('symbol-observable'); // Important: This needs to be first to prevent weird Observable incompatibilities
const logSymbols = require('log-symbols');
const meow = require('meow');
const config = require('./config');
const util = require('./util');
const path = require('path')
const fs = require('fs')
const express = require('express')
const bodyParser = require('body-parser')

const open = require('open');
const execa = require('execa')
const onExit = require('signal-exit')
const AnsiToHtml = require('ansi-to-html');

const cli = meow(`
	Usage
	  $ va [args]

	Examples
	  $ va .

`, {
	booleanDefault: undefined,
	flags: {
	}
});


(async () => {

	var convert = new AnsiToHtml({
		newline: true,
		escapeXML: true
	});

	var app = express()
	app.use(bodyParser.json())
	app.get('/', async (req, res)=>{
		await execa('git', ['add', '.'])
		const {stdout} = await execa('git', ['diff', '--cached', '--color'])
		const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
		const result = template.replace('{{DIFF}}', convert.toHtml(stdout))
		res.send(result)
	})
	app.post('/commit', async (req, res)=>{
		console.log(req.body)
		try{
			const {commits} = req.body
			await execa('git', ['add', '.'])
			const args = req.body.args || []
			commits.forEach(msg=>args.push('-m', msg))
			if(args.indexOf('--amend') > -1 && !commits.length) {
				args.unshift('--no-edit')
			}
			const {command, stdout} = await execa('git', ['commit', ...args])
			console.log(command);
			console.log(stdout);
			res.json({ok: 1, command, stdout})
		}catch(e){
			res.json({
				message: e.message
			})
		}
	})
	var server = app.listen(15678, async ()=>{
		const {address, port} = server.address()
		console.log(`listen on:\n${address}:${port}`)
		await open('http://localhost:' + port);
	})
	onExit(function (code, signal) {
		console.log('process exited!')
		server.close()
	})

})().catch(error => {
	console.error(`\n${logSymbols.error} ${error.message}`);
	process.exit(1);
});
