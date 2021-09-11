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
const getPort = require('get-port');
const execa = require('execa')
const onExit = require('signal-exit')
const AnsiToHtml = require('ansi-to-html');

const pkg = util.readPkg() || {};

const cli = meow(`
	Usage
	  $ va [args]

	Examples
	  $ va .

`, {
	booleanDefault: undefined,
	flags: {
		verlog: {
			type: 'boolean',
			default: false,
			alias: 'l'
		}
    }
});

if (cli.flags.verlog) {
	const child = cp.spawn(process.execPath, [ __dirname + '/cli.js' ], {
		stdio: 'inherit',
		detached: true
	});
	child.unref();
	process.exit();
}

(async () => {

	var convert = new AnsiToHtml({
		newline: true,
		escapeXML: true
	});

	var app = express()
	app.use(bodyParser.json())
	app.get('/', async (req, res)=>{
		let {stdout: newFiles} = await execa('git', 'ls-files --others --exclude-standard'.split(' '))
		if(newFiles) {
			newFiles = `<b style="color:red">New files:</b><br>${newFiles.split('\n').map(v=>`<div style="color:red">${v}</div>`).join('\n')}<br>`
		}
		let {stdout} = await execa('git', ['diff', '--color'])
		if(!stdout) {
			stdout = (await execa('git', ['diff', '--cached', '--color'])).stdout
		}
		const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
		const result = template
		.replace('{{TITLE}}', pkg.name)
		.replace('{{DIFF}}', newFiles + convert.toHtml(stdout))
		res.send(result)
	})

	// close server if client is offline
	let clients = 0
	let clientTimer
	app.get('/events/', function (req, res) {
		clearTimeout(clientTimer)
		clients++
		req.socket.setTimeout(Math.pow(2, 31) - 1);
		req.on("close", function () {
			clients--
			clientTimer = setTimeout(()=>{
				if(!clients) {
					console.log('client offline')
					process.exit(0)
				}
			}, 1000);
		});
		res.writeHead(200, {
			'Content-Type': 'text/event-stream', // <- Important headers
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		});
		res.write('\n');
	})

	// status check provider
	app.get('/status', (req, res)=>{
		lastStatusCheck = Date.now()
		res.end(pkg.name)
	})
	app.get('/end', (req, res)=>{
		res.end('')
		process.exit(req.query.code|0)
	})
	app.get('/add', async (req, res)=>{
		try{
			const {command, all, exitCode} = await execa('git', ['add', '.'])
			res.json({ok:!exitCode, all, message: exitCode && all})
		}catch(e){
			res.json({error:e.message})
		}
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
			if(args.length === 0){
				res.json({message: 'Cannot commit empty'})
				return
			}
			const {command, stdout, stderr, all, exitCode} = await execa('git', ['commit', ...args])
			console.log(command);
			console.log(all);
			res.json({ok: !exitCode, command, all})
		}catch(e){
			res.json({
				message: e.message
			})
		}
	})
	const PORT = await getPort()
	var server = app.listen(PORT, async ()=>{
		let {address, port} = server.address()
		if(address.startsWith('::')) {
			address = 'localhost'
		}
		let link = `http://${address}:${port}`
		console.log(`listen on:\n${link}`)
		await open(link);
	})
	onExit(function (code, signal) {
		console.log('process exited!')
		server.close()
	})

})().catch(error => {
	console.error(`\n${logSymbols.error} ${error.message}`);
	process.exit(1);
});
