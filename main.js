#!/usr/bin/env node

// console.log(process.argv)
const Linq = require("linq2mysql"), server = require("./server"), fs = require("fs").promises;
const package = require("./package.json"), { mysqlPath } = require("@zsea/amis-server");
const { Command } = require('commander');
const program = new Command();
program.name("hadmin")
    .description('Create an administrative backend with a single command.')
    .version(package.version);
program.command("start")
    .description("Launch the management backend.")
    .option("-d, --db <string>", "the database connection string.")
    .option("--db:type [string]", "the database type, only MySQL is supported.", "mysql")
    .option("-p, --port [number]", "web service port.", 8080)
    .option("-s, --secret [string]", "secret key used for generating tokens.", "hadmin")
    .option("-r, --router [string...]", "custom route file.")
    .option("--logo [string]", "custom logo icon file.")
    .option("--cookie [string]", "the name of the cookie for storing tokens.", "h-token")
    .option("--asar [string]", "asar file path")
    .option("-c, --config <string>", "path to the configuration file. the configuration file must be in JSON format.")
    .action(function (options) {
        const opt = Object.assign({}, options);
        if (isNaN(opt.port)) {
            console.log(`error: option '-p, --port' must is a number`);
        }
        opt.port = parseInt(opt.port)
        Start(opt)
    })
    ;
program.command("init")
    .description("Initialize the database structure.")
    .requiredOption("-d, --db <string>", "the database connection string.")
    .option("--db:type [string]", "the database type, only MySQL is supported.", "mysql")
    .action(function (options) {
        //console.log('开始初始化数据库...',mysqlPath);
        // console.log(db);
        Init(options);
    });
async function Start(options) {
    //let options = getOptions();
    if (options["config"]) {
        const txt = await fs.readFile(options["config"], { encoding: "utf-8" });
        options = JSON.parse(txt);
    }
    if (!options["db"]) {
        console.log("required option '-d, --db' not specified");
        return;

    }
    options.db = new Linq(options.db);
    if (options.dbs) {
        const dbs = {};
        for (let key in options.dbs) {
            dbs[key] = new Linq(options.dbs[key]);
        }
        options.dbs = dbs;
    }
    //console.log(options);
    server.Startup(options);
}
async function Init(options) {
    const sql = await fs.readFile(mysqlPath, { encoding: "utf-8" });
    const db=new Linq(options.db);
    await db.execute(sql);
    console.log('[HAdmin] Database initialization complete.');
    process.exit()
}
program.parse();

if (program.args.length === 0) {
    program.help();
    return;
}

// const command = process.argv[2];
// if (command === "start") {
//     Start();
// }
// else {
//     //console.log('unknow command');
//     console.table(["apples", "oranges", "bananas"]);
// }